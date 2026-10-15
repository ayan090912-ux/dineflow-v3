import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config.settings import get_settings
from app.core.middlewares.logging import LoggingMiddleware
from app.core.middlewares.rate_limit import RateLimitMiddleware
from app.modules.auth.router import router as auth_router
from app.modules.platform.router import router as platform_router

settings = get_settings()


from contextlib import asynccontextmanager
from app.core.database.connection import engine, Base
import app.modules.restaurants.models
import app.modules.menu.models
import app.modules.tables.models
import app.modules.orders.models
import app.modules.customer_requests.models
import app.modules.taxes.models
import app.modules.inventory.models
import app.modules.business_day.models
import app.modules.terminals.models
import app.modules.weddings.models


from sqlalchemy import text

async def ensure_db_schema_columns(conn):
    # Only run PostgreSQL-specific schema synchronization on PostgreSQL engines
    if "postgres" not in str(conn.engine.url).lower():
        return

    create_table_statements = [
        """CREATE TABLE IF NOT EXISTS restaurant_lifecycle_logs (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            previous_status VARCHAR(50),
            new_status VARCHAR(50) NOT NULL,
            reason TEXT,
            performed_by VARCHAR(255),
            performed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );""",
        """CREATE TABLE IF NOT EXISTS restaurant_domains (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            hostname VARCHAR(255) UNIQUE NOT NULL,
            domain VARCHAR(255),
            domain_type VARCHAR(50) DEFAULT 'SUBDOMAIN' NOT NULL,
            verification_status VARCHAR(50) DEFAULT 'VERIFIED' NOT NULL,
            is_primary BOOLEAN DEFAULT TRUE NOT NULL,
            is_verified BOOLEAN DEFAULT TRUE NOT NULL,
            verified_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );""",
        """CREATE TABLE IF NOT EXISTS restaurant_memberships (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            user_uid VARCHAR(255) NOT NULL,
            user_email VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'OWNER' NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_restaurant_membership_user UNIQUE (restaurant_id, user_uid)
        );""",
        """ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS username VARCHAR(100);""",
        """ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);""",
        """ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS password_hash TEXT;""",
        """ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS assigned_terminal VARCHAR(100);""",
        """ALTER TABLE restaurant_memberships ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE NOT NULL;""",
        """CREATE UNIQUE INDEX IF NOT EXISTS ix_restaurant_memberships_username ON restaurant_memberships (LOWER(username)) WHERE username IS NOT NULL;""",
        """CREATE TABLE IF NOT EXISTS business_days (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            business_date VARCHAR(50) NOT NULL,
            status VARCHAR(30) DEFAULT 'OPEN' NOT NULL,
            opened_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            opened_by VARCHAR(255) DEFAULT 'System / Manager',
            closed_at TIMESTAMPTZ,
            closed_by VARCHAR(255),
            total_orders INTEGER DEFAULT 0 NOT NULL,
            food_orders INTEGER DEFAULT 0 NOT NULL,
            bar_orders INTEGER DEFAULT 0 NOT NULL,
            completed_orders INTEGER DEFAULT 0 NOT NULL,
            cancelled_orders INTEGER DEFAULT 0 NOT NULL,
            total_sales FLOAT DEFAULT 0.0 NOT NULL,
            food_sales FLOAT DEFAULT 0.0 NOT NULL,
            bar_sales FLOAT DEFAULT 0.0 NOT NULL,
            tax_amount FLOAT DEFAULT 0.0 NOT NULL,
            discount_amount FLOAT DEFAULT 0.0 NOT NULL,
            cash_sales FLOAT DEFAULT 0.0 NOT NULL,
            card_sales FLOAT DEFAULT 0.0 NOT NULL,
            upi_sales FLOAT DEFAULT 0.0 NOT NULL,
            closing_notes TEXT,
            summary_json JSON,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );""",
        """CREATE TABLE IF NOT EXISTS terminals (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            name VARCHAR(100) NOT NULL,
            terminal_code VARCHAR(50) NOT NULL,
            terminal_type VARCHAR(50) DEFAULT 'WAITER' NOT NULL,
            device_info VARCHAR(255),
            pairing_code VARCHAR(50),
            status VARCHAR(30) DEFAULT 'ACTIVE' NOT NULL,
            ip_address VARCHAR(100),
            last_active_at TIMESTAMPTZ,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            CONSTRAINT uq_restaurant_terminal_code UNIQUE (restaurant_id, terminal_code)
        );""",
        """CREATE INDEX IF NOT EXISTS ix_terminals_restaurant_id ON terminals (restaurant_id);""",
        """CREATE INDEX IF NOT EXISTS ix_terminals_terminal_code ON terminals (terminal_code);""",
        """CREATE TABLE IF NOT EXISTS wedding_events (
            id VARCHAR(255) PRIMARY KEY,
            restaurant_id VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            couple_names VARCHAR(255),
            event_type VARCHAR(50) DEFAULT 'WEDDING' NOT NULL,
            event_date VARCHAR(50) NOT NULL,
            start_time VARCHAR(20) DEFAULT '18:00',
            end_time VARCHAR(20) DEFAULT '23:30',
            venue_name VARCHAR(255),
            welcome_message TEXT,
            theme_color VARCHAR(50) DEFAULT 'champagne' NOT NULL,
            cover_image_url TEXT,
            status VARCHAR(30) DEFAULT 'DRAFT' NOT NULL,
            is_ordering_open BOOLEAN DEFAULT TRUE NOT NULL,
            menu_selection_type VARCHAR(30) DEFAULT 'FULL_MENU' NOT NULL,
            allowed_category_ids JSON,
            allowed_item_ids JSON,
            estimated_guest_count INTEGER DEFAULT 100 NOT NULL,
            notes TEXT,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_events_restaurant_id ON wedding_events (restaurant_id);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_events_event_date ON wedding_events (event_date);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_events_status ON wedding_events (status);""",
        """CREATE TABLE IF NOT EXISTS event_tables (
            id VARCHAR(255) PRIMARY KEY,
            event_id VARCHAR(255) NOT NULL,
            restaurant_id VARCHAR(255) NOT NULL,
            table_number VARCHAR(50) NOT NULL,
            table_label VARCHAR(100),
            capacity INTEGER DEFAULT 8 NOT NULL,
            qr_code_url TEXT,
            is_active BOOLEAN DEFAULT TRUE NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            CONSTRAINT uq_event_table_number UNIQUE (event_id, table_number)
        );""",
        """CREATE INDEX IF NOT EXISTS ix_event_tables_event_id ON event_tables (event_id);""",
        """CREATE INDEX IF NOT EXISTS ix_event_tables_restaurant_id ON event_tables (restaurant_id);""",
        """CREATE TABLE IF NOT EXISTS wedding_access_requests (
            id VARCHAR(255) PRIMARY KEY,
            applicant_name VARCHAR(255) NOT NULL,
            applicant_email VARCHAR(255) NOT NULL,
            applicant_phone VARCHAR(50) NOT NULL,
            wedding_name VARCHAR(255) NOT NULL,
            event_type VARCHAR(50) DEFAULT 'WEDDING' NOT NULL,
            event_date VARCHAR(50) NOT NULL,
            start_time VARCHAR(20) DEFAULT '18:00',
            end_time VARCHAR(20) DEFAULT '23:30',
            venue_name VARCHAR(255) NOT NULL,
            venue_city VARCHAR(100) NOT NULL,
            estimated_guest_count INTEGER DEFAULT 100 NOT NULL,
            catering_notes TEXT,
            catering_restaurant_id VARCHAR(255),
            additional_requirements TEXT,
            notes TEXT,
            lifecycle_status VARCHAR(50) DEFAULT 'SUBMITTED' NOT NULL,
            review_notes TEXT,
            reviewed_by VARCHAR(255),
            reviewed_at TIMESTAMPTZ,
            workspace_id VARCHAR(255),
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_access_requests_applicant_email ON wedding_access_requests (applicant_email);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_access_requests_event_date ON wedding_access_requests (event_date);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_access_requests_lifecycle_status ON wedding_access_requests (lifecycle_status);""",
        """CREATE TABLE IF NOT EXISTS wedding_workspaces (
            id VARCHAR(255) PRIMARY KEY,
            request_id VARCHAR(255),
            owner_email VARCHAR(255) NOT NULL,
            owner_uid VARCHAR(255),
            name VARCHAR(255) NOT NULL,
            restaurant_id VARCHAR(255) NOT NULL,
            event_id VARCHAR(255),
            status VARCHAR(50) DEFAULT 'ACTIVE' NOT NULL,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_workspaces_owner_email ON wedding_workspaces (owner_email);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_workspaces_owner_uid ON wedding_workspaces (owner_uid);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_workspaces_restaurant_id ON wedding_workspaces (restaurant_id);""",
        """ALTER TABLE wedding_events ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(255);""",
        """ALTER TABLE wedding_events ADD COLUMN IF NOT EXISTS organizer_email VARCHAR(255);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_events_workspace_id ON wedding_events (workspace_id);""",
        """CREATE INDEX IF NOT EXISTS ix_wedding_events_organizer_email ON wedding_events (organizer_email);""",
    ]
    for stmt in create_table_statements:
        try:
            await conn.execute(text(stmt))
        except Exception as e:
            print("[SCHEMA INIT NOTICE] Table create error:", e)

    # Ensure baseline data integrity for legacy records (idempotent)
    baseline_sync_statements = [
        """INSERT INTO restaurant_memberships (id, restaurant_id, user_uid, user_email, role)
           SELECT 'mem-' || id, id, owner_uid, COALESCE(owner_email, ''), 'OWNER'
           FROM restaurants
           WHERE owner_uid IS NOT NULL AND deleted_at IS NULL
           ON CONFLICT (restaurant_id, user_uid) DO NOTHING;""",
        """INSERT INTO restaurant_domains (id, restaurant_id, hostname, domain, domain_type, verification_status, is_primary, is_verified)
           SELECT 'dom-' || id, id, COALESCE(public_slug, slug) || '.dinely.food', COALESCE(public_slug, slug) || '.dinely.food', 'SUBDOMAIN', 'VERIFIED', TRUE, TRUE
           FROM restaurants
           WHERE COALESCE(public_slug, slug) IS NOT NULL
           ON CONFLICT (hostname) DO UPDATE SET
               restaurant_id = EXCLUDED.restaurant_id,
               is_verified = TRUE,
               verification_status = 'VERIFIED'
           WHERE EXCLUDED.restaurant_id IN (
               SELECT id FROM restaurants WHERE lifecycle_status = 'LIVE' OR is_approved = TRUE
           );""",
        """UPDATE restaurants
           SET enabled_modules = CASE
               WHEN enabled_modules IS NULL OR jsonb_typeof(enabled_modules::jsonb) != 'array' THEN '["tables"]'::jsonb
               WHEN NOT (enabled_modules::jsonb ? 'tables') THEN enabled_modules::jsonb || '["tables"]'::jsonb
               ELSE enabled_modules::jsonb
           END
           WHERE (has_tables IS TRUE OR has_tables IS NULL)
             AND (enabled_modules IS NULL OR NOT (enabled_modules::jsonb ? 'tables'));""",
    ]
    for stmt in baseline_sync_statements:
        try:
            await conn.execute(text(stmt))
        except Exception:
            pass

    # Ensure schema columns for bills and orders
    schema_patch_statements = [
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS tax_breakdown_json JSON;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS items_snapshot_json JSON;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS orders_snapshot_json JSON;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_verified_by VARCHAR(100);",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS round_off_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS service_charge_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS service_charge_percentage FLOAT DEFAULT 0.0;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_breakdown_json JSON;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS business_day_id VARCHAR(255);",
        "ALTER TABLE tables ADD COLUMN IF NOT EXISTS shape VARCHAR(50) DEFAULT 'RECTANGLE';",
        "ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_x FLOAT DEFAULT 0.0;",
        "ALTER TABLE tables ADD COLUMN IF NOT EXISTS position_y FLOAT DEFAULT 0.0;",
        "ALTER TABLE tables ADD COLUMN IF NOT EXISTS rotation FLOAT DEFAULT 0.0;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type VARCHAR(50) DEFAULT 'DINE_IN';",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_id VARCHAR(255);",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_name VARCHAR(255);",
        "CREATE INDEX IF NOT EXISTS ix_orders_event_id ON orders (event_id);",
    ]
    for stmt in schema_patch_statements:
        try:
            await conn.execute(text(stmt))
        except Exception as e:
            print("[SCHEMA INIT NOTICE] Column patch error:", e)



