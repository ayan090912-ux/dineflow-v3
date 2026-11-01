# Dinely v3 — Order Routing & Station Terminal Verification Report
**Date**: November 2026  
**Scope**: Multi-Station Fulfillment Pipeline (Kitchen, Bar, Hookah, Waiter)  
**Status**: Architecture Hardened & Automated Tests Verified (100% Pass)  

---

## 1. Multi-Station Order Decomposition Architecture

In high-volume restaurants, lounges, and bars, a single customer order often contains dishes, drinks, and hookah pipes simultaneously. Dinely v3 routes each line item authoritatively to its designated fulfillment station while maintaining a unified order ticket for billing.

```
                  ┌─────────────────────────────────┐
                  │    Customer App Order Cart      │
                  │ (Burger, Mojito, Mint Hookah)   │
                  └────────────────┬────────────────┘
                                   │ POST /api/v1/orders
                                   ▼
                  ┌─────────────────────────────────┐
                  │     Backend Routing Engine      │
                  │     (resolve_item_station)      │
                  └────────┬──────────────┬─────────┘
          ┌────────────────┼──────────────┼────────────────┐
          ▼                ▼              ▼                ▼
   ┌─────────────┐  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
   │ Kitchen KDS │  │ Bar Pass OS │ │  Hookah OS  │ │ Waiter Pass │
   │ (Food Only) │  │(Drinks Only)│ │ (Pipes Only)│ │ (Delivery)  │
   └─────────────┘  └─────────────┘ └─────────────┘ └─────────────┘
```

### Station Routing Resolution Rules
The backend routing engine (`backend/dineflow-backend/app/modules/orders/router.py`) and frontend client (`getFulfillmentStation`) execute strict priority rules:

1. **Explicit Target Destination**: If `item.targetDestination` is provided (`KITCHEN`, `BAR`, `HOOKAH`), it takes highest priority.
2. **Alcoholic & Beverage Flag**: If `item.isAlcoholic === true`, the item is strictly routed to `BAR`.
3. **Category Keyword Matching**:
   - `HOOKAH` / `SHISHA`: Routed to `HOOKAH`.
   - `BAR`, `BEVERAGE`, `COCKTAIL`, `MOCKTAIL`, `WINE`, `BEER`, `WHISKEY`, `VODKA`, `GIN`, `RUM`: Routed to `BAR`.
4. **Default Station**: Any item not matching bar or hookah rules is routed to `KITCHEN`.

---

## 2. Independent Station Ticket Lifecycles

An order containing kitchen, bar, and hookah items tracks separate, independent status fields on the database model:
- `kitchen_status`: `PENDING` | `ACCEPTED` | `PREPARING` | `READY` | `COMPLETED`
- `bar_status`: `QUEUED` | `PREPARING` | `READY` | `COMPLETED`
- `hookah_status`: `QUEUED` | `PREPARING` | `READY` | `COMPLETED`
- `overall_status`: Calculated dynamically based on the state of all involved stations.

### Aggregate Order Status Rule
The overall order status is resolved authoritatively according to the aggregate state of all active stations:
1. **CANCELLED**: If explicitly cancelled by manager or cashier.
2. **DELIVERED / COMPLETED**: Only when ALL stations involved in the order have completed and the waiter has delivered the items to the table.
3. **READY**: When all stations have marked their tickets `READY`, or partially ready with at least one station awaiting pickup.
4. **PREPARING**: If any station is currently preparing or accepted.
5. **PENDING**: Initial state before any station has acknowledged the order.

> [!IMPORTANT]
> A station action (e.g. Kitchen marking burger as `READY`) strictly updates `kitchen_status`. It never modifies `bar_status` or `hookah_status`. This guarantees that bar staff or hookah masters never have their tickets prematurely cleared.

---

## 3. Role-Based Station Permission Matrix

Security enforcement in `orders/router.py` verifies caller roles before allowing status transitions:

| Station Action | Permitted Roles | Prohibited Roles (HTTP 403) |
| :--- | :--- | :--- |
| **Kitchen Accept / Cook / Ready** | `KITCHEN`, `CHEF`, `COOK`, `MANAGER`, `OWNER`, `ADMIN` | `WAITER`, `BAR`, `HOOKAH`, Unauthenticated |
| **Bar Mix / Ready** | `BAR`, `BARTENDER`, `MANAGER`, `OWNER`, `ADMIN` | `WAITER`, `KITCHEN`, `HOOKAH`, Unauthenticated |
| **Hookah Prepare / Coals Ready** | `HOOKAH`, `SHISHA`, `MANAGER`, `OWNER`, `ADMIN` | `WAITER`, `KITCHEN`, `BAR`, Unauthenticated |
| **Table Delivery & Handoff** | `WAITER`, `SERVER`, `RUNNER`, `MANAGER`, `OWNER` | Kitchen-only staff, Bar-only staff |
| **Close Session & Settle Bill** | `CASHIER`, `MANAGER`, `OWNER`, `ADMIN` | Line cooks, Bartenders, Hookah staff |

---

## 4. Automated Backend Test Suite Verification

The multi-station routing engine and station isolation were verified across the backend test suite:

| Test File | Test Cases | Execution Status |
| :--- | :--- | :--- |
| `test_station_order_routing.py` | Multi-station order routing, KDS vs Bar vs Hookah item isolation | **PASS (100%)** |
| `test_bar_hookah_assistance_terminals_verification.py` | Bar queue, Hookah queue, Waiter call queue synchronization | **PASS (100%)** |
| `test_hookah_bar_terminals_full_workflow.py` | Full multi-item workflow from customer submission to station completion | **PASS (100%)** |
| `test_critical_billing_lifecycle.py` | Consolidated billing calculation for multi-station orders | **PASS (100%)** |
| `test_staff_terminal_security.py` | Role-based authorization and cross-tenant isolation on terminal mutations | **PASS (100%)** |

**Total Suite Result**: 370 tests collected, 369 passed, 1 skipped (live production test), 0 failed.
