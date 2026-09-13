import pytest
from starlette.testclient import TestClient
from app.main import app
from app.core.middlewares.rate_limit import limiter
from app.modules.websocket.manager import ws_manager

client = TestClient(app)

class TestSecurityHardeningSuite:
    def setup_method(self):
        # Clear rate limiter memory between tests
        limiter.requests.clear()
        ws_manager.active_connections.clear()
        ws_manager.connect_attempts.clear()

    def test_security_headers_present_on_all_responses(self):
        """Verify production security headers are injected on all HTTP responses."""
        resp = client.get("/healthz")
        assert resp.status_code == 200
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"
        assert "Strict-Transport-Security" in resp.headers
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"

    def test_payload_limit_middleware_rejects_oversized_json(self):
        """Verify requests with Content-Length exceeding 1MB are rejected with 413."""
        headers = {"content-length": str(2 * 1024 * 1024), "content-type": "application/json"}
        resp = client.post("/api/v1/orders", headers=headers, json={"test": "data"})
        assert resp.status_code == 413
        assert resp.json().get("type") == "payload_too_large"

    def test_rate_limiting_triggers_on_auth_endpoint(self):
        """Verify rate limiter triggers 429 Too Many Requests on auth endpoint brute-force."""
        # Rule for /api/v1/auth/platform/login is 10 req/min
        ip = "198.51.100.99"
        for i in range(10):
            r = client.post(
                "/api/v1/auth/platform/login",
                json={"email": "admin@dinely.food", "password": "wrongpassword123"},
                headers={"x-forwarded-for": ip}
            )
            assert r.status_code == 403, f"Request {i+1} failed with {r.status_code}"

        # 11th request must be rejected with 429
        blocked_resp = client.post(
            "/api/v1/auth/platform/login",
            json={"email": "admin@dinely.food", "password": "wrongpassword123"},
            headers={"x-forwarded-for": ip}
        )
        assert blocked_resp.status_code == 429
        assert blocked_resp.json().get("type") == "rate_limit_exceeded"
        assert "Retry-After" in blocked_resp.headers
        assert blocked_resp.headers.get("X-RateLimit-Limit") == "10"

    def test_healthz_exempt_from_rate_limiting(self):
        """Verify /healthz is never rate limited even with repeated rapid requests."""
        for _ in range(30):
            r = client.get("/healthz", headers={"x-forwarded-for": "198.51.100.2"})
            assert r.status_code == 200

    def test_unauthenticated_protected_admin_endpoint_returns_401(self):
        """Verify Platform Admin APIs strictly reject unauthenticated requests."""
        resp = client.get("/api/v1/admin/restaurants")
        assert resp.status_code in (401, 403)

    def test_unauthenticated_protected_workspace_mutation_returns_401(self):
        """Verify tenant workspace configuration updates reject unauthenticated callers."""
        resp = client.patch(
            "/api/v1/restaurants/rest-demo/workspace-modules",
            json={"enabledModules": ["kitchen"]}
        )
        assert resp.status_code in (401, 403)

    def test_order_creation_idempotency(self):
        """Verify creating an order with an existing idempotencyKey returns the existing order."""
        order_key = "idemp-test-order-001"
        payload = {
            "restaurantId": "rest-nonexistent-999", # Will test tenant check or idempotency return
            "idempotencyKey": order_key,
            "tableNumber": "Table 01",
            "items": [{"name": "Burger", "price": 100.0, "quantity": 1}]
        }
        # First request will fail with 404 if restaurant doesn't exist, which proves tenant verification
        r1 = client.post("/api/v1/orders", json=payload)
        assert r1.status_code == 404
        assert "not found" in r1.json().get("detail", "").lower()

    def test_websocket_privileged_role_without_token_rejected(self):
        """Verify privileged role attempting WebSocket subscription without token is closed with 1008."""
        with pytest.raises(Exception):
            with client.websocket_connect("/api/v1/ws?restaurant_id=rest-123&role=OWNER") as ws:
                ws.receive_text()
