import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config.settings import get_settings
from app.core.security.jwt import create_access_token, create_refresh_token, decode_refresh_token
from app.core.security.password import verify_password
from app.modules.auth.repository import AuthRepository
from app.modules.auth.models import PlatformAdmin, RefreshToken

settings = get_settings()


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = AuthRepository(db)

    async def platform_admin_login(
        self,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None
    ) -> Tuple[str, str, PlatformAdmin]:
        admin = await self.repo.get_platform_admin_by_email(email)
        if not admin:
            raise ValueError("Invalid credentials")

        if not verify_password(password, admin.password_hash):
            raise ValueError("Invalid credentials")

        # Update last login
        admin.last_login_at = datetime.now(timezone.utc)

        # Generate tokens
        token_family = uuid.uuid4()
        access_token = create_access_token(
            subject=admin.id,
            scope="platform",
            extra_claims={"role": "platform_admin"}
        )
        raw_refresh = create_refresh_token(
            subject=admin.id,
            scope="platform",
            token_family=token_family
        )
        refresh_hash = AuthRepository.hash_token(raw_refresh)

        await self.repo.create_refresh_token(
            subject_type="platform_admin",
            subject_id=admin.id,
            token_hash=refresh_hash,
            token_family=token_family,
            previous_token_hash=None,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
            ip_address=ip_address,
            user_agent=user_agent
        )

        await self.db.commit()
        return access_token, raw_refresh, admin

    async def refresh_token(self, refresh_token: str) -> Tuple[str, str]:
        payload = decode_refresh_token(refresh_token)
        if not payload:
            raise ValueError("Invalid refresh token")

        token_hash = AuthRepository.hash_token(refresh_token)
        stored_token = await self.repo.get_refresh_token_by_hash(token_hash)

        if not stored_token or stored_token.revoked_at or stored_token.expires_at < datetime.now(timezone.utc):
            raise ValueError("Invalid or expired refresh token")

        # Revoke old token
        await self.repo.revoke_refresh_token(stored_token, "rotation")

        # Generate new tokens
        subject_id = uuid.UUID(payload["sub"])
        scope = payload["scope"]
        token_family = uuid.UUID(payload["token_family"])

        new_access = create_access_token(subject=subject_id, scope=scope)
        new_refresh = create_refresh_token(subject=subject_id, scope=scope, token_family=token_family)
        new_refresh_hash = AuthRepository.hash_token(new_refresh)

        await self.repo.create_refresh_token(
            subject_type=stored_token.subject_type,
            subject_id=subject_id,
            token_hash=new_refresh_hash,
            token_family=token_family,
            previous_token_hash=token_hash,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS)
        )

        await self.db.commit()
        return new_access, new_refresh

    async def logout(self, refresh_token: str) -> None:
        token_hash = AuthRepository.hash_token(refresh_token)
        stored_token = await self.repo.get_refresh_token_by_hash(token_hash)
        if stored_token:
            await self.repo.revoke_refresh_token(stored_token, "logout")
            await self.db.commit()

    async def logout_all(self, subject_type: str, subject_id: uuid.UUID) -> None:
        await self.repo.revoke_all_tokens_for_subject(subject_type, subject_id, "logout_all")
        await self.db.commit()
