"""Expensive account operations use configurable database-backed limits."""


def _account(client):
    response = client.post(
        "/api/auth/register",
        json={
            "display_name": "Rate Tester",
            "email": "rate@example.com",
            "password": "correct horse battery staple",
            "password_confirmation": "correct horse battery staple",
        },
    )
    return response.json()["csrfToken"]


def test_expensive_routes_limit_before_repeating_work(api, monkeypatch):
    client, _engine, _tmp_path = api
    csrf = _account(client)
    headers = {"X-CSRF-Token": csrf}
    monkeypatch.setenv("MINDMESH_RATE_UPLOAD_PER_MINUTE", "1")
    monkeypatch.setenv("MINDMESH_RATE_TRAIN_PER_MINUTE", "1")
    monkeypatch.setenv("MINDMESH_RATE_PREDICT_PER_MINUTE", "1")
    monkeypatch.setenv("MINDMESH_RATE_BATCH_PREDICT_PER_MINUTE", "1")

    dataset = {"file": ("data.csv", b"feature,target\n1,yes\n2,no\n", "text/csv")}
    assert client.post("/api/datasets", files=dataset, headers=headers).status_code == 201
    assert client.post("/api/datasets", files=dataset, headers=headers).status_code == 429

    run_payload = {
        "datasetId": "missing",
        "task": "classification",
        "target": "target",
        "features": ["feature"],
        "algorithms": ["logistic-regression"],
    }
    assert client.post("/api/ml/runs", json=run_payload, headers=headers).status_code == 404
    assert client.post("/api/ml/runs", json=run_payload, headers=headers).status_code == 429

    prediction = {"record": {"feature": 1}}
    assert (
        client.post("/api/ml/models/missing/predict", json=prediction, headers=headers).status_code
        == 404
    )
    assert (
        client.post("/api/ml/models/missing/predict", json=prediction, headers=headers).status_code
        == 429
    )

    files = {"file": ("batch.csv", b"feature\n1\n", "text/csv")}
    assert (
        client.post(
            "/api/ml/models/missing/predict-batch", files=files, headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/ml/models/missing/predict-batch", files=files, headers=headers
        ).status_code
        == 429
    )
