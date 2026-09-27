import asyncio
import asyncpg
import os

CONN_STR = os.environ.get("DATABASE_URL_SYNC") or os.environ.get("DATABASE_URL")
if not CONN_STR:
    raise ValueError("DATABASE_URL or DATABASE_URL_SYNC environment variable is required.")
if CONN_STR.startswith("postgresql+asyncpg://"):
    CONN_STR = CONN_STR.replace("postgresql+asyncpg://", "postgresql://")

REST_ID = 'rest-1788659067434'

ITEMS = [
    {
        'id': f'item-{REST_ID}-1',
        'restaurant_id': REST_ID,
        'category_id': f'cat-{REST_ID}-1',
        'name': 'Truffle Mushroom Arancini',
        'description': 'Crispy carnaroli risotto balls filled with wild mushrooms and fontina, served with truffle aioli.',
        'price': 14.50,
        'image_url': 'https://images.unsplash.com/photo-1541529086526-db283c563270?w=600&auto=format&fit=crop&q=80',
        'is_available': True,
        'is_vegetarian': True,
        'target_destination': 'KITCHEN'
    },
    {
        'id': f'item-{REST_ID}-2',
        'restaurant_id': REST_ID,
        'category_id': f'cat-{REST_ID}-1',
        'name': 'Crispy Calamari Fritti',
        'description': 'Tender wild squid dusted in seasoned semolina, served with smoked paprika garlic aioli and lemon.',
        'price': 16.00,
        'image_url': 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80',
        'is_available': True,
        'is_vegetarian': False,
        'target_destination': 'KITCHEN'
    },
    {
        'id': f'item-{REST_ID}-3',
        'restaurant_id': REST_ID,
        'category_id': f'cat-{REST_ID}-2',
        'name': 'Pan-Seared Salmon Fillet',
        'description': 'Atlantic salmon with crispy skin, served on charred broccolini and a veloute lemon butter caper glaze.',
        'price': 28.90,
        'image_url': 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600&auto=format&fit=crop&q=80',
        'is_available': True,
        'is_vegetarian': False,
        'target_destination': 'KITCHEN'
    },
    {
        'id': f'item-{REST_ID}-4',
        'restaurant_id': REST_ID,
        'category_id': f'cat-{REST_ID}-2',
        'name': 'Wood-Fired Ribeye Steak',
        'description': 'Prime aged 12oz ribeye steak charred over white oak, herb compound butter, roasted garlic jus.',
        'price': 34.50,
        'image_url': 'https://images.unsplash.com/photo-1558030006-450675393462?w=600&auto=format&fit=crop&q=80',
        'is_available': True,
        'is_vegetarian': False,
        'target_destination': 'KITCHEN'
    },
    {
        'id': f'item-{REST_ID}-5',
        'restaurant_id': REST_ID,
        'category_id': f'cat-{REST_ID}-3',
        'name': 'Classic Tiramisu',
        'description': 'Espresso-soaked savoiardi layered with zabaione mascarpone cream, dusted with Valrhona cocoa.',
        'price': 9.50,
        'image_url': 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600&auto=format&fit=crop&q=80',
        'is_available': True,
        'is_vegetarian': True,
        'target_destination': 'KITCHEN'
    },
    {
        'id': f'item-{REST_ID}-6',
        'restaurant_id': REST_ID,
        'category_id': f'cat-{REST_ID}-4',
        'name': 'Artisanal Smoked Old Fashioned',
        'description': 'Rye whiskey infused with Madagascar vanilla bitters and Demerara syrup, served over hand-cut ice.',
        'price': 16.00,
        'image_url': 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
        'is_available': True,
        'is_vegetarian': True,
        'target_destination': 'BAR'
    }
]

async def seed():
    conn = await asyncpg.connect(CONN_STR)
    print("Seeding THE Fly menu items in Neon...")
    for item in ITEMS:
        await conn.execute("""
            INSERT INTO menu_items (id, restaurant_id, category_id, name, description, price, image_url, is_available, is_vegetarian, target_destination)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                price = EXCLUDED.price,
                category_id = EXCLUDED.category_id,
                is_available = EXCLUDED.is_available,
                is_vegetarian = EXCLUDED.is_vegetarian,
                target_destination = EXCLUDED.target_destination;
        """, item['id'], item['restaurant_id'], item['category_id'], item['name'], item['description'], item['price'], item['image_url'], item['is_available'], item['is_vegetarian'], item['target_destination'])
    
    count = await conn.fetchval("SELECT count(*) FROM menu_items WHERE restaurant_id = $1;", REST_ID)
    print(f"THE Fly now has {count} menu items in Neon PostgreSQL.")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(seed())
