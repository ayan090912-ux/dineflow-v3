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


@pytest_asyncio.fixture(scope="function")
async def db_session():
    async with engine.begin() as conn:
        await conn.exec_driver_sql("PRAGMA foreign_keys=OFF")
        await conn.run_sync(lambda c: Base.metadata.create_all(c, tables=[PlatformAdmin.__table__, RefreshToken.__table__]))

    async with TestingSessionLocal() as session:
        yield session
        await session.rollback()

    async with engine.begin() as conn:
        await conn.run_sync(lambda c: Base.metadata.drop_all(c, tables=[PlatformAdmin.__table__, RefreshToken.__table__]))


@pytest.fixture(scope="function", autouse=True)
def override_get_db(db_session):
    async def _get_db():
        yield db_session

    app.dependency_overrides[get_db] = _get_db
    yield
    del app.dependency_overrides[get_db]
