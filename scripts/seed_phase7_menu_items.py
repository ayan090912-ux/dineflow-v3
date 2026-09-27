import os
import sys
import asyncio
from datetime import datetime, timezone

# Add backend directory to sys.path
backend_dir = r"c:\dineflow v3\v3\backend\dineflow-backend"
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from sqlalchemy import select, delete
from app.core.database.connection import get_db_session
from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem

TENANT_A_ID = "rest-1789290279546-153fe8"
TENANT_B_ID = "rest-1789290279931-855f74"

TENANT_A_ITEMS = [
    {
        "id": "mi-a-truffle-fries",
        "category_id": f"cat-{TENANT_A_ID}-1",  # Starters & Appetizers
        "name": "Truffle Herb Fries",
        "description": "Crispy russet fries tossed with black truffle oil, rosemary, and aged parmesan.",
        "price": 280.0,
        "is_available": True,
        "is_vegetarian": True,
        "dietary_type": "VEG",
        "target_destination": "KITCHEN",
        "preparation_time_minutes": 12,
    },
    {
        "id": "mi-a-wagyu-burger",
        "category_id": f"cat-{TENANT_A_ID}-2",  # Main Course
        "name": "Prime Wagyu Burger",
        "description": "Brioche bun, 200g grilled patty, caramelized onions, smoked cheddar, house aioli.",
        "price": 550.0,
        "is_available": True,
        "is_vegetarian": False,
        "dietary_type": "NON_VEG",
        "target_destination": "KITCHEN",
        "preparation_time_minutes": 18,
    },
    {
        "id": "mi-a-citrus-cooler",
        "category_id": f"cat-{TENANT_A_ID}-4",  # Beverages & Drinks
        "name": "Fresh Citrus Cooler",
        "description": "Sparkling lime, pink grapefruit reduction, mint leaves, crushed ice.",
        "price": 210.0,
        "is_available": True,
        "is_vegetarian": True,
        "dietary_type": "VEG",
        "target_destination": "BAR",
        "preparation_time_minutes": 5,
    },
]

TENANT_B_ITEMS = [
    {
        "id": "mi-b-onion-soup",
        "category_id": f"cat-{TENANT_B_ID}-1",  # Starters & Appetizers
        "name": "French Onion Soup",
        "description": "Slow-caramelized onions, rich beef broth, sourdough crouton, melted gruyere.",
        "price": 320.0,
        "is_available": True,
        "is_vegetarian": False,
        "dietary_type": "NON_VEG",
        "target_destination": "KITCHEN",
        "preparation_time_minutes": 15,
    },
    {
        "id": "mi-b-croque-monsieur",
        "category_id": f"cat-{TENANT_B_ID}-2",  # Main Course
        "name": "Croque Monsieur",
        "description": "Toasted brioche, smoked ham, bechamel sauce, gratin of Comte cheese.",
        "price": 420.0,
        "is_available": True,
        "is_vegetarian": False,
        "dietary_type": "NON_VEG",
        "target_destination": "KITCHEN",
        "preparation_time_minutes": 14,
    },
    {
        "id": "mi-b-matcha-latte",
        "category_id": f"cat-{TENANT_B_ID}-4",  # Beverages & Drinks
        "name": "Iced Matcha Latte",
        "description": "Ceremonial Uji matcha whisked with oat milk and Madagascar vanilla syrup.",
        "price": 240.0,
        "is_available": True,
        "is_vegetarian": True,
        "dietary_type": "VEG",
        "target_destination": "BAR",
        "preparation_time_minutes": 6,
    },
]

async def seed_menu():
    async with get_db_session() as session:
        print("Seeding menu items for Tenant A and Tenant B...")
        
        # 1. Seed Tenant A
        for item_data in TENANT_A_ITEMS:
            existing = await session.get(MenuItem, item_data["id"])
            if not existing:
                session.add(MenuItem(
                    restaurant_id=TENANT_A_ID,
                    **item_data
                ))
                print(f"  + Added Tenant A item: {item_data['name']}")
            else:
                for k, v in item_data.items():
                    setattr(existing, k, v)
                print(f"  ~ Updated Tenant A item: {item_data['name']}")

        # 2. Seed Tenant B
        for item_data in TENANT_B_ITEMS:
            existing = await session.get(MenuItem, item_data["id"])
            if not existing:
                session.add(MenuItem(
                    restaurant_id=TENANT_B_ID,
                    **item_data
                ))
                print(f"  + Added Tenant B item: {item_data['name']}")
            else:
                for k, v in item_data.items():
                    setattr(existing, k, v)
                print(f"  ~ Updated Tenant B item: {item_data['name']}")

        await session.commit()
        print("Menu items seeded successfully into PostgreSQL!")

if __name__ == "__main__":
    asyncio.run(seed_menu())
