"""Exact resource IDs must not cross account boundaries."""

from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from backend.main import app
from backend.models import Dataset, Project

CSV = b"age,income,outcome\n25,40000,Yes\n40,75000,No\n"


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


def test_two_accounts_cannot_access_exact_ids_or_forge_ownership(api):
    alice, engine, tmp_path = api
    csrf_a = account(alice, "alice@example.com")
    with TestClient(app) as bob, TestClient(app) as anonymous:
        csrf_b = account(bob, "bob@example.com")
        project_a = write(
            alice,
            csrf_a,
            "POST",
            "/api/projects",
            json={"name": "Private research", "description": "Mine"},
        )
        assert project_a.status_code == 201
        project_id = project_a.json()["id"]
        upload = write(
            alice,
            csrf_a,
            "POST",
            "/api/datasets",
            data={"project_id": project_id},
            files={"file": ("Research.csv", CSV, "text/csv")},
        )
        assert upload.status_code == 201, upload.text
        dataset_id = upload.json()["id"]
        assert upload.json()["rowCount"] == 2
        assert upload.json()["preview"][0] == ["25", "40000", "Yes"]
        assert upload.json()["hasFile"] is True
        assert upload.json()["originalFilename"] == "Research.csv"
        assert upload.json()["fileFormat"] == "CSV"
        assert upload.json()["sizeBytes"] == len(CSV)
        assert upload.json()["sheetName"] is None
        download = alice.get(f"/api/datasets/{dataset_id}/download")
        assert download.content == CSV
        assert "no-store" in download.headers["Cache-Control"]
        assert alice.get(f"/api/datasets/{dataset_id}/preview").json()["rowCount"] == 2
        assert len(list((tmp_path / "uploads").iterdir())) == 1
        assert not (tmp_path / "uploads" / "Research.csv").exists()

        assert bob.get("/api/workspace").json()["projects"] == []
        assert bob.get("/api/projects", params={"owner_id": project_a.json()["id"]}).json() == []
        assert bob.get("/api/datasets").json() == []
        for path in [
            f"/api/projects/{project_id}",
            f"/api/datasets/{dataset_id}",
            f"/api/datasets/{dataset_id}/preview",
            f"/api/datasets/{dataset_id}/download",
        ]:
            assert bob.get(path).status_code == 404
            assert anonymous.get(path).status_code == 401
        assert anonymous.get("/api/workspace").status_code == 401
        assert anonymous.get("/api/projects").status_code == 401
        assert anonymous.get("/api/datasets").status_code == 401
        assert write(anonymous, csrf_b, "DELETE", f"/api/projects/{project_id}").status_code == 401
        assert write(anonymous, csrf_b, "DELETE", f"/api/datasets/{dataset_id}").status_code == 401

        assert (
            write(
                bob,
                csrf_b,
                "PATCH",
                f"/api/projects/{project_id}",
                json={"name": "Stolen"},
            ).status_code
            == 404
        )
        assert write(bob, csrf_b, "DELETE", f"/api/projects/{project_id}").status_code == 404
        assert (
            write(
                bob,
                csrf_b,
                "PATCH",
                f"/api/datasets/{dataset_id}",
                json={"projectId": None},
            ).status_code
            == 404
        )
        assert write(bob, csrf_b, "DELETE", f"/api/datasets/{dataset_id}").status_code == 404
        assert (
            write(
                bob,
                csrf_b,
                "POST",
                "/api/projects",
                json={"name": "Fake", "owner_id": project_a.json()["id"]},
            ).status_code
            == 422
        )
        assert (
            write(
                bob,
                csrf_b,
                "PATCH",
                f"/api/datasets/{dataset_id}",
                json={"projectId": None, "owner_id": project_a.json()["id"]},
            ).status_code
            == 422
        )
        project_b = write(bob, csrf_b, "POST", "/api/projects", json={"name": "Bob's work"}).json()[
            "id"
        ]
        assert (
            write(
                alice,
                csrf_a,
                "PATCH",
                f"/api/datasets/{dataset_id}",
                json={"projectId": project_b},
            ).status_code
            == 404
        )
        assert (
            write(
                bob,
                csrf_b,
                "POST",
                "/api/datasets",
                data={"project_id": project_id},
                files={"file": ("Other.csv", CSV, "text/csv")},
            ).status_code
            == 404
        )
        assert (
            write(
                alice,
                csrf_a,
                "PATCH",
                f"/api/datasets/{dataset_id}",
                json={"projectId": None},
            ).status_code
            == 200
        )
        assert (
            write(
                alice,
                csrf_a,
                "PATCH",
                f"/api/projects/{project_id}",
                json={"name": "Renamed"},
            ).json()["name"]
            == "Renamed"
        )
        assert write(alice, csrf_a, "DELETE", f"/api/projects/{project_id}").status_code == 204
        assert alice.get(f"/api/datasets/{dataset_id}").json()["projectId"] is None
        assert bob.get(f"/api/projects/{project_b}").status_code == 200

        with DbSession(engine) as db:
            dataset = db.scalar(select(Dataset).where(Dataset.id == dataset_id))
            assert dataset.owner_id != db.get(Project, project_b).owner_id
        assert write(alice, csrf_a, "DELETE", f"/api/datasets/{dataset_id}").status_code == 204
        assert not list((tmp_path / "uploads").iterdir())
        alice_user_id = alice.get("/api/auth/me").json()["user"]["id"]
        forged_upload = write(
            bob,
            csrf_b,
            "POST",
            "/api/datasets",
            data={"owner_id": alice_user_id},
            files={"file": ("Forged.csv", CSV, "text/csv")},
        )
        assert forged_upload.status_code == 201
        assert alice.get(f"/api/datasets/{forged_upload.json()['id']}").status_code == 404
        assert bob.get(f"/api/datasets/{forged_upload.json()['id']}").status_code == 200


