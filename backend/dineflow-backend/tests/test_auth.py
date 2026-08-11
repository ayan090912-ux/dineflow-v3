import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


class TestHealthEndpoints:
    def test_health_check(self):
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_readiness_check(self):
        response = client.get("/readyz")
        assert response.status_code == 200
        assert response.json()["status"] == "ready"


class TestAuthEndpoints:
    def test_platform_login_invalid_credentials(self):
        response = client.post("/api/v1/auth/platform/login", json={
            "email": "nonexistent@dinely.com",
            "password": "wrongpassword"
        })
        assert response.status_code == 401

    def test_refresh_token_invalid(self):
        response = client.post("/api/v1/auth/refresh", json={
            "refresh_token": "invalid_token"
        })
        assert response.status_code == 401

    def test_logout(self):
        response = client.post("/api/v1/auth/logout", json={
            "refresh_token": "some_token"
        })
        assert response.status_code == 204
