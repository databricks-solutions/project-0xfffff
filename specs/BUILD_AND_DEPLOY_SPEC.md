# Build and Deploy Specification

## Overview

This specification defines the build process, database migrations, and deployment procedures for the Human Evaluation Workshop. It covers frontend builds, backend database management with Alembic, and production deployment.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Build & Deploy Pipeline                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │    │   Backend    │    │   Database   │  │
│  │  (Vite/React)│    │  (FastAPI)   │    │   (SQLite)   │  │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘  │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  npm build   │    │   uvicorn    │    │   Alembic    │  │
│  │  (terser)    │    │              │    │  migrations  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Frontend Build

### Vite Configuration

The frontend uses Vite with terser for production builds.

**File**: `client/vite.config.ts`

```typescript
export default defineConfig({
  build: {
    outDir: 'build',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,    // Remove all console statements
        drop_debugger: true,   // Remove debugger statements
      },
    },
  },
});
```

### Build Commands

| Command | Purpose | Output |
|---------|---------|--------|
| `npm run build` | Production build | `client/build/` |
| `npm run dev` | Development server | localhost:5173 |
| `npm run preview` | Preview production build | localhost:4173 |

### Console Removal

Production builds automatically remove:
- `console.log()`
- `console.error()`
- `console.warn()`
- `console.info()`
- `console.debug()`
- `debugger` statements

**Development mode preserves all console statements for debugging.**

### Selective Console Preservation

To keep specific console methods in production:

```typescript
terserOptions: {
  compress: {
    pure_funcs: ['console.log', 'console.info', 'console.debug'],
    // console.error and console.warn preserved
  },
}
```

### Build Output

```
client/build/
├── index.html
├── assets/
│   ├── index-[hash].js      # Main bundle (minified)
│   ├── index-[hash].css     # Styles (minified)
│   └── [chunk]-[hash].js    # Code-split chunks
└── ...
```

---

## Database Migrations (Alembic)

### Overview

The project uses Alembic for SQLite database migrations with batch mode support (required for SQLite's limited ALTER TABLE capabilities).

### Configuration Files

| File | Purpose |
|------|---------|
| `alembic.ini` | Alembic CLI configuration |
| `migrations/env.py` | Migration environment setup |
| `migrations/versions/*.py` | Individual migration scripts |
| `server/db_bootstrap.py` | Bootstrap module |

### Migration Commands (via justfile)

| Command | Purpose |
|---------|---------|
| `just db-bootstrap` | Bootstrap database (create if missing, run migrations) |
| `just db-upgrade` | Apply pending migrations |
| `just db-stamp` | Mark existing DB as up-to-date with current migrations |
| `just db-revision message="..."` | Create new migration |

### Migration Files

```
migrations/versions/
├── 0001_baseline.py              # Initial schema
├── 0002_legacy_schema_fixes.py   # Legacy compatibility
└── 0003_judge_schema_updates.py  # Judge table updates
```

### Batch Mode for SQLite

SQLite cannot perform many ALTER TABLE operations directly. Alembic uses batch mode:

```python
# In migration file
def upgrade():
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('new_column', sa.String()))
```

This creates a new table, copies data, drops old table, and renames.

### Bootstrap Behavior

**Development**: `just api-dev`, `just api`, and `just dev` automatically run `just db-bootstrap` before starting.

**Production**: Run `just db-bootstrap` as a separate step before starting the server.

### Startup Fallback

If the API starts without running migrations:

| Scenario | Behavior |
|----------|----------|
| DB file missing | Create via Alembic (with file lock for multi-worker safety) |
| DB exists, no migration table | Stamp to baseline |
| DB exists, pending migrations | Apply if `DB_BOOTSTRAP_ON_STARTUP=true` |

**Environment Variable**:
- `DB_BOOTSTRAP_ON_STARTUP=true`: Auto-stamp legacy DBs + apply pending migrations
- `DB_BOOTSTRAP_ON_STARTUP=false`: Disable fallback entirely

### Creating New Migrations

After modifying `server/database.py`:

```bash
just db-revision message="add user preferences"
```

This auto-generates a migration based on model changes.

---

## Deployment

### Full Deployment Command

```bash
just deploy
```

This runs:
1. `just db-bootstrap` - Ensure database is current
2. `npm run build` - Build frontend
3. `./deploy.sh` - Run deployment script

### Manual Steps

```bash
# 1. Database
just db-bootstrap

# 2. Frontend
cd client && npm install && npm run build && cd ..

# 3. Server
uv run uvicorn server.app:app --host 0.0.0.0 --port 8000
```

### Production Server

```bash
# With Gunicorn (multiple workers)
uv run gunicorn server.app:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | Database connection string | `sqlite:///workshop.db` |
| `DB_BOOTSTRAP_ON_STARTUP` | Auto-run migrations on startup | `false` |
| `MLFLOW_TRACKING_URI` | MLflow server URL | (required) |
| `DATABRICKS_HOST` | Databricks workspace URL | (required) |
| `DATABRICKS_TOKEN` | Databricks access token | (required) |

---

## Justfile Commands

### Database

```bash
just db-bootstrap     # Bootstrap database
just db-upgrade       # Run Alembic migrations
just db-stamp         # Stamp current migration
just db-revision      # Create new migration
```

### Development

```bash
just dev              # Start full dev environment
just api-dev          # Start API with hot reload
just client-dev       # Start frontend dev server
```

### Testing

```bash
just test             # Run all tests
just test-server      # Run Python tests
just test-client      # Run React tests
just e2e              # Run E2E tests (headless)
just e2e headed       # Run E2E tests (with browser)
just e2e ui           # Run E2E tests (Playwright UI)
```

### Build & Deploy

```bash
just build            # Build frontend
just deploy           # Full deployment
```

---

## GitHub Actions (Releases)

### Automated Release Workflow

**File**: `.github/workflows/release.yml`

Triggers on:
- Push tags matching `v*`
- Manual workflow dispatch

Creates:
- `project-with-build.zip` with pre-built client

### Release Artifact Contents

```
project-with-build.zip
├── server/
├── client/
│   └── build/          # Pre-built frontend
├── migrations/
├── alembic.ini
├── pyproject.toml
└── README.md
```

**Excludes**: `node_modules/`, `.git/`, `*.db`, `__pycache__/`

---

## Success Criteria

### Frontend Build
- [ ] Production build completes without errors
- [ ] Console statements removed in production
- [ ] Assets minified and hashed
- [ ] Build directory contains all required files

### Database Migrations
- [ ] `just db-bootstrap` creates database if missing
- [ ] Migrations apply without errors
- [ ] Batch mode works for SQLite ALTER TABLE
- [ ] File lock prevents race conditions with multiple workers

### Deployment
- [ ] Full deployment completes successfully
- [ ] Server starts and serves frontend
- [ ] API endpoints respond correctly
- [ ] Database connection established

### CI/CD
- [ ] Release workflow creates zip artifact
- [ ] Pre-built client included in release
- [ ] No sensitive files in artifact

---

## Troubleshooting

### Build Fails

```bash
# Clear cache and rebuild
rm -rf client/node_modules client/build
npm -C client install
npm -C client run build
```

### Migration Errors

```bash
# Reset to known state
rm workshop.db
just db-bootstrap
```

### Multi-Worker Database Issues

Ensure `DB_BOOTSTRAP_ON_STARTUP=false` in production and run migrations as a separate step before starting workers.