def test_upload_validation_and_worksheet_selection(api):
    client, _engine, tmp_path = api
    csrf = account(client, "sheets@example.com")
    for name, contents in [
        ("../private.csv", CSV),
        ("malware.exe", CSV),
        ("bad.csv", b"a,a\n1,2\n"),
        ("bad.xlsx", b"not a workbook"),
        ("oversize.csv", b"a\n" + b"x" * (25 * 1024 * 1024)),
    ]:
        result = write(
            client,
            csrf,
            "POST",
            "/api/datasets",
            files={"file": (name, contents, "application/octet-stream")},
        )
        assert result.status_code == 400, (name, result.text)
    assert not list((tmp_path / "uploads").iterdir())

    book = Workbook()
    book.active.title = "First"
    book.active.append(["x", "y"])
    book.active.append([1, 2])
    second = book.create_sheet("Rent")
    second.append(["area", "rent"])
    second.append([500, 1200])
    output = BytesIO()
    book.save(output)
    bytes_ = output.getvalue()
    no_sheet = write(
        client,
        csrf,
        "POST",
        "/api/datasets",
        files={
            "file": (
                "Homes.xlsx",
                bytes_,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert no_sheet.status_code == 400
    chosen = write(
        client,
        csrf,
        "POST",
        "/api/datasets",
        data={"sheet_name": "Rent"},
        files={
            "file": (
                "Homes.xlsx",
                bytes_,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert chosen.status_code == 201, chosen.text
    assert chosen.json()["name"] == "Homes · Rent"
    assert chosen.json()["sheetName"] == "Rent"
    assert chosen.json()["fileFormat"] == "XLSX"
    assert chosen.json()["originalFilename"] == "Homes.xlsx"
    assert chosen.json()["sizeBytes"] == len(bytes_)
    assert chosen.json()["preview"] == [[500, 1200]]
    assert client.get(f"/api/datasets/{chosen.json()['id']}").json()["sheetName"] == "Rent"
    assert client.get("/api/datasets").json()[0]["sheetName"] == "Rent"
    assert client.get(f"/api/datasets/{chosen.json()['id']}/download").content == bytes_


def test_workspace_survives_new_client_and_requires_csrf(api):
    client, engine, _tmp_path = api
    csrf = account(client, "persist@example.com")
    created = write(client, csrf, "POST", "/api/projects", json={"name": "After restart"})
    assert created.status_code == 201
    uploaded = write(
        client,
        csrf,
        "POST",
        "/api/datasets",
        files={"file": ("Persistent.csv", CSV, "text/csv")},
    )
    assert uploaded.status_code == 201
    assert client.post("/api/projects", json={"name": "No CSRF"}).status_code == 403
    assert (
        client.post(
            "/api/projects",
            headers={"Origin": "https://wrong.example", "X-CSRF-Token": csrf},
            json={"name": "Wrong origin"},
        ).status_code
        == 403
    )
    engine.dispose()
    with TestClient(app) as restarted:
        login = restarted.post(
            "/api/auth/login",
            json={
                "email": "persist@example.com",
                "password": "correct horse battery staple",
            },
        )
        assert login.status_code == 200
        workspace = restarted.get("/api/workspace")
        assert [item["name"] for item in workspace.json()["projects"]] == ["After restart"]
        assert [item["name"] for item in workspace.json()["datasets"]] == ["Persistent"]
        assert workspace.json()["datasets"][0]["originalFilename"] == "Persistent.csv"
        assert workspace.json()["datasets"][0]["sizeBytes"] == len(CSV)
        assert restarted.get(f"/api/datasets/{uploaded.json()['id']}/download").content == CSV


def test_profile_and_workspace_reset_affect_only_current_account(api):
    alice, _engine, tmp_path = api
    csrf_a = account(alice, "reset-alice@example.com")
    with TestClient(app) as bob:
        csrf_b = account(bob, "reset-bob@example.com")
        project_a = write(alice, csrf_a, "POST", "/api/projects", json={"name": "Alice only"})
        project_b = write(bob, csrf_b, "POST", "/api/projects", json={"name": "Bob only"})
        uploaded = write(
            alice,
            csrf_a,
            "POST",
            "/api/datasets",
            files={"file": ("Alice.csv", CSV, "text/csv")},
        )
        assert uploaded.status_code == 201
        assert (
            write(alice, csrf_a, "PATCH", "/api/auth/profile", json={"display_name": "Ada"}).json()[
                "displayName"
            ]
            == "Ada"
        )
        assert alice.get("/api/workspace").json()["displayName"] == "Ada"
        assert bob.get("/api/workspace").json()["displayName"] == "reset-bob"
        assert alice.delete("/api/workspace").status_code == 403
        assert write(alice, csrf_a, "DELETE", "/api/workspace").status_code == 204
        assert alice.get("/api/workspace").json()["projects"] == []
        assert alice.get("/api/workspace").json()["datasets"] == []
        assert alice.get(f"/api/projects/{project_a.json()['id']}").status_code == 404
        assert alice.get(f"/api/datasets/{uploaded.json()['id']}/download").status_code == 404
        assert bob.get(f"/api/projects/{project_b.json()['id']}").status_code == 200
        assert not list((tmp_path / "uploads").iterdir())


def test_explicit_legacy_import_creates_private_copies_without_files(api):
    alice, _engine, _tmp_path = api
    csrf_a = account(alice, "legacy-alice@example.com")
    with TestClient(app) as bob, TestClient(app) as anonymous:
        csrf_b = account(bob, "legacy-bob@example.com")
        source = {
            "version": 2,
            "displayName": "Old browser user",
            "projects": [
                {
                    "id": "old-project",
                    "name": "Old work",
                    "description": "Notes",
                    "updatedAt": "2025-01-01T00:00:00Z",
                }
            ],
            "datasets": [
                {
                    "id": "old-data",
                    "name": "Old data",
                    "projectId": "old-project",
                    "columns": [
                        {
                            "name": "value",
                            "type": "number",
                            "missing": 0,
                            "uniqueCount": 30,
                            "values": [str(i) for i in range(30)],
                        }
                    ],
                    "rowCount": 1,
                    "preview": [[42]],
                    "createdAt": "2025-01-01T00:00:00Z",
                }
            ],
        }
        assert bob.get("/api/workspace").json()["projects"] == []
        assert anonymous.post("/api/workspace/import", json=source).status_code == 401
        assert alice.post("/api/workspace/import", json=source).status_code == 403
        forged = {**source, "owner_id": "old-project"}
        assert write(bob, csrf_b, "POST", "/api/workspace/import", json=forged).status_code == 422
        forged_project = {
            **source,
            "projects": [{**source["projects"][0], "owner_id": "old-project"}],
        }
        assert (
            write(bob, csrf_b, "POST", "/api/workspace/import", json=forged_project).status_code
            == 422
        )
        forged_dataset = {
            **source,
            "datasets": [{**source["datasets"][0], "owner_id": "old-project"}],
        }
        assert (
            write(bob, csrf_b, "POST", "/api/workspace/import", json=forged_dataset).status_code
            == 422
        )
        imported = write(alice, csrf_a, "POST", "/api/workspace/import", json=source)
        assert imported.status_code == 201, imported.text
        assert imported.json() == {"projectsImported": 1, "datasetsImported": 1}
        owned = alice.get("/api/workspace").json()
        project_id = owned["projects"][0]["id"]
        dataset_id = owned["datasets"][0]["id"]
        assert project_id != "old-project" and dataset_id != "old-data"
        assert owned["datasets"][0]["projectId"] == project_id
        assert owned["datasets"][0]["hasFile"] is False
        assert owned["datasets"][0]["originalFilename"] is None
        assert owned["datasets"][0]["sizeBytes"] is None
        assert owned["datasets"][0]["sheetName"] is None
        assert alice.get(f"/api/datasets/{dataset_id}/download").status_code == 404
        assert bob.get("/api/workspace").json()["projects"] == []
        for path in (
            f"/api/projects/{project_id}",
            f"/api/datasets/{dataset_id}",
            f"/api/datasets/{dataset_id}/preview",
            f"/api/datasets/{dataset_id}/download",
        ):
            assert bob.get(path).status_code == 404
        assert write(bob, csrf_b, "DELETE", f"/api/projects/{project_id}").status_code == 404
        assert write(bob, csrf_b, "DELETE", f"/api/datasets/{dataset_id}").status_code == 404
        assert (
            write(
                bob, csrf_b, "PATCH", f"/api/datasets/{dataset_id}", json={"projectId": None}
            ).status_code
            == 404
        )
        assert write(bob, csrf_b, "POST", "/api/workspace/import", json=source).status_code == 201
        bob_owned = bob.get("/api/workspace").json()
        assert bob_owned["projects"][0]["id"] != project_id
        assert bob_owned["datasets"][0]["id"] != dataset_id


def test_failed_database_write_removes_staged_and_final_files(api, monkeypatch):
    client, engine, tmp_path = api
    csrf = account(client, "failed-upload@example.com")
    original_commit = DbSession.commit

    def fail_commit(_self):
        raise RuntimeError("database write failed")

    monkeypatch.setattr(DbSession, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="database write failed"):
        write(
            client,
            csrf,
            "POST",
            "/api/datasets",
            files={"file": ("Research.csv", CSV, "text/csv")},
        )
    monkeypatch.setattr(DbSession, "commit", original_commit)
    assert client.get("/api/datasets").json() == []
    assert not list((tmp_path / "uploads").iterdir())
    with DbSession(engine) as db:
        assert db.scalars(select(Dataset)).all() == []


def test_failed_delete_restores_file_and_owned_record(api, monkeypatch):
    client, _engine, tmp_path = api
    csrf = account(client, "failed-delete@example.com")
    uploaded = write(
        client, csrf, "POST", "/api/datasets", files={"file": ("Research.csv", CSV, "text/csv")}
    )
    dataset_id = uploaded.json()["id"]
    original_commit = DbSession.commit

    def fail_commit(_self):
        raise RuntimeError("database delete failed")

    monkeypatch.setattr(DbSession, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="database delete failed"):
        write(client, csrf, "DELETE", f"/api/datasets/{dataset_id}")
    monkeypatch.setattr(DbSession, "commit", original_commit)
    assert client.get(f"/api/datasets/{dataset_id}").status_code == 200
    assert client.get(f"/api/datasets/{dataset_id}/download").content == CSV
    assert len(list((tmp_path / "uploads").iterdir())) == 1


def test_failed_workspace_reset_restores_dataset_files(api, monkeypatch):
    client, _engine, tmp_path = api
    csrf = account(client, "failed-reset@example.com")
    uploaded = write(
        client, csrf, "POST", "/api/datasets", files={"file": ("Research.csv", CSV, "text/csv")}
    )
    dataset_id = uploaded.json()["id"]
    original_commit = DbSession.commit

    def fail_commit(_self):
        raise RuntimeError("database reset failed")

    monkeypatch.setattr(DbSession, "commit", fail_commit)
    with pytest.raises(RuntimeError, match="database reset failed"):
        write(client, csrf, "DELETE", "/api/workspace")
    monkeypatch.setattr(DbSession, "commit", original_commit)
    assert client.get(f"/api/datasets/{dataset_id}/download").content == CSV
    assert len(list((tmp_path / "uploads").iterdir())) == 1
