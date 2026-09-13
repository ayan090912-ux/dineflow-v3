# DINELY — CLEANUP BACKUP MANIFEST

**Backup Timestamp:** 2026-09-13T08:10:10.477303Z  
**Backup Status:** COMPLETED & VERIFIED  
**Backup Payload File:** `scripts/cleanup_backup_data.json`  
**Total Records Archived:**
- **Restaurants:** 33
- **Domains:** 33
- **Memberships:** 0
- **Tables:** 287
- **Table Sessions:** 10
- **Orders:** 18
- **Order Items:** 31
- **Menus:** 25
- **Menu Categories:** 104
- **Customer Requests:** 11
- **Bills:** 0
- **QR Records:** 8

---

## Targeted Purge List (IDs to be Removed)

### 1. Obsolete Demo Restaurants
- `rest-1` (CAFE.CO)
- `rest-1787446097984` (CAFE.CO)
- `rest-1787655544312` (CAFE.CO)
- `rest-the-dunk` (THE DUNK)

### 2. Legacy Prototype Restaurant
- `dineflow` (DineFlow Restaurant)

### 3. Automated Test Restaurant Fixtures
- `rest-1789033669936-88062e` (Trattoria Alpha 1789033669760) -> Owner: `owner_a_1789033669760@example.com`
- `rest-1789033670325-60f9e2` (Bistro Beta 1789033669760) -> Owner: `owner_b_1789033669760@example.com`
- `rest-1789033755418-afc1b3` (Trattoria Alpha 1789033755404) -> Owner: `owner_a_1789033755404@example.com`
- `rest-1789033755650-7a726b` (Bistro Beta 1789033755404) -> Owner: `owner_b_1789033755404@example.com`
- `rest-1789034416491-9f74d1` (Trattoria Alpha 1789034416397) -> Owner: `owner_a_1789034416397@example.com`
- `rest-1789034416794-44c7d6` (Bistro Beta 1789034416397) -> Owner: `owner_b_1789034416397@example.com`
- `rest-1789034569652-607146` (Bistro Beta 1789034569447) -> Owner: `owner_b_1789034569447@example.com`
- `rest-1789034569525-652a3e` (Trattoria Alpha 1789034569447) -> Owner: `owner_a_1789034569447@example.com`
- `rest-1789034655819-3818cc` (Trattoria Alpha 1789034655809) -> Owner: `owner_a_1789034655809@example.com`
- `rest-1789034655869-d1c985` (Bistro Beta 1789034655809) -> Owner: `owner_b_1789034655809@example.com`
- `rest-1789034814213-1edb4b` (Trattoria Alpha 1789034814132) -> Owner: `owner_a_1789034814132@example.com`
- `rest-1789034814336-923b61` (Bistro Beta 1789034814132) -> Owner: `owner_b_1789034814132@example.com`
- `rest-1789035023271-16eeaa` (Trattoria Alpha 1789035023190) -> Owner: `owner_a_1789035023190@example.com`
- `rest-1789035023408-798132` (Bistro Beta 1789035023190) -> Owner: `owner_b_1789035023190@example.com`
- `rest-1789035323716-1dd2b4` (Trattoria Alpha 1789035323628) -> Owner: `owner_a_1789035323628@example.com`
- `rest-1789035323851-c20b78` (Bistro Beta 1789035323628) -> Owner: `owner_b_1789035323628@example.com`
- `rest-1789057244454-99aa84` (Trattoria Alpha 1789057244180) -> Owner: `owner_a_1789057244180@example.com`
- `rest-1789057245080-f1b2b5` (Bistro Beta 1789057244180) -> Owner: `owner_b_1789057244180@example.com`
- `rest-1789182869109-1733b1` (Trattoria Alpha 1789182868959) -> Owner: `owner_a_1789182868959@example.com`
- `rest-1789182869621-a71c5b` (Bistro Beta 1789182868959) -> Owner: `owner_b_1789182868959@example.com`
- `rest-1789183522444-bca9a0` (Trattoria Alpha 1789183522387) -> Owner: `owner_a_1789183522387@example.com`
- `rest-1789183522798-ea5731` (Bistro Beta 1789183522387) -> Owner: `owner_b_1789183522387@example.com`
- `rest-1789183661229-5775c4` (Trattoria Alpha 1789183661193) -> Owner: `owner_a_1789183661193@example.com`
- `rest-1789183661636-39b265` (Bistro Beta 1789183661193) -> Owner: `owner_b_1789183661193@example.com`
- `rest-1789184108532-26ebb3` (Trattoria Alpha 1789184108475) -> Owner: `owner_a_1789184108475@example.com`
- `rest-1789184108933-aeeab2` (Bistro Beta 1789184108475) -> Owner: `owner_b_1789184108475@example.com`
- `rest-1789188412860-ee9877` (Trattoria Alpha 1789188412712) -> Owner: `owner_a_1789188412712@example.com`
- `rest-1789188413292-115f21` (Bistro Beta 1789188412712) -> Owner: `owner_b_1789188412712@example.com`

---

## Recovery Procedure
If any purged record is ever required for forensic audit or rollback:
1. Load `scripts/cleanup_backup_data.json`.
2. Find the target record in the corresponding collection.
3. Execute `INSERT INTO <table> ...` with the archived fields.
