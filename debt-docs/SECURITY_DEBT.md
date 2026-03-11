# Security Debt

## Overview

The codebase has several critical security issues that require immediate attention. Hardcoded credentials are committed to version control, CORS is configured to allow all origins with credentials, admin endpoints lack authentication, and the encryption key auto-generates on startup (causing data loss on restart). While some of these configurations may be acceptable for local development, they represent serious risks if deployed to production.

---

## Items

### SEC-1: Hardcoded Credentials in Version Control

**Severity**: CRITICAL
**Location**:
- `config/auth.yaml:5-6` - Facilitator email and plaintext password
- `config/auth.yaml:20` - Default user password `changeme123`
- `server/utils/config.py:29-30` - Hardcoded fallback password `facilitator123`

**Description**:
```yaml
# config/auth.yaml
facilitators:
  - email: "facilitator123@email.com"
    password: "facilitator123"  # Plaintext in repo

# ...
default_user_password: "changeme123"  # Default for all new users
```

```python
# server/utils/config.py
'email': 'facilitator@databricks.com',
'password': 'facilitator123',  # Hardcoded fallback
```

**Impact**: Anyone with access to the repository has valid credentials. These are in git history permanently. Default passwords are universally known attack vectors.

**Remediation**:
1. Move all credentials to environment variables
2. Remove hardcoded passwords from `auth.yaml` - require env vars only
3. Update `server/utils/config.py` to fail if env vars not set
4. Rotate all passwords that were committed

**Acceptance Criteria**:
- [ ] Zero plaintext passwords in any tracked file
- [ ] `config/auth.yaml` reads passwords from environment variables
- [ ] `server/utils/config.py` raises error if credentials not configured
- [ ] Existing committed passwords rotated

---

### SEC-2: Overly Permissive CORS Configuration

**Severity**: CRITICAL
**Location**:
- `server/config.py:24` - `CORS_ORIGINS: list = ['*']`
- `server/app.py:201-207` - CORS middleware configuration

**Description**:
```python
# server/config.py
CORS_ORIGINS: list = ['*']

# server/app.py
app.add_middleware(
    CORSMiddleware,
    allow_origins=ServerConfig.CORS_ORIGINS,  # ['*']
    allow_credentials=True,    # Sends cookies cross-origin
    allow_methods=["*"],       # All HTTP methods
    allow_headers=["*"],       # All headers
)
```

`allow_origins=['*']` combined with `allow_credentials=True` is a textbook security misconfiguration. Any website can make authenticated requests to this API.

**Impact**: Enables CSRF attacks, cross-origin credential theft. Any malicious site visited by a logged-in user can access the full API.

**Remediation**:
```python
CORS_ORIGINS: list = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:5173').split(',')
```
In production, set to specific Databricks App domains. Remove `allow_credentials=True` if not needed, or ensure origins are restricted.

**Acceptance Criteria**:
- [ ] `CORS_ORIGINS` reads from environment variable
- [ ] Default is localhost-only, not `['*']`
- [ ] `allow_methods` and `allow_headers` are explicitly listed
- [ ] Production deployment has CORS_ORIGINS set to specific domains

---

### SEC-3: Encryption Key Auto-Generated on Startup

**Severity**: CRITICAL
**Location**: `server/utils/encryption.py:21-29`

**Description**:
```python
if not self.secret_key:
    self.secret_key = self._generate_key()
    logger.warning('No encryption key found. Generated new key.')
```

If `ENCRYPTION_KEY` environment variable is not set, the application generates a new random key on every startup. This means:
1. All previously encrypted data (tokens, secrets) becomes **permanently unrecoverable** after restart
2. The warning log is non-fatal - the app continues running with a new key
3. No validation that the key format is correct

**Impact**: Silent data loss on every container restart. Encrypted tokens from previous sessions cannot be decrypted.

**Remediation**: Make `ENCRYPTION_KEY` required. Fail fast on startup if not set:
```python
if not self.secret_key:
    raise ValueError('ENCRYPTION_KEY environment variable not set.')
```

**Acceptance Criteria**:
- [ ] App fails to start if `ENCRYPTION_KEY` is not set
- [ ] Key format is validated on startup
- [ ] Documentation lists `ENCRYPTION_KEY` as required env var

