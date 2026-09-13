# DINELY — PRODUCTION DATA CLEANUP PLAN

**Execution Date:** 2026-09-13  
**Status:** FORENSIC AUDIT COMPLETE & CLASSIFIED  
**Safety Mandate:** Zero Blind Deletions. Every database entity must be categorized, justified, and backed up before purge.

---

## 1. Restaurant Classification Inventory

| restaurant_id | name | owner | slug | domain | lifecycle | classification | reason | action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `rest-1787446097984` | CAFE.CO | `owner@cafeco.food` | `cafe-co` | `cafe-co.dinely.food` | `ARCHIVED` | **DEMO / REMOVE** | Hardcoded legacy demo restaurant (CAFE.CO) | `REMOVE` |
| `dineflow` | DineFlow Restaurant | `None` | `dineflow` | `dineflow.dinely.food` | `ARCHIVED` | **LEGACY / REMOVE** | Initial bootstrap prototype relic | `REMOVE` |
| `rest-the-dunk` | THE DUNK | `owner@thedunk.food` | `the-dunk` | `the-dunk.dinely.food` | `LIVE` | **DEMO / REMOVE** | Hardcoded legacy demo restaurant (THE DUNK) | `REMOVE` |
| `rest-1` | CAFE.CO | `owner@cafeco.food` | `cafe-co-rest-1` | `cafe-co-rest-1.dinely.food` | `ARCHIVED` | **DEMO / REMOVE** | Hardcoded legacy demo restaurant (CAFE.CO) | `REMOVE` |
| `rest-1787655544312` | CAFE.CO | `owner@cafeco.food` | `cafe-co-rest-1787655544312` | `cafe-co-rest-1787655544312.dinely.food` | `ARCHIVED` | **DEMO / REMOVE** | Hardcoded legacy demo restaurant (CAFE.CO) | `REMOVE` |
| `rest-1789033669936-88062e` | Trattoria Alpha 1789033669760 | `owner_a_1789033669760@example.com` | `trattoria-alpha-1789033669760` | `trattoria-alpha-1789033669760.dinely.food` | `PENDING_APPROVAL` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789033670325-60f9e2` | Bistro Beta 1789033669760 | `owner_b_1789033669760@example.com` | `bistro-beta-1789033669760` | `bistro-beta-1789033669760.dinely.food` | `PENDING_APPROVAL` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789033755418-afc1b3` | Trattoria Alpha 1789033755404 | `owner_a_1789033755404@example.com` | `trattoria-alpha-1789033755404` | `trattoria-alpha-1789033755404.dinely.food` | `PENDING_APPROVAL` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789033755650-7a726b` | Bistro Beta 1789033755404 | `owner_b_1789033755404@example.com` | `bistro-beta-1789033755404` | `bistro-beta-1789033755404.dinely.food` | `PENDING_APPROVAL` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034416491-9f74d1` | Trattoria Alpha 1789034416397 | `owner_a_1789034416397@example.com` | `trattoria-alpha-1789034416397` | `trattoria-alpha-1789034416397.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034416794-44c7d6` | Bistro Beta 1789034416397 | `owner_b_1789034416397@example.com` | `bistro-beta-1789034416397` | `bistro-beta-1789034416397.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034569652-607146` | Bistro Beta 1789034569447 | `owner_b_1789034569447@example.com` | `bistro-beta-1789034569447` | `bistro-beta-1789034569447.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034569525-652a3e` | Trattoria Alpha 1789034569447 | `owner_a_1789034569447@example.com` | `trattoria-alpha-1789034569447` | `trattoria-alpha-1789034569447.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034655819-3818cc` | Trattoria Alpha 1789034655809 | `owner_a_1789034655809@example.com` | `trattoria-alpha-1789034655809` | `trattoria-alpha-1789034655809.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034655869-d1c985` | Bistro Beta 1789034655809 | `owner_b_1789034655809@example.com` | `bistro-beta-1789034655809` | `bistro-beta-1789034655809.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034814213-1edb4b` | Trattoria Alpha 1789034814132 | `owner_a_1789034814132@example.com` | `trattoria-alpha-1789034814132` | `trattoria-alpha-1789034814132.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789034814336-923b61` | Bistro Beta 1789034814132 | `owner_b_1789034814132@example.com` | `bistro-beta-1789034814132` | `bistro-beta-1789034814132.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789035023271-16eeaa` | Trattoria Alpha 1789035023190 | `owner_a_1789035023190@example.com` | `trattoria-alpha-1789035023190` | `trattoria-alpha-1789035023190.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789035023408-798132` | Bistro Beta 1789035023190 | `owner_b_1789035023190@example.com` | `bistro-beta-1789035023190` | `bistro-beta-1789035023190.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789035323716-1dd2b4` | Trattoria Alpha 1789035323628 | `owner_a_1789035323628@example.com` | `trattoria-alpha-1789035323628` | `trattoria-alpha-1789035323628.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789035323851-c20b78` | Bistro Beta 1789035323628 | `owner_b_1789035323628@example.com` | `bistro-beta-1789035323628` | `bistro-beta-1789035323628.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789057244454-99aa84` | Trattoria Alpha 1789057244180 | `owner_a_1789057244180@example.com` | `trattoria-alpha-1789057244180` | `trattoria-alpha-1789057244180.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789057245080-f1b2b5` | Bistro Beta 1789057244180 | `owner_b_1789057244180@example.com` | `bistro-beta-1789057244180` | `bistro-beta-1789057244180.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789182869109-1733b1` | Trattoria Alpha 1789182868959 | `owner_a_1789182868959@example.com` | `trattoria-alpha-1789182868959` | `trattoria-alpha-1789182868959.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789182869621-a71c5b` | Bistro Beta 1789182868959 | `owner_b_1789182868959@example.com` | `bistro-beta-1789182868959` | `bistro-beta-1789182868959.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789183522444-bca9a0` | Trattoria Alpha 1789183522387 | `owner_a_1789183522387@example.com` | `trattoria-alpha-1789183522387` | `trattoria-alpha-1789183522387.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789183522798-ea5731` | Bistro Beta 1789183522387 | `owner_b_1789183522387@example.com` | `bistro-beta-1789183522387` | `bistro-beta-1789183522387.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789183661229-5775c4` | Trattoria Alpha 1789183661193 | `owner_a_1789183661193@example.com` | `trattoria-alpha-1789183661193` | `trattoria-alpha-1789183661193.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789183661636-39b265` | Bistro Beta 1789183661193 | `owner_b_1789183661193@example.com` | `bistro-beta-1789183661193` | `bistro-beta-1789183661193.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789184108532-26ebb3` | Trattoria Alpha 1789184108475 | `owner_a_1789184108475@example.com` | `trattoria-alpha-1789184108475` | `trattoria-alpha-1789184108475.dinely.food` | `LIVE` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789184108933-aeeab2` | Bistro Beta 1789184108475 | `owner_b_1789184108475@example.com` | `bistro-beta-1789184108475` | `bistro-beta-1789184108475.dinely.food` | `ARCHIVED` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789188412860-ee9877` | Trattoria Alpha 1789188412712 | `owner_a_1789188412712@example.com` | `trattoria-alpha-1789188412712` | `trattoria-alpha-1789188412712.dinely.food` | `PENDING_APPROVAL` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |
| `rest-1789188413292-115f21` | Bistro Beta 1789188412712 | `owner_b_1789188412712@example.com` | `bistro-beta-1789188412712` | `bistro-beta-1789188412712.dinely.food` | `PENDING_APPROVAL` | **TEST / REMOVE** | Automated regression test fixture generated with @example.com test account | `REMOVE` |

---

## 2. Summary of Classifications

- **REAL / KEEP**: 0 records (No live customer accounts currently active in database).
- **DEMO / REMOVE**: 4 records (`rest-1`, `rest-1787446097984`, `rest-1787655544312` [CAFE.CO], `rest-the-dunk` [THE DUNK]).
- **LEGACY / REMOVE**: 1 record (`dineflow` [DineFlow Restaurant]).
- **TEST / REMOVE**: 29 records (Automated integration test fixtures with `@example.com` accounts).
- **UNKNOWN / DO NOT TOUCH**: 0 records.

---

## 3. Related Orphan Data to Purge (Respecting Foreign Keys)

For all confirmed `REMOVE` restaurants:
1. `restaurant_domains`
2. `restaurant_memberships`
3. `tables` & `table_sessions`
4. `orders` & `order_items`
5. `menu_items` & `menu_categories`
6. `customer_requests`
7. `bills` & `qr_codes`

Legitimate user account `owner@dineflow.io` remains preserved.

---

## 4. Execution Policy

Cleanup will be executed inside a single ACID PostgreSQL transaction (`BEGIN ... COMMIT`). If any foreign key violation or error occurs, the transaction will automatically `ROLLBACK` to preserve database integrity.
