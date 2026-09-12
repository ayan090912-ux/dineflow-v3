# DINELY — 07 TEST STRATEGY & DUAL-TENANT VALIDATION MATRIX

**Document Status:** Comprehensive Quality Assurance & Verification Blueprint  
**Scope:** Frontend Unit/Component, Backend API/Integration, Multi-Tenant Security, Realtime WebSocket Channels, Production Smoke Testing  
**Primary Mandate:** Proof of Total Multi-Tenant Isolation Across Two Independent Restaurants  

---

## 1. Multi-Tier Testing Pyramid

```
                                [ E2E Browser & Smoke Tests ]
                                 Dual-Tenant User Journeys
                                 (Playwright / Subagent)
                                            ▲
                                           / \
                                          /   \
                             [ Integration & API Test Suite ]
                              FastAPI TestClient + Asyncpg DB
                              Multi-Tenant RBAC & IDOR Probes
                                        ▲
                                       / \
                                      /   \
                         [ Frontend & Backend Unit Tests ]
                          Component Rendering, Math, Regex,
                          Table Normalizer, Tenant Resolvers
```

---

## 2. Test Environments & Tooling

| Tier | Focus Area | Framework / Tool | Execution Trigger | Success Gate |
|---|---|---|---|---|
| **Unit (Backend)** | Utility functions, schema validators, table normalizers, tax math | `pytest`, `pytest-asyncio` | Pre-commit / CI | 100% Pass, 0 Warnings |
| **Unit (Frontend)** | Tenant resolver regex, UI components, date/currency formatters | `vitest`, `@testing-library/react` | Pre-commit / CI | 100% Pass |
| **API & Integration** | REST endpoints, database transactions, foreign key constraints | `httpx.AsyncClient`, PostgreSQL test DB | Pull Request / CI | 100% Pass, All queries scoped |
| **Security & IDOR** | Cross-tenant access attempts, token spoofing, unauthenticated endpoints | Custom security test scripts (`test_security_audit.py`) | Staging / Pre-deploy | 0 Cross-Tenant Leaks (All return 403) |
| **Realtime & WebSockets**| Room subscription isolation, message delivery, reconnect backoff | `websockets` async test harness | Staging / Pre-deploy | Events received ONLY by authorized room |
| **Dual-Tenant E2E** | Two separate browser contexts operating two distinct restaurants | Playwright / Headless Chrome | Staging / Pre-deploy | Total data & event isolation |

---

## 3. The Dual-Tenant Isolation Test Scenario

To mathematically prove multi-tenant isolation, the test suite executes the following concurrent scenario:

```
[ Tenant Alpha ]                                       [ Tenant Beta ]
Owner A (alice@example.com)                            Owner B (bob@example.com)
Restaurant: "The Dunk"                                 Restaurant: "Pizza House"
Slug: "the-dunk"                                       Slug: "pizza-house"
Domain: "the-dunk.dinely.food"                         Domain: "pizza-house.dinely.food"
```

### Execution Steps & Validation Gates:
1. **Creation & Scoping**:
   - Owner A creates "The Dunk" -> Assigned `restaurant_id = ID_A`.
   - Owner B creates "Pizza House" -> Assigned `restaurant_id = ID_B`.
   - **Verification**: `ID_A != ID_B`. Database confirms two distinct rows in `restaurants`.
2. **Menu Creation**:
   - Owner A adds "Dunk Burger ($12)" to `ID_A`.
   - Owner B adds "Pepperoni Pizza ($18)" to `ID_B`.
   - **Verification**:
     - `GET /restaurants/ID_A/menu` returns ONLY "Dunk Burger".
     - `GET /restaurants/ID_B/menu` returns ONLY "Pepperoni Pizza".
3. **Cross-Tenant IDOR Attack Simulation**:
   - Owner A attempts to edit Bob's Pizza: `PATCH /restaurants/ID_B/menu/{item_id}` with Owner A's JWT token.
   - **Verification**: Server MUST return **`403 Forbidden`**. No data modification occurs.
4. **Customer Dine-In & Ordering**:
   - Customer 1 scans Table 01 at `the-dunk.dinely.food` -> Places order for 2 Burgers ($24).
   - Customer 2 scans Table 01 at `pizza-house.dinely.food` -> Places order for 1 Pizza ($18).
   - **Verification**:
     - Kitchen KDS for `ID_A` receives Burger order only.
     - Kitchen KDS for `ID_B` receives Pizza order only.
     - Neither kitchen sees the other's order, even though both were placed on "Table 01"!
5. **Realtime WebSocket Channel Isolation**:
   - Client A connects to `ws/ID_A?role=KITCHEN`.
   - Client B connects to `ws/ID_B?role=KITCHEN`.
   - When Order 1 is placed at `ID_A`:
     - Client A receives `"order_created"` event.
     - Client B receives **ZERO messages** on socket.
6. **Billing & Tax Separation**:
   - Owner A configures GST 5%.
   - Owner B configures VAT 10%.
   - Table 01 bill generated at `the-dunk` calculates $24 + $1.20 tax = $25.20.
   - Table 01 bill generated at `pizza-house` calculates $18 + $1.80 tax = $19.80.
   - **Verification**: Zero cross-pollination of tax settings or billing balances.

---

## 4. Definition of Done (Production Acceptance Checklist)

Before any release is promoted to production, the system must pass this exact 18-step verification sequence:

- [ ] **Step 1**: User visits `https://dinely.food`, clicks "Sign In", and completes Google OAuth popup without redirect errors.
- [ ] **Step 2**: User is redirected to `/workspace` and sees the Workspace Selector in <1.0s.
- [ ] **Step 3**: User completes the 4-step Setup Wizard, inputting name, slug, tables, and starter menu items.
- [ ] **Step 4**: Restaurant is created with status `DRAFT`.
- [ ] **Step 5**: User clicks "Submit for Approval". Status transitions to `PENDING_APPROVAL`.
- [ ] **Step 6**: Admin dashboard at `/admin` receives WebSocket event and displays the submission in the Pending Queue.
- [ ] **Step 7**: Admin clicks "Approve". Restaurant status transitions to `LIVE`.
- [ ] **Step 8**: Unique tenant subdomain `https://<slug>.dinely.food` becomes active and serves branded customer app.
- [ ] **Step 9**: Dynamic QR code is generated for Table 01 encoding `https://<slug>.dinely.food/customer?table=01`.
- [ ] **Step 10**: Customer scans QR code on a mobile device; menu loads with correct dishes, images, and prices.
- [ ] **Step 11**: Customer adds items to cart and submits order.
- [ ] **Step 12**: Kitchen terminal at `https://<slug>.dinely.food/kitchen` receives order in realtime with audio chime.
- [ ] **Step 13**: Bar terminal at `https://<slug>.dinely.food/bar` receives bar items exclusively.
- [ ] **Step 14**: Customer taps "Call Waiter"; Waiter terminal at `/waiter` flashes table alert.
- [ ] **Step 15**: Kitchen marks order "READY"; Waiter terminal displays pickup notification.
- [ ] **Step 16**: Cashier generates bill; tax rules are accurately applied and itemized receipt is displayed.
- [ ] **Step 17**: Bill is marked "PAID"; table session is closed and released for next guest.
- [ ] **Step 18**: A second tenant (Restaurant 2) executes steps 1-17 simultaneously with ZERO data or event interference.
