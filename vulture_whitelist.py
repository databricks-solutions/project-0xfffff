# Vulture whitelist — false positives from frameworks/conventions
#
# SQLAlchemy event listener callbacks require specific parameter names
# even when not all params are used in the body.
connection_record  # noqa: F821  # SQLAlchemy @event.listens_for("connect") signature

# FastAPI dependency-injection parameters are consumed by the framework,
# not by user code.  Vulture cannot see that.
background_tasks  # noqa: F821  # FastAPI BackgroundTasks DI
ingest_request  # noqa: F821  # FastAPI request body parameter

# Constructor keyword arguments consumed by callers, not inside __init__.
init_sdk  # noqa: F821  # DatabricksService.__init__ kwarg

# TYPE_CHECKING imports are erased at runtime; vulture only sees runtime.
Engine  # noqa: F821  # sqlalchemy.engine.Engine used in type annotations
