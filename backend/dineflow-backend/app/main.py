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
    ]
    for stmt in baseline_sync_statements:
        try:
            await conn.execute(text(stmt))
        except Exception:
            pass



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
    origin_regex = r"^https://([a-zA-Z0-9-]+\.)*(dinely\.food|web\.app|firebaseapp\.com|onrender\.com|run\.app)$"
else:
    origin_regex = r"https://.*dinely\.food|https://.*onrender\.com|https://.*run\.app|http://.*"

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
from app.core.database.connection import AsyncSessionLocal

# Health & Readiness checks
@app.get("/healthz")
@app.get("/health")
@app.get("/api/v1/health")
@app.get("/api/v1/healthz")
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "commit": "v3-hardening-prod-1"
    }

@app.get("/readyz")
@app.get("/ready")
@app.get("/api/v1/readyz")
@app.get("/api/v1/ready")
async def readiness_check():
    db_status = "unknown"
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
            db_status = "connected"
    except Exception as e:
        db_status = f"error: {str(e)}"

    return {
        "status": "ready" if db_status == "connected" else "degraded",
        "database": db_status,
        "version": settings.APP_VERSION
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

# API Routes
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(platform_router, prefix="/api/v1/admin", tags=["Platform Admin"])
app.include_router(restaurant_router, prefix="/api/v1/restaurants", tags=["Restaurants"])
app.include_router(tax_router, prefix="/api/v1/restaurants", tags=["Taxes"])
app.include_router(billing_router, prefix="/api/v1/restaurants", tags=["Billing & Invoices"])
app.include_router(menu_router, prefix="/api/v1/restaurants", tags=["Menu"])
app.include_router(table_router, prefix="/api/v1/restaurants", tags=["Tables"])
app.include_router(order_router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(customer_requests_router, prefix="/api/v1/customer-requests", tags=["Customer Requests"])
app.include_router(inventory_router, prefix="/api/v1", tags=["Inventory & Suppliers"])
app.include_router(websocket_router, prefix="/api/v1", tags=["Realtime WebSocket"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
