"""Check invalid data and queue capacity before expensive fitting."""

from sqlalchemy.orm import Session

from backend.models import TrainingConfig, TrainingRun
from backend.tests.test_ml import account, churn_csv, upload, write


def test_queue_capacity_and_invalid_features(api):
    client, engine, _path = api
    csrf = account(client, "queue@example.com")
    dataset = upload(client, csrf, "data.csv", churn_csv())
    payload = {
        "datasetId": dataset["id"],
        "task": "classification",
        "target": "churn",
        "features": ["age"],
        "algorithms": ["logistic_regression"],
    }
    assert (
        write(
            client, csrf, "POST", "/api/ml/runs", json={**payload, "features": ["churn"]}
        ).status_code
        == 400
    )
    with Session(engine) as db:
        from backend.models import Dataset

        owner = db.get(Dataset, dataset["id"]).owner_id
        config = TrainingConfig(owner_id=owner, dataset_id=dataset["id"], config_json="{}")
        db.add(config)
        db.flush()
        for _ in range(4):
            db.add(TrainingRun(owner_id=owner, config_id=config.id, status="queued"))
        db.commit()
    limited = write(client, csrf, "POST", "/api/ml/runs", json=payload)
    assert limited.status_code == 503
    assert limited.headers["Retry-After"] == "30"
