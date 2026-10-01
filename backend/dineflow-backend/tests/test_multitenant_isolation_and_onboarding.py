import pytest
from starlette.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_atomic_restaurant_onboarding_and_isolation():
    # 1. Sign up Tenant A ("THE Fly")
    res_a = client.post("/api/v1/restaurants/signup", json={
        "restaurantName": "THE Fly",
        "ownerName": "Aviator Owner",
        "email": "owner@thefly.test",
        "desiredSlug": "the-fly",
        "cuisine": "Modern Gastropub",
        "businessType": "RESTAURANT"
    })
    assert res_a.status_code == 201, f"Tenant A signup failed: {res_a.text}"
    data_a = res_a.json()
    tenant_a = data_a["tenant"]
    token_a = data_a["token"]
    assert tenant_a["slug"] == "the-fly"
    assert "isApproved" in tenant_a
    assert "the-fly.dinely.food" in data_a["dashboardUrl"]
    assert "the-fly.dinely.food" in data_a["customerMenuUrl"]

    # 2. Sign up Tenant B ("Pizza House")
    res_b = client.post("/api/v1/restaurants/signup", json={
        "restaurantName": "Pizza House",
        "ownerName": "Pizza Chef",
        "email": "chef@pizzahouse.test",
        "desiredSlug": "pizza-house",
        "cuisine": "Italian Pizzeria",
        "businessType": "RESTAURANT"
    })
    assert res_b.status_code == 201, f"Tenant B signup failed: {res_b.text}"
    data_b = res_b.json()
    tenant_b = data_b["tenant"]
    token_b = data_b["token"]
    assert tenant_b["slug"] == "pizza-house"
    assert "isApproved" in tenant_b

    # 3. Both tenants have Table 01 independently
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    tbls_a = client.get(f"/api/v1/restaurants/{tenant_a['id']}/tables").json()
    tbls_b = client.get(f"/api/v1/restaurants/{tenant_b['id']}/tables").json()
    assert len(tbls_a) >= 6
    assert len(tbls_b) >= 6

    # Verify Table 01 in Tenant A has the-fly QR and Table 01 in Tenant B has pizza-house QR
    t1_a = next(t for t in tbls_a if "01" in t["table_number"])
    t1_b = next(t for t in tbls_b if "01" in t["table_number"])
    assert "the-fly.dinely.food" in t1_a["qr_code_url"]
    assert "pizza-house.dinely.food" in t1_b["qr_code_url"]

    # 4. Resolve menu by slug for Tenant A
    menu_a = client.get("/api/v1/restaurants/the-fly/menu").json()
    assert len(menu_a["categories"]) >= 4
    assert len(menu_a["items"]) >= 3
    # All items belong to Tenant A
    for item in menu_a["items"]:
        assert item["restaurant_id"] == tenant_a["id"]

    # 5. Resolve menu by slug for Tenant B
    menu_b = client.get("/api/v1/restaurants/pizza-house/menu").json()
    assert len(menu_b["categories"]) >= 4
    assert len(menu_b["items"]) >= 3
    # All items belong to Tenant B
    for item in menu_b["items"]:
        assert item["restaurant_id"] == tenant_b["id"]
        assert item["restaurant_id"] != tenant_a["id"]

    # 6. Tenant A owner attempts to delete or mutate Tenant B table -> 403 Forbidden
    res_cross_delete = client.delete(f"/api/v1/restaurants/{tenant_b['id']}/tables/{t1_b['id']}", headers=headers_a)
    assert res_cross_delete.status_code in [403, 404]

    # 7. Public hostname resolution:
    # the-fly.dinely.food -> resolves Tenant A
    res_host_a = client.get("/api/v1/restaurants/public/resolve?hostname=the-fly.dinely.food")
    assert res_host_a.status_code == 200
    assert res_host_a.json()["id"] == tenant_a["id"]

    # pizza-house.dinely.food -> resolves Tenant B
    res_host_b = client.get("/api/v1/restaurants/public/resolve?hostname=pizza-house.dinely.food")
    assert res_host_b.status_code == 200
    assert res_host_b.json()["id"] == tenant_b["id"]

    # unknown tenant -> 404 Not Found
    res_unknown = client.get("/api/v1/restaurants/public/resolve?hostname=ghost-tavern.dinely.food")
    assert res_unknown.status_code == 404