async def _background_startup_init():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with engine.begin() as conn:
            await ensure_db_schema_columns(conn)
    except Exception as e:
        print("[STARTUP NOTICE] Database table initialization:", e)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Launch startup migration tasks asynchronously in background so uvicorn binds to port immediately
    bg_task = asyncio.create_task(_background_startup_init())
    yield
    if not bg_task.done():
        bg_task.cancel()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Dinely Cloud - Multi-tenant Restaurant Operating System",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

from app.core.middlewares.security_headers import SecurityHeadersMiddleware
from app.core.middlewares.payload_limit import PayloadLimitMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

# Middleware stack (executed in reverse registration order)
app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(PayloadLimitMiddleware)

is_prod_env = (settings.ENVIRONMENT or "").strip().lower() == "production"
cors_origins = settings.CORS_ORIGINS

if is_prod_env:
    origin_regex = r"^https://([a-zA-Z0-9-]+\.)*(dinely\.food|web\.app|firebaseapp\.com)$"
else:
    origin_regex = r"https://.*dinely\.food|http://.*"

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)
# Outermost middleware to ensure all responses receive production security headers
app.add_middleware(SecurityHeadersMiddleware)

# Global Safe Error Handlers (Sanitizes production error output)
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request, exc):
    correlation_id = getattr(request.state, "correlation_id", None)
    headers = getattr(exc, "headers", None) or {}
    if correlation_id:
        headers["X-Correlation-ID"] = correlation_id
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code, "correlation_id": correlation_id},
        headers=headers
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    correlation_id = getattr(request.state, "correlation_id", None)
    # Log sanitized error message server-side with correlation ID
    print(f"[UNHANDLED_EXCEPTION] correlation_id={correlation_id} error={str(exc)[:200]}")
    
    if settings.DEBUG:
        # In debug mode, provide detailed exception message
        detail_msg = f"Internal Server Error: {str(exc)}"
    else:
        # In production, strictly sanitize error messages to prevent leakage
        detail_msg = "An internal server error occurred. Please try again later."

    return JSONResponse(
        status_code=500,
        content={
            "detail": detail_msg,
            "status_code": 500,
            "correlation_id": correlation_id
        },
        headers={"X-Correlation-ID": correlation_id} if correlation_id else None
    )



