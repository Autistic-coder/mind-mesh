from fastapi.testclient import TestClient

from backend import assistant
from backend.main import app
from backend.tests.test_ml import account, churn_csv, upload, write


def test_assistant_setup_privacy_ownership_and_persistence(api, monkeypatch):
    client, _engine, _path = api
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    csrf = account(client, "assistant@example.com")
    assert client.get("/api/assistant/status").json() == {"configured": False}
    dataset = upload(client, csrf, "private-name.csv", churn_csv())
    context = write(
        client, csrf, "POST", "/api/assistant/context", json={"datasetId": dataset["id"]}
    )
    assert context.status_code == 200
    assert (
        "private-name" not in context.text
        and "Delhi" not in context.text
        and "monthly_spend" not in context.text
    )
    conversation = write(client, csrf, "POST", "/api/assistant/conversations").json()["id"]
    path = f"/api/assistant/conversations/{conversation}"
    missing = write(
        client, csrf, "POST", path + "/messages", json={"message": "Help me choose a task"}
    )
    assert missing.status_code == 503
    assert client.get(path).json() == []
    sent = []

    def generate(messages):
        sent.extend(messages)
        return "This is a mocked provider response for the integration test."

    monkeypatch.setattr(assistant, "generate", generate)
    forbidden = write(
        client,
        csrf,
        "POST",
        path + "/messages",
        json={"message": "Help", "datasetId": dataset["id"]},
    )
    assert forbidden.status_code == 400
    response = write(
        client,
        csrf,
        "POST",
        path + "/messages",
        json={
            "message": "Explain missing values",
            "datasetId": dataset["id"],
            "shareContext": True,
        },
    )
    assert response.status_code == 200
    assert len(client.get(path).json()) == 2
    assert "Delhi" not in str(sent) and "monthly_spend" not in str(sent)
    with TestClient(app) as other:
        other_csrf = account(other, "assistant-other@example.com")
        assert other.get(path).status_code == 404
        assert write(other, other_csrf, "DELETE", path).status_code == 404
        assert (
            write(
                other,
                other_csrf,
                "POST",
                "/api/assistant/context",
                json={"datasetId": dataset["id"]},
            ).status_code
            == 404
        )
    assert write(client, csrf, "DELETE", path).status_code == 204
    assert client.get(path).status_code == 404


def test_provider_errors_do_not_persist_or_expose_details(api, monkeypatch):
    from fastapi import HTTPException

    client, _engine, _path = api
    csrf = account(client, "assistant-failure@example.com")
    conversation = write(client, csrf, "POST", "/api/assistant/conversations").json()["id"]

    def fail(_messages):
        raise HTTPException(503, "Provider temporarily unavailable.")

    monkeypatch.setattr(assistant, "generate", fail)
    path = f"/api/assistant/conversations/{conversation}"
    assert (
        write(client, csrf, "POST", path + "/messages", json={"message": "Help"}).status_code == 503
    )
    assert client.get(path).json() == []
