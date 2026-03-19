"""Server configuration for handling concurrent users and high load."""

import os


class ServerConfig:
    """Server configuration for optimal performance with multiple concurrent users."""

    # Server settings
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    WORKERS: int = int(os.getenv("WORKERS", "4"))  # Multiple workers for better concurrency
    WORKER_CLASS: str = os.getenv("WORKER_CLASS", "uvicorn.workers.UvicornWorker")
    # Connection settings
    MAX_CONNECTIONS: int = int(os.getenv("MAX_CONNECTIONS", "100"))
    KEEP_ALIVE_TIMEOUT: int = int(os.getenv("KEEP_ALIVE_TIMEOUT", "65"))
    TIMEOUT_GRACEFUL_SHUTDOWN: int = int(os.getenv("TIMEOUT_GRACEFUL_SHUTDOWN", "30"))
    # Database settings
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "20"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "30"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    DB_POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", "3600"))
    # CORS settings - Allow all origins for development
    CORS_ORIGINS: list = ["*"]  # Allow all origins

    # Alternative: If you want to be more specific, uncomment and use this instead:
    # CORS_ORIGINS: list = [
    #     'http://localhost:3000',
    #     'http://127.0.0.1:3000',
    #     'http://localhost:5173',
    #     'http://127.0.0.1:5173',
    #     'https://human-eval-workshop-1444828305810485.aws.databricksapps.com',
    #     'https://e2-demo-field-eng.cloud.databricks.com',
    # ]
    # # Add additional CORS origins from environment
    # additional_cors_origins = os.getenv('CORS_ORIGINS', '').split(',')
    # if additional_cors_origins and additional_cors_origins[0]:
    #     CORS_ORIGINS.extend([origin.strip() for origin in additional_cors_origins])
    @classmethod
    def get_uvicorn_config(cls) -> dict:
        """Get uvicorn configuration for production deployment."""
        return {
            "host": cls.HOST,
            "port": cls.PORT,
            "workers": cls.WORKERS,
            "worker_class": cls.WORKER_CLASS,
            "timeout_keep_alive": cls.KEEP_ALIVE_TIMEOUT,
            "timeout_graceful_shutdown": cls.TIMEOUT_GRACEFUL_SHUTDOWN,
            "limit_concurrency": cls.MAX_CONNECTIONS,
            "limit_max_requests": 1000,  # Restart workers after 1000 requests
            "preload_app": True,  # Load app before forking workers
            "access_log": True,
            "log_level": "info",
        }

    @classmethod
    def get_development_config(cls) -> dict:
        """Get uvicorn configuration for development."""
        return {
            "host": cls.HOST,
            "port": cls.PORT,
            "reload": True,
            "reload_dirs": ["server"],
            "log_level": "debug",
            "access_log": True,
        }
