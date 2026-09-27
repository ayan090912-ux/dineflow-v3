import asyncio
import asyncpg
import os

CONN_STR = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL")
if not CONN_STR:
    raise ValueError("DATABASE_URL or DATABASE_URL_SYNC environment variable is required.")
if CONN_STR.startswith("postgresql+asyncpg://"):
    CONN_STR = CONN_STR.replace("postgresql+asyncpg://", "postgresql://")
async def ensure_pizza_house():
    conn = await asyncpg.connect(CONN_STR)
    row = await conn.fetchrow("SELECT id, slug FROM restaurants WHERE slug = 'pizza-house';")
    if row:
        rest_id = row['id']
        print(f"pizza-house already exists with id: {rest_id}")
    else:
        rest_id = 'rest-pizza-house'
        await conn.execute("""
            INSERT INTO restaurants (id, name, slug, public_slug, cuisine, business_type, address, phone, email, currency, tax_percentage, lifecycle_status, is_approved, has_tables, has_kitchen, has_bar, created_at, updated_at)
            VALUES ($1, 'Pizza House', 'pizza-house', 'pizza-house', 'Artisanal Wood-Fired Pizza', 'RESTAURANT', '450 Little Italy Way', '+1 555-749-9201', 'contact@pizzahouse.food', 'USD ($)', 8.25, 'LIVE', TRUE, TRUE, TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET lifecycle_status = 'LIVE', is_approved = TRUE;
        """, rest_id)
        print(f"Created pizza-house with id: {rest_id}")

    # Ensure Domain
    await conn.execute("""
        INSERT INTO restaurant_domains (id, restaurant_id, hostname, domain, domain_type, verification_status, is_primary, is_verified, created_at, updated_at)
        VALUES ($1, $2, 'pizza-house.dinely.food', 'pizza-house.dinely.food', 'SUBDOMAIN', 'VERIFIED', TRUE, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (hostname) DO NOTHING;
    """, f'dom-{rest_id}', rest_id)

    # Ensure Tables (including Table 01 to Table 04)
    for i in range(1, 5):
        num = f"Table {i:02d}"
        t_id = f"tbl-{rest_id}-table_{i:02d}"
        qr = f"https://pizza-house.dinely.food/customer?table={num}&tableId={t_id}"
        await conn.execute("""
            INSERT INTO tables (id, restaurant_id, table_number, section, capacity, status, qr_code_url, created_at, updated_at)
            VALUES ($1, $2, $3, 'Main Dining Room', 4, 'AVAILABLE', $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO NOTHING;
        """, t_id, rest_id, num, qr)

    # Ensure Categories
    cats = [
        (f'cat-{rest_id}-pizzas', 'Wood-Fired Pizzas', 1),
        (f'cat-{rest_id}-starters', 'Antipasti & Salads', 2),
        (f'cat-{rest_id}-drinks', 'Craft Beers & Sodas', 3),
    ]
    for c_id, name, order in cats:
        await conn.execute("""
            INSERT INTO menu_categories (id, restaurant_id, name, sort_order, is_enabled, created_at, updated_at)
            VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
        """, c_id, rest_id, name, order)

    # Ensure Menu Items
    items = [
        (f'item-{rest_id}-1', rest_id, f'cat-{rest_id}-pizzas', 'Margherita D.O.P.', 'San Marzano tomatoes, fresh buffalo mozzarella, fresh basil, extra virgin olive oil.', 18.00, 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=600', True, True, 'KITCHEN'),
        (f'item-{rest_id}-2', rest_id, f'cat-{rest_id}-pizzas', 'Diavola Pepperoni', 'Spicy Calabrian salami, smoked provolone, crushed red pepper, wildflower honey.', 21.50, 'https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?w=600', True, False, 'KITCHEN'),
        (f'item-{rest_id}-3', rest_id, f'cat-{rest_id}-starters', 'Burrata Pugliese', 'Creamy Pugliese burrata, heirloom cherry tomatoes, aged balsamic reduction, focaccia.', 15.00, 'https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=600', True, True, 'KITCHEN'),
        (f'item-{rest_id}-4', rest_id, f'cat-{rest_id}-drinks', 'Peroni Nastro Azzurro', 'Crisp Italian lager with citrus aroma and a clean, refreshing finish.', 7.50, 'https://images.unsplash.com/photo-1608270190989-c5299446f888?w=600', True, True, 'BAR'),
    ]
    for i_id, r_id, c_id, name, desc, price, img, avail, veg, dest in items:
        await conn.execute("""
            INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, image_url, is_available, is_vegetarian, target_destination, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                category_id = EXCLUDED.category_id,
                is_available = EXCLUDED.is_available,
                is_vegetarian = EXCLUDED.is_vegetarian,
                target_destination = EXCLUDED.target_destination;
        """, i_id, r_id, c_id, name, desc, price, img, avail, veg, dest)

    p_count = await conn.fetchval("SELECT count(*) FROM menu_items WHERE restaurant_id = $1;", rest_id)
    t_count = await conn.fetchval("SELECT count(*) FROM tables WHERE restaurant_id = $1;", rest_id)
    print(f"Pizza House ready: {p_count} items, {t_count} tables.")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(ensure_pizza_house())
