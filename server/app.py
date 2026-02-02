"""FastAPI application for Databricks App Template."""

import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from server.config import ServerConfig
from server.db_bootstrap import maybe_bootstrap_db_on_startup
from server.routers import router
from server.sqlite_rescue import (
    backup_to_volume,
    get_rescue_status,
    install_shutdown_handlers,
    restore_from_volume,
    start_backup_timer,
    stop_backup_timer,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifespan with proper startup and shutdown."""
    print("🚀 Application startup - lifespan function called!")

    # SQLite Rescue: Restore from Unity Catalog Volume if configured
    # This MUST happen before database bootstrap/migrations
    rescue_status = get_rescue_status()
    if rescue_status["configured"]:
        print(f"📦 SQLite rescue configured: {rescue_status['volume_backup_path']}")
        if restore_from_volume():
            print("✅ Database restored from Unity Catalog Volume")
        else:
            print("ℹ️  No backup to restore (starting fresh or backup not found)")

        # Install signal handlers for graceful shutdown backup
        install_shutdown_handlers()

        # Start periodic background backup timer (every 10 minutes by default)
        start_backup_timer()
        backup_interval = rescue_status.get("backup_interval_minutes", 10)
        print(f"⏰ Periodic backup timer started (every {backup_interval} minutes)")
    else:
        print("⚠️  SQLITE_VOLUME_BACKUP_PATH not configured - database will NOT persist across container restarts")

    # NOTE: This is a *fallback* safety net for deployments that don't run `just db-bootstrap`.
    # It is designed to be safe under multi-process servers (e.g., gunicorn with multiple
    # Uvicorn workers) via an inter-process lock.
    maybe_bootstrap_db_on_startup()

    print("✅ Application startup complete!")
    yield

    # SQLite Rescue: Backup to Unity Catalog Volume on shutdown
    print("🔄 Application shutting down...")
    if rescue_status["configured"]:
        # Stop the periodic backup timer first
        stop_backup_timer()
        print("⏰ Periodic backup timer stopped")

        print("💾 Backing up database to Unity Catalog Volume...")
        if backup_to_volume(force=True):
            print("✅ Database backed up successfully")
        else:
            print("⚠️  Database backup failed or skipped")


# Request timing middleware
class ProcessTimeMiddleware(BaseHTTPMiddleware):
    """Add process time header to responses for monitoring."""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        return response


# Error handling middleware
class DatabaseErrorMiddleware(BaseHTTPMiddleware):
    """Handle database connection errors gracefully."""

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as e:
            if "database is locked" in str(e).lower() or "connection" in str(e).lower():
                return JSONResponse(
                    status_code=503,
                    content={
                        "detail": "Service temporarily unavailable due to high load. Please try again in a moment.",
                        "error_type": "database_connection_error",
                    },
                )
            raise


app = FastAPI(
    title="Databricks App API",
    description="Modern FastAPI application template for Databricks Apps with React frontend",
    version="0.1.0",
    lifespan=lifespan,
)

# Add middleware in order (last added is first executed)
app.add_middleware(DatabaseErrorMiddleware)
app.add_middleware(ProcessTimeMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)  # Compress responses > 1KB

app.add_middleware(
    CORSMiddleware,
    allow_origins=ServerConfig.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, tags=["api"])


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/health/detailed")
async def detailed_health():
    """Detailed health check with database and connection info."""
    from sqlalchemy import text

    from server.database import engine

    try:
        # Test database connection
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))

        # Get connection pool info
        pool = engine.pool
        pool_info = {
            "size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
            "invalid": getattr(pool, "invalid", lambda: 0)(),  # Handle missing invalid method
        }

        # Get SQLite rescue status
        rescue_status = get_rescue_status()

        return {
            "status": "healthy",
            "database": "connected",
            "connection_pool": pool_info,
            "sqlite_rescue": rescue_status,
            "timestamp": time.time(),
        }
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e), "timestamp": time.time()}


@app.get("/test")
async def test():
    """Test endpoint."""
    return {"message": "App is working!"}


# Serve static files from client build directory (must come after API routes)
if os.path.exists("client/build"):
    app.mount("/", StaticFiles(directory="client/build", html=True), name="static")
