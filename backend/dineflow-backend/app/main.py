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
           ON CONFLICT (hostname) DO NOTHING;""",
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

# Middleware
app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
cors_origins = settings.CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*dinely\.food|https://.*onrender\.com|http://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    max_age=86400,
)



from sqlalchemy import text
from app.core.database.connection import AsyncSessionLocal

# Health & Readiness checks
@app.get("/healthz")
@app.get("/health")
@app.get("/api/v1/health")
@app.get("/api/v1/healthz")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

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
