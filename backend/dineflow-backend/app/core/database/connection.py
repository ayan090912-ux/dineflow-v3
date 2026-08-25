from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import event

from app.core.config.settings import get_settings

settings = get_settings()

db_url = settings.DATABASE_URL
if db_url.startswith("postgres"):
    import urllib.parse
    parsed = urllib.parse.urlparse(db_url)
    q_params = urllib.parse.parse_qs(parsed.query)
    clean_params = {k: v for k, v in q_params.items() if k not in ["sslmode", "channel_binding", "gssencmode", "ssl"]}
    new_query = urllib.parse.urlencode(clean_params, doseq=True)
    parsed = parsed._replace(scheme="postgresql+asyncpg", query=new_query)
    db_url = urllib.parse.urlunparse(parsed)
    try:
        import asyncpg  # type: ignore
    except ImportError:
        db_url = "sqlite+aiosqlite:///:memory:"

engine_kwargs = {
    "echo": settings.DEBUG,
    "future": True
}
if "sqlite" not in db_url:
    engine_kwargs.update({
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_pre_ping": settings.DB_POOL_PRE_PING,
        "connect_args": {"ssl": True} if "localhost" not in db_url and "127.0.0.1" not in db_url else {}
    })

# Create async engine
engine = create_async_engine(db_url, **engine_kwargs)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

# Base model for all ORM models
Base = declarative_base()


@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
