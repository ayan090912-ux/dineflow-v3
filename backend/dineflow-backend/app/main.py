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
from app.scripts.clean_production_applications import run_clean_production_applications


from sqlalchemy import text

async def ensure_db_schema_columns(conn):
    alter_statements = [
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(50);",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_prep_time_minutes INTEGER DEFAULT 15;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS eta_target_timestamp TIMESTAMPTZ;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_json JSONB;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_breakdown_json JSONB;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal FLOAT DEFAULT 0.0;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE orders ALTER COLUMN table_session_id DROP NOT NULL;",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS target_destination VARCHAR(20) DEFAULT 'KITCHEN';",
        "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS notes TEXT;",
        "ALTER TABLE customer_requests ADD COLUMN IF NOT EXISTS table_id VARCHAR(255);",
        # Restaurant Billing & Compliance Columns
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS legal_name VARCHAR(255);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS state VARCHAR(100);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS state_code VARCHAR(10);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS gstin VARCHAR(50);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS pan VARCHAR(50);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS invoice_prefix VARCHAR(20) DEFAULT 'INV-';",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS invoice_starting_number FLOAT DEFAULT 1001;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge_percentage FLOAT DEFAULT 0.0;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS service_charge_enabled BOOLEAN DEFAULT FALSE;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_id VARCHAR(100);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_merchant_name VARCHAR(255);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_qr_url TEXT;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS upi_enabled BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS billing_settings_json JSONB;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_inventory BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS has_billing BOOLEAN DEFAULT TRUE;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS enabled_modules JSONB;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_uid VARCHAR(255);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(50) DEFAULT 'PENDING_APPROVAL';",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS rejection_reason TEXT;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS requested_changes TEXT;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS approved_by VARCHAR(255);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS public_slug VARCHAR(255);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismissed_by VARCHAR(255);",
        "ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;",
        "UPDATE restaurants SET public_slug = slug WHERE public_slug IS NULL;",
        # Bills Columns
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS discount_percentage FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS service_charge_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS service_charge_percentage FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS round_off_amount FLOAT DEFAULT 0.0;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'OPEN';",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_verified_by VARCHAR(100);",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100);",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS items_snapshot_json JSONB;",
        "ALTER TABLE bills ADD COLUMN IF NOT EXISTS orders_snapshot_json JSONB;",
        # High-Performance Indexes for Neon PostgreSQL Queries
        "CREATE INDEX IF NOT EXISTS idx_orders_rest_status ON orders (restaurant_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_orders_rest_created ON orders (restaurant_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_table_sessions_rest_status ON table_sessions (restaurant_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_bills_rest_status ON bills (restaurant_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_bills_rest_created ON bills (restaurant_id, created_at DESC);",
        "CREATE INDEX IF NOT EXISTS idx_customer_requests_rest_status ON customer_requests (restaurant_id, status);",
        "CREATE INDEX IF NOT EXISTS idx_tables_rest_num ON tables (restaurant_id, table_number);",
        "CREATE INDEX IF NOT EXISTS idx_restaurants_lifecycle ON restaurants (lifecycle_status);",
        "CREATE INDEX IF NOT EXISTS idx_restaurants_approved ON restaurants (is_approved);",
        "CREATE INDEX IF NOT EXISTS idx_restaurants_owner_uid ON restaurants (owner_uid);",
        "CREATE INDEX IF NOT EXISTS idx_restaurants_owner_email ON restaurants (owner_email);",
    ]
    for stmt in alter_statements:
        try:
            await conn.execute(text(stmt))
        except Exception as e:
            pass



@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await ensure_db_schema_columns(conn)
            await conn.run_sync(Base.metadata.create_all)
        await run_clean_production_applications()
    except Exception as e:
        print("[STARTUP NOTICE] Database table initialization:", e)
    yield


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
    allow_origin_regex=r"https://.*dinely\.food|https://.*dinely\.app|https://.*onrender\.com|http://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



from sqlalchemy import text
from app.core.database.connection import AsyncSessionLocal

# Health checks
@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

@app.get("/readyz")
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
app.include_router(websocket_router, prefix="/api/v1", tags=["Realtime WebSocket"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
