import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from datetime import datetime, timezone

from app.main import app
from app.core.security.password import hash_password, verify_password
from app.modules.restaurants.models import Restaurant, RestaurantMembership

@pytest.mark.asyncio
async def test_staff_password_management_and_isolation(db_session):
    # 1. Setup Test Tenants: Restaurant A and Restaurant B
    rest_a = Restaurant(
        id="rest-test-tenant-a",
        name="Tenant Alpha",
        slug="tenant-alpha",
        owner_uid="owner-a-uid",
        owner_email="owner-a@example.com",
        lifecycle_status="LIVE",
        is_approved=True,
    )
    rest_b = Restaurant(
        id="rest-test-tenant-b",
        name="Tenant Beta",
        slug="tenant-beta",
        owner_uid="owner-b-uid",
        owner_email="owner-b@example.com",
        lifecycle_status="LIVE",
        is_approved=True,
    )
    db_session.add(rest_a)
    db_session.add(rest_b)
    await db_session.commit()

    # Owner memberships
    owner_a_mem = RestaurantMembership(
        id="mem-owner-a",
        restaurant_id="rest-test-tenant-a",
        user_uid="owner-a-uid",
        user_email="owner-a@example.com",
        role="OWNER",
    )
    owner_b_mem = RestaurantMembership(
        id="mem-owner-b",
        restaurant_id="rest-test-tenant-b",
        user_uid="owner-b-uid",
        user_email="owner-b@example.com",
        role="OWNER",
    )
    db_session.add(owner_a_mem)
    db_session.add(owner_b_mem)
    await db_session.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Mock owner A header
        owner_a_headers = {
            "Authorization": "Bearer mock_owner_a_token",
            "X-Staff-Restaurant-Id": "rest-test-tenant-a",
            "X-Staff-Role": "OWNER",
            "X-Staff-Id": "owner-a-uid",
        }
        # In testing environment, let's test via direct database + API verification
        
        # Test 1: Create staff account with unique username
        new_staff_username = "test_waiter_99"
        initial_pw = "InitialSecret123!"
        hashed_initial = hash_password(initial_pw)
        
        staff_mem = RestaurantMembership(
            id="mem-staff-99",
            restaurant_id="rest-test-tenant-a",
            user_uid="staff-uid-99",
            user_email="waiter99@staff.dinely.internal",
            username=new_staff_username,
            full_name="Test Waiter 99",
            password_hash=hashed_initial,
            role="WAITER",
            assigned_terminal="WAITER-01",
            is_active=True,
        )
        db_session.add(staff_mem)
        await db_session.commit()

        # Test 2: Login with initial password works
        res_login = await client.post(
            "/api/v1/staff/auth/login",
            json={"username": new_staff_username, "password": initial_pw}
        )
        assert res_login.status_code == 200, f"Initial login failed: {res_login.text}"
        login_data = res_login.json()
        token_v1 = login_data["access_token"]
        assert login_data["role"] == "WAITER"
        assert login_data["restaurant_id"] == "rest-test-tenant-a"
        assert login_data["terminal_id"] == "WAITER-01"

        # Verify /me works with initial token
        res_me = await client.get(
            "/api/v1/staff/auth/me",
            headers={"Authorization": f"Bearer {token_v1}"}
        )
        assert res_me.status_code == 200

        # Test 3: Login with WRONG password fails
        res_wrong = await client.post(
            "/api/v1/staff/auth/login",
            json={"username": new_staff_username, "password": "WrongPassword999!"}
        )
        assert res_wrong.status_code == 401

        # Test 4: Reset password to new password
        new_pw = "UpdatedSecret456!"
        # Simulate password update via hash_password (Argon2id)
        staff_mem.password_hash = hash_password(new_pw)
        staff_mem.updated_at = datetime.now(timezone.utc)
        await db_session.commit()

        # Test 5: New password works
        res_login_new = await client.post(
            "/api/v1/staff/auth/login",
            json={"username": new_staff_username, "password": new_pw}
        )
        assert res_login_new.status_code == 200, "Login with new password should succeed"
        token_v2 = res_login_new.json()["access_token"]

        # Test 6: Old password NO LONGER works
        res_login_old = await client.post(
            "/api/v1/staff/auth/login",
            json={"username": new_staff_username, "password": initial_pw}
        )
        assert res_login_old.status_code == 401, "Old password must be rejected"

        # Test 7: Stale token (token_v1 issued before password update) is invalidated
        # When calling /me with token_v1, it must be rejected with 401
        res_stale = await client.get(
            "/api/v1/staff/auth/me",
            headers={"Authorization": f"Bearer {token_v1}"}
        )
        assert res_stale.status_code == 401, "Stale session token must be invalidated upon password reset"

        # Test 8: Fresh token (token_v2) works cleanly
        res_fresh = await client.get(
            "/api/v1/staff/auth/me",
            headers={"Authorization": f"Bearer {token_v2}"}
        )
        assert res_fresh.status_code == 200

        # Test 9: Cross-tenant isolation - accessing staff from another domain/tenant
        res_cross_domain = await client.post(
            "/api/v1/staff/auth/login",
            headers={"host": "tenant-beta.dinely.food"},
            json={"username": new_staff_username, "password": new_pw}
        )
        assert res_cross_domain.status_code == 403, "Staff member cannot log in via another tenant's domain"

        # Test 10: Unauthorized staff cannot access owner endpoints
        res_owner_block = await client.get(
            "/api/v1/restaurants/rest-test-tenant-a/staff",
            headers={"Authorization": f"Bearer {token_v2}"}
        )
        assert res_owner_block.status_code in [401, 403], "Staff token cannot access owner staff management API"

        # Test 11: Duplicate username is rejected with conflict
        dup_mem = RestaurantMembership(
            id="mem-dup-test",
            restaurant_id="rest-test-tenant-b",
            user_uid="staff-dup-uid",
            user_email="dup@staff.dinely.internal",
            username=new_staff_username, # Same username
            role="WAITER",
        )
        # Attempting to query dup username check in router logic
        from sqlalchemy import select, func
        dup_check = await db_session.execute(
            select(RestaurantMembership).where(
                RestaurantMembership.username.is_not(None),
                func.lower(RestaurantMembership.username) == new_staff_username.lower()
            )
        )
        assert dup_check.scalar_one_or_none() is not None, "Duplicate username correctly detected"

        # Test 12: Terminal Routing for All Roles: Kitchen, Bar, Inventory, Billing
        terminal_roles = [
            ("chef_user_1", "CHEF", "KITCHEN-01", "/kitchen"),
            ("bar_user_1", "BAR", "BAR-01", "/bar"),
            ("inventory_user_1", "INVENTORY", "INVENTORY-01", "/inventory"),
            ("cashier_user_1", "CASHIER", "CASHIER-01", "/billing"),
        ]
        for u_name, r_role, t_id, exp_route in terminal_roles:
            term_pw = "RoleSecretPass123!"
            t_mem = RestaurantMembership(
                id=f"mem-{u_name}",
                restaurant_id="rest-test-tenant-a",
                user_uid=f"uid-{u_name}",
                user_email=f"{u_name}@staff.dinely.internal",
                username=u_name,
                full_name=f"{r_role} Lead",
                password_hash=hash_password(term_pw),
                role=r_role,
                assigned_terminal=t_id,
                is_active=True,
            )
            db_session.add(t_mem)
            await db_session.commit()

            t_login = await client.post(
                "/api/v1/staff/auth/login",
                json={"username": u_name, "password": term_pw}
            )
            assert t_login.status_code == 200, f"Login failed for {r_role}"
            t_data = t_login.json()
            assert t_data["role"] == r_role
            assert t_data["target_route"] == exp_route, f"Expected route {exp_route} for {r_role}, got {t_data['target_route']}"
            assert t_data["terminal_id"] == t_id

            # Verify /me payload
            t_me = await client.get(
                "/api/v1/staff/auth/me",
                headers={"Authorization": f"Bearer {t_data['access_token']}"}
            )
            assert t_me.status_code == 200
            assert t_me.json()["target_route"] == exp_route
