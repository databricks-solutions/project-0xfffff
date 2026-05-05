from __future__ import annotations

import os


def _build_app():
    import procrastinate

    database_url = os.getenv("PROCRASTINATE_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("PROCRASTINATE_DATABASE_URL or DATABASE_URL is required for setup workers")
    return procrastinate.App(connector=procrastinate.SyncPsycopgConnector(database_url))


app = _build_app()