from sqlalchemy import text
import app.core.database.connection as conn_mod
from app.core.database.connection import AsyncSessionLocal
import os
import subprocess

from typing import Optional
_CACHED_COMMIT_SHA: Optional[str] = None

def get_git_commit() -> str:
    global _CACHED_COMMIT_SHA
    if _CACHED_COMMIT_SHA:
        return _CACHED_COMMIT_SHA

    # 1. Environment variable
    commit = os.environ.get("GIT_COMMIT_SHA") or os.environ.get("COMMIT_SHA")
    if commit and commit.strip():
        _CACHED_COMMIT_SHA = commit.strip()
        return _CACHED_COMMIT_SHA

    # 2. File in app root or candidate paths
    candidate_paths = [
        os.path.join(os.path.dirname(__file__), "..", ".git_commit"),
        os.path.join(os.path.dirname(__file__), ".git_commit"),
        "/app/.git_commit",
        ".git_commit"
    ]
    for p in candidate_paths:
        try:
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        _CACHED_COMMIT_SHA = content
                        return _CACHED_COMMIT_SHA
        except Exception:
            pass

    # 3. Direct git query
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            cwd=os.path.dirname(__file__)
        )
        if res.returncode == 0 and res.stdout.strip():
            _CACHED_COMMIT_SHA = res.stdout.strip()
            return _CACHED_COMMIT_SHA
    except Exception:
        pass

    _CACHED_COMMIT_SHA = "unknown"
    return _CACHED_COMMIT_SHA

