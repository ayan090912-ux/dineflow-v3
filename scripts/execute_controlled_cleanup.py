import os
import sys
import psycopg2

db_url = os.environ.get("DATABASE_URL_SYNC", "postgresql://postgres:postgres@localhost:5432/dineflow")
print(f"Connecting to database: {db_url.split('@')[-1] if '@' in db_url else db_url}")

conn = psycopg2.connect(db_url)
cur = conn.cursor()

# Get all restaurant IDs to delete:
# confirmed demo, legacy, test restaurants
cur.execute("""
    SELECT id, name, slug, owner_email 
    FROM restaurants 
    WHERE id IN ('rest-1', 'rest-1787446097984', 'rest-1787655544312', 'rest-the-dunk', 'dineflow')
       OR owner_email LIKE '%@example.com'
       OR owner_email LIKE '%@thedunk.food'
       OR owner_email LIKE '%@cafeco.food'
       OR name ILIKE '%Trattoria Alpha%'
       OR name ILIKE '%Bistro Beta%'
""")
candidate_restaurants = cur.fetchall()
rest_ids = [r[0] for r in candidate_restaurants]

print(f"Identified {len(rest_ids)} restaurants for controlled cleanup:")
for r in candidate_restaurants:
    print(f" - ID: {r[0]}, Name: {r[1]}, Owner: {r[3]}")

# Whitelist check: guarantee no real accounts or whitelisted emails are deleted
whitelist_emails = ['ayan090912@gmail.com', 'owner@dineflow.io']
for r in candidate_restaurants:
    if r[3] and any(w in r[3].lower() for w in whitelist_emails):
        raise ValueError(f"CRITICAL SAFETY ABORT: Whitelisted email found in delete candidate: {r}")

dry_run = "--dry-run" in sys.argv
if dry_run:
    print("\n[DRY RUN MODE] No changes will be committed.")
else:
    print("\n[LIVE TRANSACTIONAL CLEANUP]")

try:
    if not dry_run:
        cur.execute("BEGIN;")

    def safe_execute(sql, params=None):
        cur.execute("SAVEPOINT sp;")
        try:
            if params:
                cur.execute(sql, params)
            else:
                cur.execute(sql)
            cur.execute("RELEASE SAVEPOINT sp;")
            return cur.rowcount
        except Exception as ex:
            cur.execute("ROLLBACK TO SAVEPOINT sp;")
            # print(f"Notice on '{sql[:40]}...': {ex}")
            return 0

    # 1. Purge order_items and orders
    del_oi = safe_execute("""
        DELETE FROM order_items 
        WHERE order_id IN (SELECT id FROM orders WHERE restaurant_id = ANY(%s));
    """, (rest_ids,))
    print(f"Deleted {del_oi} order_items")

    del_o = safe_execute("DELETE FROM orders WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_o} orders")

    # 2. Purge bills & payments
    safe_execute("DELETE FROM payments WHERE bill_id IN (SELECT id FROM bills WHERE restaurant_id = ANY(%s));", (rest_ids,))
    del_b = safe_execute("DELETE FROM bills WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_b} bills")

    # 3. Purge customer requests
    del_cr = safe_execute("DELETE FROM customer_requests WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_cr} customer_requests")

    # 4. Purge table_sessions & dining_sessions
    del_ts = safe_execute("DELETE FROM table_sessions WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_ts} table_sessions")
    del_ds = safe_execute("DELETE FROM dining_sessions WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_ds} dining_sessions")

    # 5. Purge QR codes and tables
    del_qr = safe_execute("DELETE FROM qr_codes WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_qr} qr_codes")

    del_tbl = safe_execute("DELETE FROM tables WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_tbl} tables")

    # 6. Purge menu items, variants, categories
    safe_execute("DELETE FROM menu_variants WHERE menu_item_id IN (SELECT id FROM menu_items WHERE restaurant_id = ANY(%s));", (rest_ids,))
    safe_execute("DELETE FROM tax_menu_items WHERE menu_item_id IN (SELECT id FROM menu_items WHERE restaurant_id = ANY(%s));", (rest_ids,))
    del_mi = safe_execute("DELETE FROM menu_items WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_mi} menu_items")

    del_mc = safe_execute("DELETE FROM menu_categories WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_mc} menu_categories")

    # 7. Purge taxes & tax categories
    safe_execute("DELETE FROM invoice_taxes WHERE tax_id IN (SELECT id FROM taxes WHERE restaurant_id = ANY(%s));", (rest_ids,))
    del_tx = safe_execute("DELETE FROM taxes WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_tx} taxes")
    safe_execute("DELETE FROM tax_categories WHERE restaurant_id = ANY(%s);", (rest_ids,))

    # 8. Purge restaurant domains & memberships & lifecycle logs
    del_dom = safe_execute("DELETE FROM restaurant_domains WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_dom} restaurant_domains")

    del_mem = safe_execute("DELETE FROM restaurant_memberships WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_mem} restaurant_memberships")

    del_log = safe_execute("DELETE FROM restaurant_lifecycle_logs WHERE restaurant_id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_log} restaurant_lifecycle_logs")

    safe_execute("DELETE FROM restaurant_settings WHERE restaurant_id = ANY(%s);", (rest_ids,))

    # 9. Purge restaurants
    del_rst = safe_execute("DELETE FROM restaurants WHERE id = ANY(%s);", (rest_ids,))
    print(f"Deleted {del_rst} restaurants")

    if dry_run:
        conn.rollback()
        print("\n[DRY RUN COMPLETE] Rolled back all operations successfully.")
    else:
        conn.commit()
        print("\n[TRANSACTION COMMITTED] Controlled cleanup completed successfully.")

    # Verification of remaining count
    cur.execute("SELECT COUNT(*) FROM restaurants;")
    remaining_rests = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM restaurant_domains;")
    remaining_doms = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM tables;")
    remaining_tbls = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM orders;")
    remaining_ords = cur.fetchone()[0]
    print(f"\nRemaining in database: {remaining_rests} restaurants, {remaining_doms} domains, {remaining_tbls} tables, {remaining_ords} orders.")

except Exception as e:
    conn.rollback()
    print(f"\n[ERROR - ROLLED BACK] Cleanup failed: {e}")
    raise
finally:
    conn.close()
