"""Real training, persisted inference, lifecycle, and account isolation."""

import csv
import io
import math
import time

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.main import app
from backend.models import TrainingConfig, TrainingRun


def account(client, email):
    response = client.post(
        "/api/auth/register",
        json={
            "display_name": email.split("@")[0],
            "email": email,
            "password": "correct horse battery staple",
            "password_confirmation": "correct horse battery staple",
        },
    )
    assert response.status_code == 201
    return response.json()["csrfToken"]


def write(client, csrf, method, path, **kwargs):
    return client.request(method, path, headers={"X-CSRF-Token": csrf}, **kwargs)


def upload(client, csrf, name, contents):
    response = write(
        client,
        csrf,
        "POST",
        "/api/datasets",
        files={"file": (name, contents, "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def wait_for_run(client, run_id, expected="completed"):
    for _ in range(200):
        response = client.get(f"/api/ml/runs/{run_id}")
        assert response.status_code == 200
        run = response.json()
        if run["status"] not in {"queued", "running"}:
            assert run["status"] == expected, run
            return run
        time.sleep(0.05)
    raise AssertionError("training did not finish")


def churn_csv():
    rows = ["age,city,monthly_spend,note,churn"]
    for index in range(80):
        age = "" if index in {7, 28} else str(20 + index % 35)
        city = ["Delhi", "Pune", "Jaipur"][index % 3]
        spend = 300 + index * 9
        churn = "" if index == 79 else "Yes" if index % 4 in {0, 1} else "No"
        rows.append(f"{age},{city},{spend},customer-{index:03d},{churn}")
    return "\n".join(rows).encode()


def test_classification_saved_predictions_isolation_and_cleanup(api):
    client, _engine, tmp_path = api
    csrf = account(client, "trainer@example.com")
    dataset = upload(client, csrf, "Churn.csv", churn_csv())
    schema = client.get(f"/api/ml/datasets/{dataset['id']}/schema").json()
    note = next(item for item in schema["columns"] if item["name"] == "note")
    assert any("High cardinality" in warning for warning in note["warnings"])

    invalid = write(
        client,
        csrf,
        "POST",
        "/api/ml/runs",
        json={
            "datasetId": dataset["id"],
            "task": "classification",
            "target": "churn",
            "features": ["note"],
            "algorithms": ["logistic_regression"],
        },
    )
    assert invalid.status_code == 400
    assert "unsupported" in invalid.json()["detail"]

    created = write(
        client,
        csrf,
        "POST",
        "/api/ml/runs",
        json={
            "datasetId": dataset["id"],
            "task": "classification",
            "target": "churn",
            "features": ["age", "city", "monthly_spend"],
            "algorithms": ["logistic_regression", "random_forest_classifier"],
            "testSize": 0.25,
            "randomSeed": 17,
        },
    )
    assert created.status_code == 202, created.text
    run = wait_for_run(client, created.json()["id"])
    assert len(run["result"]["models"]) == 2
    first = run["result"]["models"][0]
    matrix = first["confusionMatrix"]
    measured_accuracy = sum(matrix[i][i] for i in range(len(matrix))) / sum(map(sum, matrix))
    assert math.isclose(measured_accuracy, first["metrics"]["accuracy"])
    assert first["averaging"] == "macro"
    assert first["trainRows"] == 59 and first["testRows"] == 20
    assert first["targetRowsOmitted"] == 1
    assert first["metrics"]["baselineAccuracy"] == 0.5
    model_id = first["modelId"]
    assert len(list((tmp_path / "models").glob("*.joblib"))) == 2

    selected = write(client, csrf, "POST", f"/api/ml/models/{model_id}/select")
    assert selected.status_code == 200 and selected.json()["selected"] is True
    single = write(
        client,
        csrf,
        "POST",
        f"/api/ml/models/{model_id}/predict",
        json={"record": {"age": "", "city": "New city", "monthly_spend": 725}},
    )
    assert single.status_code == 200, single.text
    assert single.json()["prediction"] in {"Yes", "No"}
    assert math.isclose(sum(single.json()["probabilities"].values()), 1.0)
    missing = write(
        client,
        csrf,
        "POST",
        f"/api/ml/models/{model_id}/predict",
        json={"record": {"age": 30, "monthly_spend": 500}},
    )
    assert missing.status_code == 400 and "city" in missing.json()["detail"]

    batch = write(
        client,
        csrf,
        "POST",
        f"/api/ml/models/{model_id}/predict-batch",
        files={
            "file": (
                "batch.csv",
                b"age,city,monthly_spend\n24,Delhi,450\n,Unknown,700\n55,Pune,900\n",
                "text/csv",
            )
        },
    )
    assert batch.status_code == 200, batch.text
    rows = list(csv.DictReader(io.StringIO(batch.text)))
    assert [row["age"] for row in rows] == ["24", "", "55"]
    assert all(row["prediction"] in {"Yes", "No"} for row in rows)
    assert len(client.get("/api/ml/predictions").json()) == 2

    with TestClient(app) as restarted:
        login = restarted.post(
            "/api/auth/login",
            json={
                "email": "trainer@example.com",
                "password": "correct horse battery staple",
            },
        )
        assert login.status_code == 200
        restarted_csrf = login.json()["csrfToken"]
        assert restarted.get(f"/api/ml/runs/{run['id']}").json()["status"] == "completed"
        again = write(
            restarted,
            restarted_csrf,
            "POST",
            f"/api/ml/models/{model_id}/predict",
            json={"record": {"age": 44, "city": "Delhi", "monthly_spend": 650}},
        )
        assert again.status_code == 200

    with TestClient(app) as other:
        other_csrf = account(other, "other@example.com")
        for path in [
            f"/api/ml/datasets/{dataset['id']}/schema",
            f"/api/ml/runs/{run['id']}",
            f"/api/ml/models/{model_id}",
        ]:
            assert other.get(path).status_code == 404
        assert (
            write(
                other,
                other_csrf,
                "POST",
                f"/api/ml/models/{model_id}/predict",
                json={"record": {"age": 1, "city": "Delhi", "monthly_spend": 1}},
            ).status_code
            == 404
        )
        assert write(other, other_csrf, "DELETE", f"/api/ml/runs/{run['id']}").status_code == 404

    assert write(client, csrf, "DELETE", f"/api/datasets/{dataset['id']}").status_code == 204
    assert not list((tmp_path / "models").glob("*.joblib"))
    assert client.get(f"/api/ml/runs/{run['id']}").status_code == 404


def test_regression_metrics_and_invalid_training_fail_cleanly(api):
    client, engine, _tmp_path = api
    csrf = account(client, "regression@example.com")
    rows = ["area,rooms,area_type,rent"]
    for index in range(60):
        area = 500 + index * 20
        rooms = 1 + index % 4
        kind = "apartment" if index % 2 else "house"
        rent = 5000 + area * 12 + rooms * 800 + (1000 if kind == "house" else 0)
        rows.append(f"{area},{rooms},{kind},{rent}")
    dataset = upload(client, csrf, "Rent.csv", "\n".join(rows).encode())
    created = write(
        client,
        csrf,
        "POST",
        "/api/ml/runs",
        json={
            "datasetId": dataset["id"],
            "task": "regression",
            "target": "rent",
            "features": ["area", "rooms", "area_type"],
            "algorithms": ["ridge_regression", "random_forest_regressor"],
        },
    )
    run = wait_for_run(client, created.json()["id"])
    for result in run["result"]["models"]:
        pairs = result["actualVsPredicted"]
        mae = sum(abs(item["actual"] - item["predicted"]) for item in pairs) / len(pairs)
        assert math.isclose(mae, result["metrics"]["mae"])
        assert result["metrics"]["rmse"] >= result["metrics"]["mae"]

    no_features = write(
        client,
        csrf,
        "POST",
        "/api/ml/runs",
        json={
            "datasetId": dataset["id"],
            "task": "regression",
            "target": "rent",
            "features": [],
            "algorithms": ["ridge_regression"],
        },
    )
    assert no_features.status_code == 400

    tiny = upload(client, csrf, "Tiny.csv", b"value,label\n1,A\n2,A\n3,B\n")
    failed = write(
        client,
        csrf,
        "POST",
        "/api/ml/runs",
        json={
            "datasetId": tiny["id"],
            "task": "classification",
            "target": "label",
            "features": ["value"],
            "algorithms": ["logistic_regression"],
        },
    )
    failed_run = wait_for_run(client, failed.json()["id"], "failed")
    assert "at least 20 rows" in failed_run["result"]["error"]
    assert client.get("/api/health").status_code == 200

    owner_id = client.get("/api/auth/me").json()["user"]["id"]
    with Session(engine, expire_on_commit=False) as db:
        config = TrainingConfig(
            owner_id=owner_id,
            project_id=None,
            dataset_id=dataset["id"],
            config_json="{}",
        )
        db.add(config)
        db.flush()
        interrupted = TrainingRun(owner_id=owner_id, config_id=config.id, status="running")
        db.add(interrupted)
        db.commit()
        interrupted_id = interrupted.id
    with TestClient(app):
        pass
    with Session(engine) as db:
        recovered = db.get(TrainingRun, interrupted_id)
        assert recovered.status == "interrupted"
        assert "restart" in recovered.result_json
