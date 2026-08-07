import uuid
import hashlib
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import PlatformAdmin, RefreshToken


class AuthRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # Platform Admin
    async def get_platform_admin_by_email(self, email: str) -> Optional[PlatformAdmin]:
        result = await self.db.execute(
            select(PlatformAdmin).where(
                and_(PlatformAdmin.email == email, PlatformAdmin.is_active == True)
            )
        )
        return result.scalar_one_or_none()

    async def get_platform_admin_by_id(self, admin_id: uuid.UUID) -> Optional[PlatformAdmin]:
        result = await self.db.execute(
            select(PlatformAdmin).where(PlatformAdmin.id == admin_id)
        )
        return result.scalar_one_or_none()

    # Refresh Tokens
    async def create_refresh_token(
        self,
        subject_type: str,
        subject_id: uuid.UUID,
        token_hash: str,
        token_family: uuid.UUID,
        previous_token_hash: Optional[str],
        expires_at: datetime,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> RefreshToken:
        refresh_token = RefreshToken(
            subject_type=subject_type,
            subject_id=subject_id,
            token_hash=token_hash,
            token_family=token_family,
            previous_token_hash=previous_token_hash,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent
        )
        self.db.add(refresh_token)
        await self.db.flush()
        return refresh_token

    async def get_refresh_token_by_hash(self, token_hash: str) -> Optional[RefreshToken]:
        result = await self.db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        return result.scalar_one_or_none()

    async def revoke_refresh_token(self, token: RefreshToken, reason: str = "logout") -> None:
        token.revoked_at = datetime.now(timezone.utc)
        token.revoked_reason = reason
        await self.db.flush()

    async def revoke_all_tokens_for_subject(self, subject_type: str, subject_id: uuid.UUID, reason: str = "logout_all") -> None:
        from sqlalchemy import update
        await self.db.execute(
            update(RefreshToken)
            .where(
                and_(
                    RefreshToken.subject_type == subject_type,
                    RefreshToken.subject_id == subject_id,
                    RefreshToken.revoked_at.is_(None)
                )
            )
            .values(revoked_at=datetime.now(timezone.utc), revoked_reason=reason)
        )

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()