# Health & Readiness checks
@app.get("/healthz")
@app.get("/health")
@app.get("/api/v1/health")
@app.get("/api/v1/healthz")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "commit": get_git_commit()
    }

@app.get("/readyz")
@app.get("/ready")
@app.get("/api/v1/readyz")
@app.get("/api/v1/ready")
async def readiness_check():
    db_status = "unknown"
    try:
        async with conn_mod.AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "ready" if db_status == "connected" else "degraded",
        "database": db_status,
        "version": settings.APP_VERSION,
        "commit": get_git_commit()
    }

from app.modules.restaurants.router import router as restaurant_router
from app.modules.menu.router import router as menu_router
from app.modules.tables.router import router as table_router
from app.modules.orders.router import router as order_router
from app.modules.customer_requests.router import router as customer_requests_router
from app.modules.taxes.router import router as tax_router
from app.modules.billing.router import router as billing_router
from app.modules.inventory.router import router as inventory_router
from app.modules.websocket.router import router as websocket_router
from app.modules.business_day.router import router as business_day_router
from app.modules.auth.staff_router import router as staff_auth_router
from app.modules.terminals.router import router as terminal_router
from app.modules.weddings.router import router as wedding_router, public_router as public_wedding_router
from app.modules.weddings.platform_router import weddings_router, admin_weddings_router