---

### SEC-4: Admin Endpoints Without Authentication

**Severity**: HIGH
**Location**: `server/routers/users.py:90-111`

**Description**:
```python
@router.post('/admin/facilitators/')
async def create_facilitator_config(config_data: FacilitatorConfigCreate, ...):
    """Create a pre-configured facilitator (admin only)."""
    # In a real system, you'd check admin permissions here

@router.get('/admin/facilitators/')
async def list_facilitator_configs(...):
    """List all pre-configured facilitators (admin only)."""
    # NOTE: This endpoint is not protected
```

Additional unprotected endpoints:

| Endpoint | Risk |
|----------|------|
| `POST /users/` (create_user) | Any user can create accounts for any workshop |
| `DELETE /users/{user_id}` | Any user can delete any other user |
| `PUT /users/{user_id}/role` | Any user can escalate to FACILITATOR role |

**Impact**: Unauthenticated users can create facilitator accounts, delete users, escalate privileges. Full admin takeover possible.

**Remediation**: Create authentication dependency and apply to all admin endpoints:
```python
async def require_facilitator(user: User = Depends(get_current_user)) -> User:
    if user.role != UserRole.FACILITATOR:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user
```

**Acceptance Criteria**:
- [ ] All `/admin/` endpoints require facilitator authentication
- [ ] User deletion requires facilitator role
- [ ] Role changes require facilitator role
- [ ] Tests verify 403 for unauthorized access

---

### SEC-5: Password Hash Exposed in API Responses

**Severity**: HIGH
**Location**: `server/models.py:62-71`

**Description**:
```python
class User(BaseModel):
    # ... other fields ...
    password_hash: Optional[str] = None  # For internal use only
```

The `password_hash` field is included in the `User` Pydantic model that is returned by API endpoints. The comment "For internal use only" does not prevent Pydantic from serializing it.

**Impact**: Password hashes are sent to clients in API responses. Attackers can perform offline brute-force attacks against the hashes.

**Remediation**: Use `Field(exclude=True)` or create a separate `UserResponse` model:
```python
class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    workshop_id: Optional[str] = None
    status: UserStatus
    # No password_hash field
```

**Acceptance Criteria**:
- [ ] `password_hash` never appears in any API response
- [ ] Separate response model used for user endpoints
- [ ] Test verifies hash is not in response body

---

### SEC-6: Tokens Stored Unencrypted in Memory

**Severity**: HIGH
**Location**: `server/services/token_storage_service.py:8-24`

**Description**:
```python
class TokenStorageService:
    def __init__(self):
        self._tokens: Dict[str, Dict[str, any]] = {}

    def store_token(self, workshop_id: str, token: str, ...):
        self._tokens[workshop_id] = {
            'token': token,  # Plaintext Databricks token
            'expires_at': expiry_time,
        }
```

Databricks tokens stored in plaintext in memory. If the process is compromised or memory is dumped, tokens are immediately readable.

**Impact**: Token theft if process memory is accessed. No rotation mechanism documented.

**Remediation**: Encrypt tokens before storing using the existing encryption utility:
```python
from server.utils.encryption import encrypt_sensitive_data
self._tokens[workshop_id] = {
    'token': encrypt_sensitive_data(token),
    ...
}
```

**Acceptance Criteria**:
- [ ] Tokens encrypted at rest in memory
- [ ] Decryption happens only at point of use
- [ ] Token expiry is enforced

---

### SEC-7: Error Messages Expose Internal Details

**Severity**: MEDIUM
**Location**:
- `server/routers/dbsql_export.py:59-72` - `f"Export failed: {export_result.get('error')}"`
- `server/routers/databricks.py:28, 49, 118, 157, 246, 289` - `f"Failed to initialize: {str(e)}"`

**Description**: Internal exception messages returned directly to clients:
```python
raise HTTPException(status_code=500, detail=f'Failed to initialize Databricks service: {str(e)}')
```

This can expose: stack traces, library names/versions, infrastructure details (e.g., "PGPASSWORD not found"), file paths.

**Impact**: Information disclosure helps attackers understand the tech stack and find additional vulnerabilities.

