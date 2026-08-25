import pytest
from app.core.config.settings import normalize_database_urls, Settings


def test_standard_postgresql_conversion():
    raw = "postgresql://user:pass@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb"
    async_url, sync_url = normalize_database_urls(raw, env="development")
    
    assert async_url.startswith("postgresql+asyncpg://")
    assert sync_url.startswith("postgresql://")
    assert "ssl=require" in async_url
    assert "sslmode=require" in sync_url


def test_legacy_postgres_scheme_conversion():
    raw = "postgres://user:pass@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
    async_url, sync_url = normalize_database_urls(raw, env="production")
    
    assert async_url.startswith("postgresql+asyncpg://")
    assert sync_url.startswith("postgresql://")
    assert "ssl=require" in async_url
    assert "sslmode=require" in sync_url


def test_already_async_scheme_preservation():
    raw = "postgresql+asyncpg://user:pass@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb?sslmode=require"
    async_url, sync_url = normalize_database_urls(raw, env="development")
    
    assert async_url.startswith("postgresql+asyncpg://")
    assert sync_url.startswith("postgresql://")
    assert "ssl=require" in async_url
    assert "sslmode=require" in sync_url


def test_localhost_allowed_in_development():
    raw = "postgresql+asyncpg://postgres:postgres@localhost:5432/dineflow"
    async_url, sync_url = normalize_database_urls(raw, env="development")
    
    assert async_url == "postgresql+asyncpg://postgres:postgres@localhost:5432/dineflow"
    assert sync_url == "postgresql://postgres:postgres@localhost:5432/dineflow"


def test_localhost_rejected_in_production():
    raw = "postgresql+asyncpg://postgres:postgres@localhost:5432/dineflow"
    with pytest.raises(ValueError) as excinfo:
        normalize_database_urls(raw, env="production")
    
    assert "DATABASE_URL must point to a production database" in str(excinfo.value)
    assert "cannot be localhost" in str(excinfo.value)


def test_settings_model_validation(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:secretpass@ep-neon-123.neon.tech/dinely")
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_ACCESS_SECRET_KEY", "0" * 32)
    monkeypatch.setenv("JWT_REFRESH_SECRET_KEY", "1" * 32)
    
    s = Settings()
    assert s.DATABASE_URL.startswith("postgresql+asyncpg://")
    assert s.DATABASE_URL_SYNC.startswith("postgresql://")
    assert "ssl=require" in s.DATABASE_URL
    assert "ep-neon-123.neon.tech" in s.DATABASE_URL


def test_psycopg2_scheme_conversion():
    raw = "postgresql+psycopg2://user:pass@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb"
    async_url, sync_url = normalize_database_urls(raw, env="development")
    
    assert async_url.startswith("postgresql+asyncpg://")
    assert sync_url.startswith("postgresql://")
    assert "ssl=require" in async_url
    assert "sslmode=require" in sync_url


def test_psycopg_scheme_conversion():
    raw = "postgresql+psycopg://user:pass@ep-cool-flower-123456.us-east-2.aws.neon.tech/neondb"
    async_url, sync_url = normalize_database_urls(raw, env="development")
    
    assert async_url.startswith("postgresql+asyncpg://")
    assert sync_url.startswith("postgresql://")
    assert "ssl=require" in async_url
    assert "sslmode=require" in sync_url

