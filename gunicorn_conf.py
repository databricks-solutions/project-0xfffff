"""Gunicorn configuration for production deployments.

Defines server hooks that run in the master process before workers fork.
"""


def on_starting(server):
    """Run database migrations once in the master process before workers fork.

    This ensures pending Alembic migrations are applied exactly once before any
    worker begins accepting traffic. If migrations fail, gunicorn exits —
    preventing workers from serving against a stale schema.
    """
    from server.db_bootstrap import bootstrap_database

    bootstrap_database(full=True)