# API Routes
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(staff_auth_router, prefix="/api/v1/staff/auth", tags=["Staff Authentication"])
app.include_router(staff_auth_router, prefix="/api/v1/auth/staff", tags=["Staff Authentication Alias"])
app.include_router(platform_router, prefix="/api/v1/admin", tags=["Platform Admin"])
app.include_router(admin_weddings_router, prefix="/api/v1/admin/wedding-requests", tags=["Admin Wedding Requests"])
app.include_router(weddings_router, prefix="/api/v1/weddings", tags=["Weddings Platform"])
app.include_router(restaurant_router, prefix="/api/v1/restaurants", tags=["Restaurants"])
app.include_router(terminal_router, prefix="/api/v1/restaurants", tags=["Terminals"])
app.include_router(wedding_router, prefix="/api/v1/restaurants", tags=["Weddings & Events"])
app.include_router(public_wedding_router, prefix="/api/v1/public", tags=["Public Wedding Events"])
app.include_router(public_wedding_router, prefix="/api/v1", tags=["Public Wedding Events Alias"])
app.include_router(tax_router, prefix="/api/v1/restaurants", tags=["Taxes"])
app.include_router(billing_router, prefix="/api/v1/restaurants", tags=["Billing & Invoices"])
app.include_router(menu_router, prefix="/api/v1/restaurants", tags=["Menu"])
app.include_router(table_router, prefix="/api/v1/restaurants", tags=["Tables"])
app.include_router(order_router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(customer_requests_router, prefix="/api/v1/customer-requests", tags=["Customer Requests"])
app.include_router(inventory_router, prefix="/api/v1", tags=["Inventory & Suppliers"])
app.include_router(business_day_router, prefix="/api/v1/restaurants/{restaurant_id}/business-day", tags=["Business Day"])
app.include_router(websocket_router, prefix="/api/v1", tags=["Realtime WebSocket"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
