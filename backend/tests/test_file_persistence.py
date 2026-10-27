"""Exercise durable file bytes with an empty disposable cache and separate sessions."""

import json

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend.database import make_engine
from backend.main import app
from backend.migrate_database import copy_workspace
from backend.models import Dataset, ModelMetadata
from backend.tests.test_ml import account, churn_csv, upload, wait_for_run, write


def test_files_survive_empty_cache_and_new_application_session(api):
    client, engine, tmp_path = api
    csrf = account(client, "durable@example.com")
    contents = churn_csv()
    dataset = upload(client, csrf, "Churn.csv", contents)
    with Session(engine) as db:
        saved = db.get(Dataset, dataset["id"])
        assert "content_bytes" in inspect(saved).unloaded
        assert saved.content_bytes == contents
        dataset_path = tmp_path / "uploads" / saved.stored_name
    dataset_path.unlink()
    assert client.get("/api/datasets").json()[0]["hasFile"] is True
    # Train with only database bytes: no local original remains.
    run_response = write(
        client,
        csrf,
        "POST",
        "/api/ml/runs",
        json={
            "datasetId": dataset["id"],
            "task": "classification",
            "target": "churn",
            "features": ["age", "city", "monthly_spend"],
            "algorithms": ["logistic_regression"],
        },
    )
    assert run_response.status_code == 202, run_response.text
    run = wait_for_run(client, run_response.json()["id"])
    model_id = run["result"]["models"][0]["modelId"]
    with Session(engine) as db:
        model = db.get(ModelMetadata, model_id)
        assert "artifact_bytes" in inspect(model).unloaded
        assert model.artifact_bytes
        model_path = tmp_path / "models" / json.loads(model.metadata_json)["artifactName"]
    model_path.unlink()
    dataset_path.unlink()
    engine.dispose()
    with TestClient(app) as other, TestClient(app) as anonymous:
        other_csrf = account(other, "other-durable@example.com")
        assert other.get(f"/api/datasets/{dataset['id']}/download").status_code == 404
        assert (
            write(
                other,
                other_csrf,
                "POST",
                f"/api/ml/models/{model_id}/predict",
                json={"record": {"age": 30, "city": "Delhi", "monthly_spend": 500}},
            ).status_code
            == 404
        )
        assert anonymous.get(f"/api/datasets/{dataset['id']}/download").status_code == 401
        assert not model_path.exists() and not dataset_path.exists()
    with TestClient(app) as restarted:
        login = restarted.post(
            "/api/auth/login",
            json={
                "email": "durable@example.com",
                "password": "correct horse battery staple",
            },
        )
        assert login.status_code == 200
        assert restarted.get(f"/api/datasets/{dataset['id']}/download").content == contents
        prediction = write(
            restarted,
            login.json()["csrfToken"],
            "POST",
            f"/api/ml/models/{model_id}/predict",
            json={
                "record": {"age": 30, "city": "Delhi", "monthly_spend": 500},
            },
        )
        assert prediction.status_code == 200, prediction.text
        assert model_path.is_file() and dataset_path.is_file()
        delete = write(
            restarted, login.json()["csrfToken"], "DELETE", f"/api/datasets/{dataset['id']}"
        )
        assert delete.status_code == 204
        assert not model_path.exists() and not dataset_path.exists()
    with Session(engine) as db:
        assert db.get(Dataset, dataset["id"]) is None
        assert db.get(ModelMetadata, model_id) is None


def test_provider_copy_preserves_bytes_and_refuses_occupied_target(api, monkeypatch):
    client, source, tmp_path = api
    csrf = account(client, "copy@example.com")
    data = upload(client, csrf, "Original.csv", churn_csv())
    # Emulate an old filesystem-only record which must be embedded in the copy.
    with Session(source) as db:
        db.get(Dataset, data["id"]).content_bytes = None
        db.commit()
    target_url = f"sqlite:///{(tmp_path / 'destination.db').as_posix()}"
    monkeypatch.setenv("MINDMESH_MIGRATION_DATABASE_URL", target_url)
    command.upgrade(Config("alembic.ini"), "head")
    target = make_engine(target_url)
    try:
        copy_workspace(source, target, dry_run=True)
        with Session(target) as db:
            assert db.scalar(select(Dataset)) is None
        counts = copy_workspace(source, target)
        assert counts["datasets"] == 1
        with Session(target) as db:
            assert db.get(Dataset, data["id"]).content_bytes == churn_csv()
        with Session(source) as db:
            assert db.get(Dataset, data["id"]).content_bytes is None
        with pytest.raises(RuntimeError, match="empty"):
            copy_workspace(source, target)
        with pytest.raises(RuntimeError, match="different"):
            copy_workspace(source, source)
    finally:
        target.dispose()


def test_missing_legacy_file_rolls_back_the_entire_copy(api, monkeypatch):
    client, source, tmp_path = api
    csrf = account(client, "rollback-copy@example.com")
    data = upload(client, csrf, "Original.csv", churn_csv())
    with Session(source) as db:
        dataset = db.get(Dataset, data["id"])
        dataset.content_bytes = None
        stored_name = dataset.stored_name
        db.commit()
    (tmp_path / "uploads" / stored_name).unlink()
    target_url = f"sqlite:///{(tmp_path / 'empty-destination.db').as_posix()}"
    monkeypatch.setenv("MINDMESH_MIGRATION_DATABASE_URL", target_url)
    command.upgrade(Config("alembic.ini"), "head")
    target = make_engine(target_url)
    try:
        with pytest.raises(FileNotFoundError):
            copy_workspace(source, target)
        from backend.models import User

        with Session(target) as db:
            assert db.scalar(select(User)) is None
        with Session(source) as db:
            assert db.get(Dataset, data["id"]) is not None
    finally:
        target.dispose()
