"""API-level tests: health, formats, auth, validation and access control."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import io

import pytest
from fastapi.testclient import TestClient

from tests.conftest import make_pdf, unique_email, upload


def test_health_and_formats(client):
    health = client.get("/api/v1/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"

    formats = client.get("/api/v1/formats")
    assert formats.status_code == 200
    data = formats.json()
    tool_ids = {tool["id"] for tool in data["tools"]}
    assert {"pdf-to-word", "docx-to-pdf", "merge-pdf", "image-ocr", "xlsx-to-csv"} <= tool_ids
    assert data["formats"]["input"]
    for tool in data["tools"]:
        assert isinstance(tool["available"], bool)
        if not tool["available"]:
            assert tool["unavailable_reason"]


def test_registration_login_profile_and_logout(client):
    email = unique_email()
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": email, "password": "Password123"},
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["user"]["email"] == email
    assert payload["access_token"]
    assert "dc_access" in response.cookies

    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == email

    duplicate = client.post(
        "/api/v1/auth/register",
        json={"name": "Other", "email": email, "password": "Password123"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "conflict"

    updated = client.patch("/api/v1/auth/me", json={"name": "Renamed User"})
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed User"

    wrong = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "WrongPassword1"}
    )
    assert wrong.status_code == 401

    client.post("/api/v1/auth/logout")
    assert client.get("/api/v1/auth/me").status_code == 401

    login = client.post("/api/v1/auth/login", json={"email": email, "password": "Password123"})
    assert login.status_code == 200
    assert client.get("/api/v1/auth/me").status_code == 200


def test_registration_validation(client):
    weak = client.post(
        "/api/v1/auth/register",
        json={"name": "A", "email": "not-an-email", "password": "short"},
    )
    assert weak.status_code == 422
    assert weak.json()["error"]["code"] == "validation_error"


def test_unauthenticated_me_returns_401(client):
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_anonymous_conversion_is_isolated(client):
    response = upload(client, "pdf-to-word", [("report.pdf", make_pdf())])
    assert response.status_code == 202, response.text
    job_id = response.json()["id"]

    from app.main import app

    with TestClient(app) as other_client:
        assert other_client.get(f"/api/v1/conversions/{job_id}").status_code == 404
        assert other_client.get(f"/api/v1/conversions/{job_id}/download").status_code == 404


def test_job_accessible_to_owner(client):
    response = upload(client, "extract-text", [("report.pdf", make_pdf())])
    job_id = response.json()["id"]
    detail = client.get(f"/api/v1/conversions/{job_id}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "completed"


def test_user_jobs_are_isolated_between_accounts(client):
    owner_email = unique_email()
    client.post(
        "/api/v1/auth/register",
        json={"name": "Owner", "email": owner_email, "password": "Password123"},
    )
    job = upload(client, "extract-text", [("report.pdf", make_pdf())]).json()
    client.post("/api/v1/auth/logout")

    client.post(
        "/api/v1/auth/register",
        json={"name": "Intruder", "email": unique_email(), "password": "Password123"},
    )
    assert client.get(f"/api/v1/conversions/{job['id']}").status_code == 404
    assert client.get(f"/api/v1/conversions/{job['id']}/download").status_code == 404


def test_unsupported_extension_is_rejected(client):
    response = upload(client, "pdf-to-word", [("notes.txt", b"just text")])
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_format"


def test_content_must_match_extension(client):
    response = upload(client, "pdf-to-word", [("fake.pdf", b"this is not a pdf")])
    assert response.status_code == 415


def test_unknown_tool_returns_404(client):
    response = upload(client, "does-not-exist", [("a.pdf", make_pdf())])
    assert response.status_code == 404


def test_invalid_options_json_is_rejected(client):
    response = client.post(
        "/api/v1/conversions",
        data={"tool": "extract-text", "options": "{not json"},
        files=[("files", ("a.pdf", make_pdf(), "application/pdf"))],
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_merge_requires_two_files(client):
    response = upload(client, "merge-pdf", [("only.pdf", make_pdf())])
    assert response.status_code == 422


def test_upload_size_limit(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_upload_mb", 1)
    response = upload(client, "txt-to-pdf", [("big.txt", b"a" * (2 * 1024 * 1024))])
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_unavailable_tool_is_not_advertised(client, monkeypatch):
    monkeypatch.setattr("app.services.registry.ocr_available", lambda: False)
    formats = client.get("/api/v1/formats").json()
    ocr_tool = next(tool for tool in formats["tools"] if tool["id"] == "image-ocr")
    assert ocr_tool["available"] is False
    assert ocr_tool["unavailable_reason"]

    response = upload(client, "image-ocr", [("scan.png", b"\x89PNG\r\n\x1a\n")])
    assert response.status_code == 415


def test_expired_download_returns_410(client):
    created = upload(client, "extract-text", [("report.pdf", make_pdf())]).json()
    job = client.get(f"/api/v1/conversions/{created['id']}").json()
    assert job["status"] == "completed"

    from app.core.database import SessionLocal
    from app.models.conversion import ConversionJob

    with SessionLocal() as db:
        record = db.get(ConversionJob, job["id"])
        record.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

    response = client.get(f"/api/v1/conversions/{job['id']}/download")
    assert response.status_code == 410
    assert response.json()["error"]["code"] == "expired"


def test_delete_job_and_clear_history(client):
    job = upload(client, "extract-text", [("report.pdf", make_pdf())]).json()
    deletion = client.delete(f"/api/v1/conversions/{job['id']}")
    assert deletion.status_code == 204
    assert client.get(f"/api/v1/conversions/{job['id']}").status_code == 404
    assert client.get(f"/api/v1/conversions/{job['id']}/download").status_code == 404

    upload(client, "extract-text", [("report.pdf", make_pdf())])
    cleared = client.delete("/api/v1/conversions")
    assert cleared.status_code == 200
    assert cleared.json()["deleted"] >= 1


def test_stats_and_history_search(client):
    upload(client, "extract-text", [("searchable-report.pdf", make_pdf())])
    stats = client.get("/api/v1/conversions/stats")
    assert stats.status_code == 200
    body = stats.json()
    assert body["total"] >= 1
    assert body["completed"] >= 1
    assert body["usage"]["max_upload_mb"] >= 1

    history = client.get("/api/v1/conversions", params={"q": "searchable"})
    assert history.status_code == 200
    assert history.json()["total"] >= 1
    assert all("searchable" in item["original_filename"] for item in history.json()["items"])


def test_history_pagination_validation(client):
    assert client.get("/api/v1/conversions", params={"page": 0}).status_code == 422
    assert client.get("/api/v1/conversions", params={"page_size": 500}).status_code == 422


def test_conversion_failure_is_reported(client):
    job = upload(
        client,
        "rotate-pdf",
        [("report.pdf", make_pdf())],
        options={"pages": "99", "angle": "90"},
    ).json()
    detail = client.get(f"/api/v1/conversions/{job['id']}").json()
    assert detail["status"] == "failed"
    assert detail["error_message"]
    assert detail["download_url"] is None
    assert client.get(f"/api/v1/conversions/{job['id']}/download").status_code == 422
