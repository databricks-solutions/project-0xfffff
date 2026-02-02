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

## Databricks Apps Deployment

### Overview

When deploying to Databricks Apps, the application runs in ephemeral containers that can be restarted during platform updates. SQLite databases stored on the local container filesystem will be lost. The SQLite Rescue module provides
persistence by backing up to Unity Catalog Volumes.

### Databricks Apps Authentication

Databricks Apps automatically provides authentication to workspace resources via a dedicated **service principal**. Key points:

**Automatic Credentials**:
- `DATABRICKS_CLIENT_ID` - Automatically injected
- `DATABRICKS_CLIENT_SECRET` - Automatically injected

**Best Practices**:
- Never hardcode personal access tokens (PATs) in code
- Use the app's service principal for all Databricks API calls
- Don't share service principal credentials between apps
- Apply least privilege: grant only minimum required permissions

**Resource Permissions**:
| Resource Type | Common Permissions |
|--------------|-------------------|
| SQL Warehouse | CAN USE (queries), CAN MANAGE |
| Unity Catalog Volume | Can read, Can read and write |
| Secrets | Can read, Can write, Can manage |
| Model Serving Endpoint | Can view, Can query, Can manage |
| MLflow Experiments | Can read, Can edit, Can manage |

**Configuring Resources**:
1. In Databricks Apps UI, navigate to Configure step
2. Click "+ Add resource" in App resources section
3. Select resource type and set permissions for app service principal
4. Assign a key and reference in `app.yaml` via `valueFrom`

Reference: [Databricks Apps Resources Documentation](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/resources)

### SQLite Rescue Module

**Purpose**: Persist SQLite database across container restarts by backing up to Unity Catalog Volumes.

**IMPORTANT**: Databricks Apps do NOT support FUSE mounts for UC volumes. This module uses the
Databricks SDK Files API (`WorkspaceClient.files`) for all volume operations.

**Architecture**:
┌─────────────────────────────────────────────────────────────────┐
│                     CONTAINER LIFECYCLE                          │
├─────────────────────────────────────────────────────────────────┤
│  STARTUP                                                         │
│  1. Check Unity Catalog Volume for backup (via SDK Files API)    │
│  2. If found → download to local filesystem                      │
│  3. Bootstrap/migrate as usual                                   │
├─────────────────────────────────────────────────────────────────┤
│  RUNNING                                                         │
│  4. SQLite operates on local file (fast)                         │
│  5. After N write operations → background upload to Volume       │
├─────────────────────────────────────────────────────────────────┤
│  SHUTDOWN (SIGTERM)                                              │
│  6. Signal handler triggers backup to Volume                     │
│  7. Upload local DB → Unity Catalog Volume (via SDK Files API)   │
│  8. Exit cleanly                                                 │
└─────────────────────────────────────────────────────────────────┘

**Configuration** (`app.yaml`):

Recommended: Use `valueFrom` to reference an App resource (the volume path is injected automatically):
```yaml
env:
  - name: SQLITE_VOLUME_PATH
    valueFrom: db_backup_volume  # Resource key from Apps UI
  - name: SQLITE_BACKUP_INTERVAL_MINUTES
    value: "10"  # Backup every 10 minutes (default: 10, 0 to disable)
```

Alternative: Hardcode the full path (less portable):
```yaml
env:
  - name: SQLITE_VOLUME_BACKUP_PATH
    value: "/Volumes/<catalog>/<schema>/<volume>/workshop.db"
```

Environment Variables:
┌─────────────────────────────────┬──────────────────────────────────────────────────┬──────────────────────────┐
│            Variable             │               Purpose                            │         Default          │
├─────────────────────────────────┼──────────────────────────────────────────────────┼──────────────────────────┤
│ SQLITE_VOLUME_PATH              │ Base volume path (appends /workshop.db)          │ (none - rescue disabled) │
├─────────────────────────────────┼──────────────────────────────────────────────────┼──────────────────────────┤
│ SQLITE_VOLUME_BACKUP_PATH       │ Full path including filename (overrides above)   │ (none - rescue disabled) │
├─────────────────────────────────┼──────────────────────────────────────────────────┼──────────────────────────┤
│ SQLITE_BACKUP_INTERVAL_MINUTES  │ Minutes between automatic backups                │ 10                       │
└─────────────────────────────────┴──────────────────────────────────────────────────┴──────────────────────────┘

Key Files:
┌─────────────────────────┬─────────────────────────────────────────────────────────┐
│          File           │                         Purpose                         │
├─────────────────────────┼─────────────────────────────────────────────────────────┤
│ server/sqlite_rescue.py │ Core backup/restore logic (uses Databricks SDK)         │
├─────────────────────────┼─────────────────────────────────────────────────────────┤
│ server/app.py           │ Lifespan integration (startup restore, shutdown backup) │
└─────────────────────────┴─────────────────────────────────────────────────────────┘

API:
- restore_from_volume() - Called on startup before DB bootstrap
- backup_to_volume(force=True) - Called on shutdown
- start_backup_timer() - Starts periodic background backup (every N minutes)
- stop_backup_timer() - Stops the background backup timer
- get_rescue_status() - Returns current config and status (exposed in /health/detailed)

Prerequisites:
1. Create Unity Catalog Volume in your workspace
2. Add the volume as an App resource in the Apps UI
3. Grant the app "Can read and write" permission on the volume
4. Assign a resource key (e.g., "db_backup_volume")
5. Configure SQLITE_VOLUME_PATH in app.yaml using `valueFrom`

Health Check:
The /health/detailed endpoint includes sqlite_rescue status:
```json
{
  "sqlite_rescue": {
    "configured": true,
    "volume_backup_path": "/Volumes/catalog/schema/volume/workshop.db",
    "backup_interval_minutes": 10,
    "local_exists": true,
    "volume_backup_exists": true,
    "sdk_available": true,
    "backup_timer_running": true,
    "shutdown_handlers_installed": true
  }
}
```

Limitations:
- Uses Databricks SDK Files API (FUSE mounts NOT supported in Apps)
- The rescue module copies the entire DB file; not suitable for very large databases
- Brief data loss possible if container crashes between backups (up to backup interval worth of writes)

