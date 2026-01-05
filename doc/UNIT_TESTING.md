# Unit testing guide (client + server)

## Server (Python / pytest)

- Run unit tests:

```bash
python3 -m pytest -q
```

- Run with coverage (already configured in `pyproject.toml`):

```bash
python3 -m pytest
```

This will emit:
- `htmlcov/` (HTML report)
- `coverage.xml` (XML report)

Notes:
- Tests live under `tests/`.
- FastAPI route tests use an ASGI client with lifespan disabled, and override `server.database.get_db` so tests don’t touch the real SQLite DB.

## Client (React / Vitest + RTL)

- Run unit tests:

```bash
npm -C client run test:unit
```

- Run unit tests with coverage:

```bash
npm -C client run test:unit:coverage
```

Notes:
- Playwright e2e remains under `client/tests/` and is still `npm -C client test` (or `test:e2e`).
- Vitest config is in `client/vite.config.ts` under the `test` key.

## Coverage ratchet strategy (recommended)

- Start with reporting only (no gating) while the suite is young.
- Once the suite is stable, add a **low floor** (e.g. 10–20%) and raise it gradually (e.g. +5% per week or per module).
- Prefer enforcing floors **per-package** (server vs client) first, then per-directory (e.g. `server/services/`, `client/src/utils/`), before enforcing a repo-wide threshold.


