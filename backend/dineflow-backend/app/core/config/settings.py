import urllib.parse
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, model_validator


def normalize_database_urls(raw_url: str, env: str) -> tuple[str, str]:
    """
    Safely normalizes database connection strings for asyncpg / SQLAlchemy and sync drivers:
    - Converts postgres:// or postgresql:// to postgresql+asyncpg:// for async operations.
    - Converts postgresql+asyncpg:// to postgresql:// for sync operations (e.g. Alembic offline).
    - Enforces sslmode=require for remote databases (e.g. Neon PostgreSQL).
    - Validates that localhost / 127.0.0.1 is not used when ENVIRONMENT is 'production'.
    """
    url = raw_url.strip()

    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme
    hostname = (parsed.hostname or "").lower()

    is_local = hostname in ("localhost", "127.0.0.1", "db", "0.0.0.0", "::1")

    # Production safety check: Prevent localhost in production
    if env.lower() == "production" and is_local:
        raise ValueError(
            "In production environment (ENVIRONMENT='production'), DATABASE_URL must point "
            "to a production database (e.g. Neon PostgreSQL) and cannot be localhost or 127.0.0.1."
        )

    # SSL enforcement for remote DB or production PostgreSQL
    query_params = urllib.parse.parse_qs(parsed.query)
    if "postgres" in scheme and (not is_local or env.lower() == "production"):
        if "sslmode" not in query_params and "ssl" not in query_params:
            query_str = f"{parsed.query}&sslmode=require" if parsed.query else "sslmode=require"
            parsed = parsed._replace(query=query_str)

    # Determine base schemes
    if scheme.startswith("postgres"):
        async_scheme = "postgresql+asyncpg"
        sync_scheme = "postgresql"
    elif scheme.startswith("sqlite"):
        async_scheme = "sqlite+aiosqlite"
        sync_scheme = "sqlite"
    else:
        async_scheme = scheme
        sync_scheme = scheme

    # Query params handling for SSL
    query_params = urllib.parse.parse_qs(parsed.query)

    # Build Async URL (asyncpg requires 'ssl=require', NOT 'sslmode=require')
    async_params = dict(query_params)
    if "postgres" in scheme and (not is_local or env.lower() == "production"):
        if "sslmode" in async_params:
            del async_params["sslmode"]
        if "ssl" not in async_params:
            async_params["ssl"] = ["require"]
    async_query_str = urllib.parse.urlencode(async_params, doseq=True)
    async_parsed = parsed._replace(scheme=async_scheme, query=async_query_str)
    async_url = urllib.parse.urlunparse(async_parsed)

    # Build Sync URL (libpq / psycopg2 uses 'sslmode=require')
    sync_params = dict(query_params)
    if "postgres" in scheme and (not is_local or env.lower() == "production"):
        if "ssl" in sync_params:
            del sync_params["ssl"]
        if "sslmode" not in sync_params:
            sync_params["sslmode"] = ["require"]
    sync_query_str = urllib.parse.urlencode(sync_params, doseq=True)
    sync_parsed = parsed._replace(scheme=sync_scheme, query=sync_query_str)
    sync_url = urllib.parse.urlunparse(sync_parsed)

    return async_url, sync_url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    # App
    APP_NAME: str = "Dinely Cloud"
    APP_VERSION: str = "2.0.0"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dinely"
    DATABASE_URL_SYNC: str = "postgresql://postgres:postgres@localhost:5432/dinely"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_PRE_PING: bool = True

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_PASSWORD: Optional[str] = None

    # JWT
    JWT_ACCESS_SECRET_KEY: str = Field(..., min_length=32)
    JWT_REFRESH_SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    JWT_REFRESH_TOKEN_EXPIRE_HOURS_CUSTOMER: int = 4

    # Argon2
    ARGON2_TIME_COST: int = 3
    ARGON2_MEMORY_COST: int = 65536
    ARGON2_PARALLELISM: int = 4

    # CORS
    CORS_ORIGINS: List[str] = [
        "https://dinely.food",
        "https://www.dinely.food",
        "https://dineflow-v3.onrender.com",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True


    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: int = 100
    RATE_LIMIT_WINDOW: int = 60

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # Payments
    RAZORPAY_KEY_ID: Optional[str] = None
    RAZORPAY_KEY_SECRET: Optional[str] = None
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    # Notifications
    SENDGRID_API_KEY: Optional[str] = None
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None

    # Sentry
    SENTRY_DSN: Optional[str] = None

    # URLs
    CUSTOMER_APP_URL: str = "https://dinely.food/customer"
    RESTAURANT_DASHBOARD_URL: str = "https://dinely.food/restaurant/dashboard"
    PLATFORM_ADMIN_URL: str = "https://dinely.food/platform-admin"

    # Platform Admin Security & Firebase
    PLATFORM_ADMIN_FIREBASE_UID: Optional[str] = None
    PLATFORM_ADMIN_EMAIL: Optional[str] = "ayan090912@gmail.com"
    FIREBASE_PROJECT_ID: str = "dinely-cd6cd"
    FIREBASE_SERVICE_ACCOUNT_KEY_PATH: Optional[str] = None

    @field_validator("CORS_ORIGINS", mode="before")
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @model_validator(mode="after")
    def validate_and_normalize_db_urls(self):
        async_url, sync_url = normalize_database_urls(self.DATABASE_URL, self.ENVIRONMENT)
        self.DATABASE_URL = async_url
        self.DATABASE_URL_SYNC = sync_url
        return self


@lru_cache()
def get_settings() -> Settings:
    return Settings()

