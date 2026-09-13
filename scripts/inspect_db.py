import os
import psycopg2
import json

db_url = os.environ.get("DATABASE_URL_SYNC", "postgresql://postgres:postgres@localhost:5432/dineflow")
print(f"Connecting to: {db_url.split('@')[-1] if '@' in db_url else db_url}")

conn = psycopg2.connect(db_url)
cur = conn.cursor()

# Get all tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
tables = [r[0] for r in cur.fetchall()]
print(f"Tables ({len(tables)}): {tables}")

# Check restaurants
if 'restaurants' in tables:
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='restaurants' ORDER BY ordinal_position")
    cols = [r[0] for r in cur.fetchall()]
    print(f"\nRestaurant columns: {cols}")
    cur.execute("SELECT * FROM restaurants")
    rests = cur.fetchall()
    print(f"Total Restaurants: {len(rests)}")
    for r in rests:
        d = dict(zip(cols, r))
        print(f" - ID: {d.get('id')}, Name: {d.get('name')}, Slug: {d.get('slug')}, PublicSlug: {d.get('public_slug')}, Status: {d.get('lifecycle_status')}, Approved: {d.get('is_approved')}, Owner: {d.get('owner_email')}")

# Check restaurant_domains
if 'restaurant_domains' in tables:
    cur.execute("SELECT id, restaurant_id, hostname, domain, domain_type, verification_status, is_primary, is_verified FROM restaurant_domains")
    domains = cur.fetchall()
    print(f"\nTotal Domains: {len(domains)}")
    for d in domains:
        print(f" - ID: {d[0]}, RestID: {d[1]}, Host: {d[2]}, Domain: {d[3]}, Primary: {d[6]}, Verified: {d[7]}")

# Check restaurant_memberships
if 'restaurant_memberships' in tables:
    cur.execute("SELECT id, restaurant_id, user_uid, user_email, role FROM restaurant_memberships")
    mems = cur.fetchall()
    print(f"\nTotal Memberships: {len(mems)}")
    for m in mems:
        print(f" - RestID: {m[1]}, Email: {m[3]}, Role: {m[4]}")

# Check tables
if 'tables' in tables:
    cur.execute("SELECT id, restaurant_id, table_number, qr_code_url, is_active FROM tables")
    tbls = cur.fetchall()
    print(f"\nTotal Tables: {len(tbls)}")
    for t in tbls:
        print(f" - ID: {t[0]}, RestID: {t[1]}, Table: {t[2]}, QR: {t[3]}")

# Check orders
if 'orders' in tables:
    cur.execute("SELECT id, restaurant_id, table_number, total_amount, status, created_at FROM orders")
    ords = cur.fetchall()
    print(f"\nTotal Orders: {len(ords)}")
    for o in ords:
        print(f" - ID: {o[0]}, RestID: {o[1]}, Table: {o[2]}, Total: {o[3]}, Status: {o[4]}")

conn.close()
