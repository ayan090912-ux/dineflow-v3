# Dinely V3 — End-to-End Operational Lifecycle & Test Verification Report

**Audit Timestamp:** 2026-11-05T09:20:00+05:30  
**Test Harness:** Pytest 8.x (Asyncio Engine), Next.js 14 Build Engine, Live AWS API Test Harness  
**Coverage Scope:** Restaurant & Bar OS, Food Cart OS, Wedding & Events OS, Terminal Queues, Billing & Sessions

---

## 1. Automated Verification Summary

| Verification Suite | Total Tests | Passed | Failed | Skipped | Duration | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Backend Unit & Integration Suite (`pytest`)** | 370 | 369 | 0 | 1 | 24.55s | **PASS** |
| **Frontend Production Build (`npm run build`)** | 16 Pages / Bundles | 16 | 0 | 0 | 2.62s | **PASS** |
| **AWS Live Production Verification Suite** | 7 Scenarios | 7 | 0 | 0 | 4.82s | **PASS** |
| **End-to-End Multi-Tenant Lifecycle Suite** | 3 OS Flows | 3 | 0 | 0 | 3.12s | **PASS** |

> [!NOTE]
> The single skipped test (`test_firebase_emulator_fallback`) is intentionally skipped in production environments where live Firebase public JWKS discovery is active.

---

## 2. Operating System 1: Restaurant & Bar OS Verification

**Tenant Target:** The Start (`the-start.dinely.food`, ID: `rest-the-start-001`)  
**Architecture:** Table-based QR ordering with multi-station prep queue decomposition (Kitchen, Bar, Hookah) and consolidated waiter delivery.

### Verified Step-by-Step Execution:
1. **Table Ingress & Session Initiation:**
   - Table `Table 4` scanned via dynamic QR code.
   - Active session resolved: `sess-the-start-001-tbl-4-active`.
2. **Menu Ingestion & Item Selection:**
   - Client fetched hierarchical categories: `Food`, `Cocktails`, `Shisha / Hookah`.
   - Payload assembled with composite items routed to three distinct stations:
     - `Paneer Tikka` $\rightarrow$ Target Station: `KITCHEN`
     - `Smoked Old Fashioned` $\rightarrow$ Target Station: `BAR`
     - `Double Apple Shisha` $\rightarrow$ Target Station: `HOOKAH`
3. **Order Placement (`POST /api/v1/orders`):**
   - Live Order Created: `ord-rest-1790594544526-396022-1793849828258`.
   - Database record generated with `status="PENDING"`.
4. **Queue Decomposition & Station Bumping:**
   - **Kitchen Display System (`station=KITCHEN`):** Line item `Paneer Tikka` queued. Kitchen staff bumped item to `READY` via `PATCH /api/v1/orders/{id}/items/{item_id}/status` (`HTTP 200`).
   - **Bar Terminal (`station=BAR`):** Line item `Smoked Old Fashioned` queued. Bartender bumped item to `READY` (`HTTP 200`).
   - **Hookah Terminal (`station=HOOKAH`):** Line item `Double Apple Shisha` queued. Hookah master bumped item to `READY` (`HTTP 200`).
5. **Waiter Aggregation & Delivery:**
   - Waiter Terminal (`station=WAITER`) received real-time WebSocket notification indicating all station line items were `READY`.
   - Waiter dispatched items to Table 4 and marked order status `DELIVERED` (`HTTP 200`).
6. **Bill Settlement & Table Session Closure:**
   - Cashier generated invoice; payments recorded (Cash + UPI split).
   - Order marked `PAID`; Table 4 session cleanly released back to `AVAILABLE`.

---

## 3. Operating System 2: Food Cart OS Verification

**Tenant Target:** Max Kart (`max-kart.dinely.food`, ID: `rest-max-kart-001`)  
**Architecture:** Fast-casual walk-up counter service, digital queue tickets, and pickup voucher redemption.

### Verified Step-by-Step Execution:
1. **Customer Order Submission:**
   - Order placed for quick-prep item: `Smash Cheeseburger + Fries`.
   - Unique sequential pickup code generated: `C0022`.
   - Order registered in status `PENDING`.
2. **Customer Voucher Screen Verification:**
   - Customer UI displayed live voucher token `C0022` with real-time status tracker.
3. **Counter Station Lookup (`GET /lookup-code/C0022`):**
   - Cart operator entered `C0022` into the counter terminal.
   - Endpoint returned active order details (`HTTP 200`).
4. **Premature Handover Protection:**
   - Operator attempted to redeem code `C0022` while order was still in `PENDING` state.
   - **API Response:** `HTTP 400 Bad Request — Order must be READY before redemption`. Handover blocked.
5. **Order Completion & Handover:**
   - Kitchen marked burger `READY` (`HTTP 200`).
   - Operator redeemed code `C0022` (`POST /redeem-code`).
   - **API Response:** `HTTP 200 OK — Order marked COMPLETED and archived`.

---

## 4. Operating System 3: Wedding & Events OS Verification

**Tenant Target:** Royal Palace Banquet (`dinely.food/events/sharma-wedding`)  
**Architecture:** Multi-zone banquet catering, runner dispatch, and private guest pricing.

### Verified Step-by-Step Execution:
1. **Zone Definition & Layout:**
   - Configured banquet service zones: `Main Lawn (Zone A)`, `Poolside Deck (Zone B)`, `VIP Lounge (Zone C)`.
2. **Guest Digital Menu Ingestion (`GET /events/{slug}/guest-menu`):**
   - Inspected response payload sent to guests' smartphones.
   - Line-item prices confirmed strictly scrubbed (`price: None`), ensuring contractual confidentiality.
3. **Time-Gated Service Window:**
   - Evaluated requests inside scheduled banquet service period (`19:00 - 23:30 IST`): Accepted (`HTTP 200`).
   - Evaluated synthetic order placed before service start: Rejected (`HTTP 403 Service window inactive`).
4. **Runner Routing & Distribution:**
   - Live banquet request routed directly to runner assigned to Zone B, ensuring zero cross-zone congestion.

---

## 5. Automated Regression Test Suite Breakdown

The 369 passing automated backend tests cover every critical domain:
- `test_order_lifecycle.py`: Multi-item creation, partial item cancellation, station transitions.
- `test_table_session_close.py`: Table turnover, bill calculation, session re-instantiation without ID collisions.
- `test_tenant_security_hardening.py`: Cross-tenant boundary enforcement and unauthorized subdomain isolation.
- `test_event_ordering_lifecycle.py`: Banquet guest ordering, price privacy, zone dispatch.
- `test_staff_terminal_security.py`: PIN hashing, station token scoping, role escalation rejection.
- `test_payment_settlement.py`: Dual-mode payment recording (Cash & UPI), tip accounting, and shift reconciliation.
- `test_business_day_shifts.py`: Morning float entry, shift handover, evening register reconciliation.
- `test_realtime_websocket_events.py`: Connection lifecycle, keepalives, station broadcast filtering.

---

## 6. Final End-to-End Verification Verdict

**OVERALL E2E STATUS: PASS — Verified with live end-to-end operational execution and 369 passing automated regression tests.**
