import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool

from app.core.database.connection import Base, get_db
from app.modules.roles.models import Role
from app.modules.permissions.models import Permission
from app.modules.auth.models import PlatformAdmin, RefreshToken
from app.modules.users.models import User
from app.modules.employees.models import Employee
from app.main import app

import app.core.database.connection as conn_mod
from sqlalchemy.pool import StaticPool

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    echo=False,
)
TestingSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

conn_mod.engine = engine
conn_mod.AsyncSessionLocal = TestingSessionLocal


from app.modules.restaurants.models import Restaurant
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.tables.models import Table
from app.modules.orders.models import Order, OrderItem, Bill
from app.modules.taxes.models import Tax, TaxCategory, TaxMenuItem, InvoiceTaxSnapshot, TaxAuditLog

TEST_TABLES = [
    PlatformAdmin.__table__,
    RefreshToken.__table__,
    Restaurant.__table__,
    MenuCategory.__table__,
    MenuItem.__table__,
    Table.__table__,
    Order.__table__,
    OrderItem.__table__,
    Bill.__table__,
    Tax.__table__,
    TaxCategory.__table__,
    TaxMenuItem.__table__,
    InvoiceTaxSnapshot.__table__,
    TaxAuditLog.__table__,
]

@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=TEST_TABLES))

    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.drop_all(c, tables=TEST_TABLES))




@pytest.fixture(scope="function", autouse=True)
def override_get_db(db_session):
    async def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    yield
    del app.dependency_overrides[get_db]
