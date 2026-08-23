from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config.settings import get_settings
from app.core.middlewares.logging import LoggingMiddleware
from app.core.middlewares.rate_limit import RateLimitMiddleware
from app.modules.auth.router import router as auth_router
from app.modules.platform.router import router as platform_router

settings = get_settings()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Dinely Cloud - Multi-tenant Restaurant Operating System",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None
)

# Middleware
app.add_middleware(LoggingMiddleware)
app.add_middleware(RateLimitMiddleware)
cors_origins = ["*"] if ("*" in settings.CORS_ORIGINS or settings.DEBUG) else settings.CORS_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health checks
@app.get("/healthz")
async def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}

@app.get("/readyz")
async def readiness_check():
    # TODO: Check DB and Redis connectivity
    return {"status": "ready", "database": "connected", "redis": "connected"}

# API Routes
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(platform_router, prefix="/api/v1/admin", tags=["Platform Admin"])


# TODO: Add remaining routers as sprints progress
# app.include_router(platform_router, prefix="/api/v1/platform", tags=["Platform"])
# app.include_router(restaurant_router, prefix="/api/v1/restaurants", tags=["Restaurants"])
# app.include_router(menu_router, prefix="/api/v1/menu", tags=["Menu"])
# app.include_router(order_router, prefix="/api/v1/orders", tags=["Orders"])
# etc.

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
