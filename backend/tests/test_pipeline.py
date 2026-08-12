"""
tests/test_pipeline.py
───────────────────────
Automated tests for FlowCAD backend:
  • Health check
  • Core models & config
  • Free-tier 429 rate limit enforcement
  • Stage endpoints (mocked / live)
"""
import os
import pytest
from fastapi.testclient import TestClient

from main import app
from core.config import settings

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_config_defaults():
    assert settings.free_tier_monthly_limit == 5
    assert settings.work_dir is not None


def test_openapi_docs():
    response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()
    paths = schema["paths"]
    
    # Verify all expected endpoint groups are present
    assert "/extract-requirements" in paths
    assert "/generate-architecture" in paths
    assert "/select-components" in paths
    assert "/generate-schematic" in paths
    assert "/generate-pcb" in paths
    assert "/place-and-route" in paths
    assert "/verify" in paths
    assert "/export" in paths
    assert "/apply-edit" in paths
    assert "/projects" in paths
    assert "/projects/{project_id}/generate" in paths


def test_monthly_limit_429(monkeypatch):
    """Verify that hitting the monthly generation limit returns HTTP 429."""
    from core import supabase_client as db

    # Mock select to return a profile with generations_this_month = 5 (limit is 5)
    def mock_select(table, match, limit=1):
        if table == "profiles":
            return [{
                "id": "limit-user",
                "generations_this_month": 5,
                "month_reset_at": "2026-08-01T00:00:00+00:00",
            }]
        return []

    monkeypatch.setattr(db, "select", mock_select)

    res = client.post(
        "/projects/test-project-123/generate?user_id=limit-user",
        json={"prompt": "Design an LED blinker PCB with ESP32 and USB-C."},
    )
    assert res.status_code == 429
    data = res.json()
    assert data["detail"]["error"] == "monthly_limit_reached"
    assert data["detail"]["used"] == 5