**Remediation**: Log full errors internally, return generic messages to clients:
```python
logger.error(f"Databricks init failed", exc_info=True)
raise HTTPException(status_code=500, detail="Service initialization failed. Please try again.")
```

**Acceptance Criteria**:
- [ ] No `str(e)` in HTTPException detail messages
- [ ] All 500 errors return generic messages
- [ ] Full errors logged server-side

---

### SEC-8: Database Paths and Schema Names in Logs

**Severity**: MEDIUM
**Location**:
- `server/app.py:49, 52-54, 90, 113`
- `server/routers/dbsql_export.py:52-54`

**Description**:
```python
logger.info(f"Database path: {db_path}")
logger.info(f"Target: {request.catalog}.{request.schema_name}")
print(f"  SQLite rescue configured: {rescue_status['volume_backup_path']}")
```

**Impact**: If logs are shipped to external services, infrastructure details are exposed.

**Remediation**: Log generic identifiers, not full paths. Use debug level for infrastructure details.

**Acceptance Criteria**:
- [ ] No file paths in INFO-level logs
- [ ] Infrastructure details at DEBUG level only

---

### SEC-9: Sensitive Data in Print Statements

**Severity**: MEDIUM
**Location**: `server/routers/workshops.py:963-977`

**Description**:
```python
print(f"  DEBUG trace_ids: {[t.id for t in traces]}")
print(f"  DEBUG: Selected traces: {trace_ids_to_use}")
```

Trace IDs and potentially sensitive workshop data printed to stdout.

**Impact**: Sensitive data in logs. Overlaps with CQ-5 but security-specific concern.

**Remediation**: Remove debug prints (see CQ-5). If needed, use logger.debug() which is not output at INFO level.

**Acceptance Criteria**:
- [ ] Zero print statements with data content
- [ ] Debug output uses logger.debug(), disabled by default

---

### SEC-10: Missing Security Headers

**Severity**: LOW
**Location**: `server/app.py` - No security headers middleware

**Description**: Standard security headers not set:
- No `X-Content-Type-Options: nosniff`
- No `X-Frame-Options: DENY`
- No `Strict-Transport-Security`
- No `Content-Security-Policy`

**Impact**: Defense-in-depth gap. Won't prevent attacks alone but is standard practice.

**Remediation**: Add security headers middleware:
```python
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    return response
```

**Acceptance Criteria**:
- [ ] Security headers present on all responses
- [ ] Headers configurable for different deployment environments

---

### SEC-11: Fernet Key Format Not Validated

**Severity**: LOW
**Location**: `server/utils/encryption.py:32`

**Description**:
```python
self.cipher = Fernet(self.secret_key.encode())
```
No try/except around Fernet initialization. Invalid key format causes cryptic error on startup.

**Impact**: Poor error message if ENCRYPTION_KEY is malformed.

**Remediation**: Validate key format and provide helpful error message. (Will be addressed by SEC-3 fix.)

**Acceptance Criteria**:
- [ ] Clear error message if key format is invalid
- [ ] Documentation shows how to generate a valid key

---

## Prioritized Backlog

| Priority | ID | Title | Effort | Impact |
|----------|-----|-------|--------|--------|
| P0 | SEC-1 | Remove hardcoded credentials from repo | S | Critical - credentials in version control |
| P0 | SEC-2 | Restrict CORS to specific origins | S | Critical - CSRF/credential theft |
| P0 | SEC-3 | Require ENCRYPTION_KEY, fail on missing | S | Critical - silent data loss |
| P0 | SEC-4 | Add auth to admin endpoints | M | High - privilege escalation |
| P1 | SEC-5 | Exclude password_hash from API responses | S | High - password hash exposure |
| P1 | SEC-6 | Encrypt tokens in memory | S | High - token theft risk |
| P2 | SEC-7 | Sanitize error messages to clients | M | Medium - information disclosure |
| P2 | SEC-8 | Remove infrastructure details from logs | S | Medium - info disclosure |
| P2 | SEC-9 | Remove data from print statements | S | Medium - overlaps with CQ-5 |
| P3 | SEC-10 | Add security headers middleware | S | Low - defense in depth |
| P3 | SEC-11 | Validate Fernet key format | S | Low - DX improvement |

**Effort**: S = < 2 hours, M = 2-8 hours, L = 1-3 days
