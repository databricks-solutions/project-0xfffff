# Database migrations (SQLite + Alembic)

This project uses **Alembic** migrations for the SQLite database (`workshop.db`).

SQLite can’t perform many `ALTER TABLE` operations directly, so Alembic is configured to use **batch mode** (“move and copy”) when needed; see the Alembic docs: https://alembic.sqlalchemy.org/en/latest/batch.html

## Config files

- `alembic.ini`: minimal file required by Alembic’s CLI (must contain an `[alembic]` section).
- `pyproject.toml`: contains project-level tooling config; Alembic itself still needs `alembic.ini` for CLI config discovery.

## Commands (recommended via `just`)

- Apply migrations / create DB if missing:
  - `just db-bootstrap`

- Apply pending migrations:
  - `just db-upgrade`

- One-time: mark an existing pre-Alembic DB as up-to-date (baseline):
  - `just db-stamp`

- Create a new migration after editing models in `server/database.py`:
  - `just db-revision message="describe change"`

## Development

`just api-dev`, `just api`, and `just dev` automatically run `just db-bootstrap` before starting the server, so the schema is always current during development.

Note: `just db-bootstrap` calls the shared implementation in `server/db_bootstrap.py` (single source of truth).

## Deploy

Use `just deploy` to run DB bootstrap, build the UI, and then call `./deploy.sh`.

## Fallback behavior (startup safety net)

Deployments *should* run migrations as a separate step (via `just db-bootstrap`) before starting the API.
However, if the API is started without running the CLI step, the server includes a small fallback:

- If the SQLite DB file is **missing**, the API will attempt to **create it via Alembic** during startup.
- This is protected by an **inter-process file lock**, so it is safe even when starting with multiple
  gunicorn workers (each worker runs FastAPI lifespan).

To enable a stronger (but more invasive) behavior—**stamp legacy DBs + apply pending migrations on startup**—set:

- `DB_BOOTSTRAP_ON_STARTUP=true`

To disable the fallback entirely:

- `DB_BOOTSTRAP_ON_STARTUP=false`


