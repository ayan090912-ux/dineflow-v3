import json
import base64
import time
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

def create_admin_jwt(email: str = "ayan090912@gmail.com", uid: str = "admin_uid_ayan") -> str:
    claims = {
        "uid": uid,
        "user_id": uid,
        "email": email,
        "role": "PLATFORM_ADMIN",
        "admin": True,
    }
    header = base64.urlsafe_b64encode(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"{header}.{payload}.fake_signature"


def test_platform_stats_and_pending_count_accuracy():
    admin_token = create_admin_jwt()
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    t_stamp = int(time.time() * 1000)

    # 1. Check initial stats
    initial_stats = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    init_pending = initial_stats["pendingApprovals"]
    init_live = initial_stats["liveRestaurants"]

    # 2. Create Restaurant 1 (User X) -> Should increment pending count by exactly 1
    rest_1_id = f"rest-stat-test-1-{t_stamp}"
    resp_1 = client.post("/api/v1/restaurants", json={
        "id": rest_1_id,
        "name": f"Pending Test Rest 1 {t_stamp}",
        "ownerName": "User X",
        "ownerEmail": f"user_x_{t_stamp}@gmail.com",
        "ownerUid": f"uid_x_{t_stamp}",
        "businessType": "RESTAURANT",
        "hasTables": True,
    })
    assert resp_1.status_code == 201

    stats_after_1 = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    assert stats_after_1["pendingApprovals"] == init_pending + 1

    # 3. Create Restaurant 2 (User X) -> Should increment pending count by another 1
    rest_2_id = f"rest-stat-test-2-{t_stamp}"
    resp_2 = client.post("/api/v1/restaurants", json={
        "id": rest_2_id,
        "name": f"Pending Test Rest 2 {t_stamp}",
        "ownerName": "User X",
        "ownerEmail": f"user_x_{t_stamp}@gmail.com",
        "ownerUid": f"uid_x_{t_stamp}",
        "businessType": "BAR",
        "hasTables": True,
    })
    assert resp_2.status_code == 201

    stats_after_2 = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    assert stats_after_2["pendingApprovals"] == init_pending + 2

    # 4. Approve Restaurant 1 -> pending decreases by 1, live increases by 1
    appr_resp = client.post("/api/v1/admin/restaurants/approve", headers=admin_headers, json={
        "restaurant_id": rest_1_id,
    })
    assert appr_resp.status_code == 200

    stats_after_appr = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    assert stats_after_appr["pendingApprovals"] == init_pending + 1
    assert stats_after_appr["liveRestaurants"] == init_live + 1

    # 5. Reject Restaurant 2 -> pending decreases by 1, and DOES NOT count towards pending!
    rej_resp = client.post("/api/v1/admin/restaurants/reject", headers=admin_headers, json={
        "restaurant_id": rest_2_id,
        "reason": "Missing documentation",
    })
    assert rej_resp.status_code == 200

    stats_after_rej = client.get("/api/v1/admin/stats", headers=admin_headers).json()
    assert stats_after_rej["pendingApprovals"] == init_pending


def test_restaurant_rejection_resubmission_and_approval_lifecycle():
    admin_token = create_admin_jwt()
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    t_stamp = int(time.time() * 1000)

    rest_id = f"rest-resubmit-cycle-{t_stamp}"
    # 1. Create Restaurant -> PENDING_APPROVAL
    create_resp = client.post("/api/v1/restaurants", json={
        "id": rest_id,
        "name": f"Resubmit Cycle Venue {t_stamp}",
        "ownerName": "Resubmit Tester",
        "ownerEmail": f"resubmit_{t_stamp}@gmail.com",
        "ownerUid": f"uid_resubmit_{t_stamp}",
        "phone": "+919876543210",
        "address": "123 Test St",
        "businessType": "RESTAURANT",
    })
    assert create_resp.status_code == 201
    created_data = create_resp.json()
    assert created_data["lifecycle_status"] == "PENDING_APPROVAL"
    assert created_data["is_approved"] is False

    # 2. Platform Admin Rejects application with reason
    rej_resp = client.post("/api/v1/admin/restaurants/reject", headers=admin_headers, json={
        "restaurant_id": rest_id,
        "reason": "Please provide verified business address and phone.",
    })
    assert rej_resp.status_code == 200
    rej_data = rej_resp.json()
    assert rej_data["lifecycleStatus"] == "REJECTED"
    assert rej_data["isApproved"] is False

    # Verify restaurant details shows REJECTED with rejection reason
    get_rej = client.get(f"/api/v1/restaurants/{rest_id}")
    assert get_rej.status_code == 200
    assert get_rej.json()["lifecycle_status"] == "REJECTED"
    assert get_rej.json()["rejection_reason"] == "Please provide verified business address and phone."

    # 3. Owner Resubmits application with updated details
    resubmit_resp = client.put(f"/api/v1/restaurants/{rest_id}", json={
        "name": f"Resubmit Cycle Venue Updated {t_stamp}",
        "address": "456 Verified Blvd, Mumbai",
        "phone": "+919988776655",
        "lifecycleStatus": "PENDING_APPROVAL",
    })
    assert resubmit_resp.status_code == 200
    resubmitted_data = resubmit_resp.json()
    assert resubmitted_data["lifecycle_status"] == "PENDING_APPROVAL"
    assert resubmitted_data["is_approved"] is False
    assert resubmitted_data["rejection_reason"] is None
    assert resubmitted_data["address"] == "456 Verified Blvd, Mumbai"

    # 4. Platform Admin sees it in PENDING_APPROVAL queue again
    queue_resp = client.get("/api/v1/admin/restaurants?lifecycle_status=PENDING_APPROVAL", headers=admin_headers)
    assert queue_resp.status_code == 200
    pending_items = [r for r in queue_resp.json() if r["id"] == rest_id]
    assert len(pending_items) == 1
    assert pending_items[0]["lifecycleStatus"] == "PENDING_APPROVAL"
    assert pending_items[0]["rejectionReason"] is None

    # 5. Platform Admin Approves the resubmitted application
    appr_resp = client.post("/api/v1/admin/restaurants/approve", headers=admin_headers, json={
        "restaurant_id": rest_id,
    })
    assert appr_resp.status_code == 200
    appr_data = appr_resp.json()
    assert appr_data["lifecycleStatus"] == "LIVE"
    assert appr_data["isApproved"] is True

    # Verify restaurant details is now LIVE
    get_live = client.get(f"/api/v1/restaurants/{rest_id}")
    assert get_live.status_code == 200
    assert get_live.json()["lifecycle_status"] == "LIVE"
    assert get_live.json()["is_approved"] is True

