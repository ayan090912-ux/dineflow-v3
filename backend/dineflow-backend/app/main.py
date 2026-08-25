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
from app.scripts.cafe_co_migration import run_migration


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        await run_migration()
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
    allow_origin_regex=r"https://.*dinely\.food|https://.*onrender\.com|http://.*",
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

# API Routes
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(platform_router, prefix="/api/v1/admin", tags=["Platform Admin"])
app.include_router(restaurant_router, prefix="/api/v1/restaurants", tags=["Restaurants"])
app.include_router(tax_router, prefix="/api/v1/restaurants", tags=["Taxes"])
app.include_router(menu_router, prefix="/api/v1/restaurants", tags=["Menu"])
app.include_router(table_router, prefix="/api/v1/restaurants", tags=["Tables"])
app.include_router(order_router, prefix="/api/v1/orders", tags=["Orders"])
app.include_router(customer_requests_router, prefix="/api/v1/customer-requests", tags=["Customer Requests"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
