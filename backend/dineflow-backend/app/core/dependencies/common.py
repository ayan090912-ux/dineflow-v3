from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.connection import get_db
from app.core.config.settings import get_settings


async def get_database_session() -> AsyncSession:
    async for session in get_db():
        return session


SettingsDep = Depends(get_settings)
DBSessionDep = Depends(get_db)
