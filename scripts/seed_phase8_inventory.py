import asyncio, sys, os
sys.path.insert(0, os.path.abspath('.'))
from app.core.database.connection import get_db_session
from app.modules.inventory.models import InventoryItemModel
from app.modules.restaurants.models import Restaurant
from sqlalchemy import select

TENANT_A_ID = 'rest-1789290279546-153fe8'
TENANT_B_ID = 'rest-1789290279931-855f74'

async def seed_inventory():
    async with get_db_session() as s:
        # Check Tenant A
        res_a = await s.execute(select(InventoryItemModel).where(InventoryItemModel.restaurant_id == TENANT_A_ID))
        items_a = res_a.scalars().all()
        if not items_a:
            item1 = InventoryItemModel(
                id='inv-a-truffle-oil',
                restaurant_id=TENANT_A_ID,
                name='Black Truffle Oil',
                category='Oils & Condiments',
                station='KITCHEN',
                quantity=15.0,
                unit='bottles',
                min_threshold=5.0,
                cost_per_unit=1200.0,
                status='IN_STOCK'
            )
            item2 = InventoryItemModel(
                id='inv-a-fresh-mint',
                restaurant_id=TENANT_A_ID,
                name='Fresh Garden Mint',
                category='Herbs & Produce',
                station='BAR',
                quantity=20.0,
                unit='bunches',
                min_threshold=4.0,
                cost_per_unit=40.0,
                status='IN_STOCK'
            )
            s.add(item1)
            s.add(item2)
            print("Seeded inventory for Tenant A")
        else:
            print(f"Tenant A already has {len(items_a)} inventory items")

        # Check Tenant B
        res_b = await s.execute(select(InventoryItemModel).where(InventoryItemModel.restaurant_id == TENANT_B_ID))
        items_b = res_b.scalars().all()
        if not items_b:
            item3 = InventoryItemModel(
                id='inv-b-french-cheese',
                restaurant_id=TENANT_B_ID,
                name='Gruyere Cheese',
                category='Dairy & Cheese',
                station='KITCHEN',
                quantity=10.0,
                unit='kg',
                min_threshold=3.0,
                cost_per_unit=1800.0,
                status='IN_STOCK'
            )
            item4 = InventoryItemModel(
                id='inv-b-matcha-powder',
                restaurant_id=TENANT_B_ID,
                name='Ceremonial Matcha Powder',
                category='Tea & Coffee',
                station='BAR',
                quantity=8.0,
                unit='tins',
                min_threshold=2.0,
                cost_per_unit=2500.0,
                status='IN_STOCK'
            )
            s.add(item3)
            s.add(item4)
            print("Seeded inventory for Tenant B")
        else:
            print(f"Tenant B already has {len(items_b)} inventory items")

if __name__ == '__main__':
    asyncio.run(seed_inventory())
