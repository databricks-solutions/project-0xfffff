"""Database setup and configuration for the workshop application.

Supports two database backends:
- SQLite (default): For local development and simple deployments
- Lakebase (PostgreSQL): For Databricks Apps with database resources

The backend is automatically detected based on environment variables.
See db_config.py for detection logic and configuration.
"""

import logging
import os
import uuid

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    event,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.sql import func

from .db_config import (
    DatabaseBackend,
    create_engine_for_backend,
    detect_database_backend,
)

logger = logging.getLogger(__name__)

try:
    # Imported for side effects/availability; some deployments may not ship encryption extras.
    from .utils.encryption import decrypt_sensitive_data as _decrypt_sensitive_data  # noqa: F401
    from .utils.encryption import encrypt_sensitive_data as _encrypt_sensitive_data  # noqa: F401
except ImportError:
    pass

# Detect database backend and create engine
DATABASE_BACKEND = detect_database_backend()
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./workshop.db")

# Log which backend is being used
if DATABASE_BACKEND == DatabaseBackend.POSTGRESQL:
    logger.info("Using Lakebase (PostgreSQL) database backend")
else:
    logger.info(f"Using SQLite database backend: {DATABASE_URL}")

# Create engine using the appropriate backend configuration
engine = create_engine_for_backend(DATABASE_BACKEND)


# SQLite Rescue: Track write operations for backup triggering
# This listener fires after successful commits and notifies the rescue module
# Only applies to SQLite backend
if DATABASE_BACKEND == DatabaseBackend.SQLITE:

    @event.listens_for(engine, "commit")
    def on_commit(conn):
        """Record write operations for SQLite rescue backup triggering."""
        try:
            from server.sqlite_rescue import record_write_operation

            record_write_operation()
        except ImportError:
            pass  # sqlite_rescue not available


# Create session factory with better session management
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,  # Prevent lazy loading issues
)

# Create base class for models
Base = declarative_base()


class UserDB(Base):
    """Database model for users."""

    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=True)  # Nullable for facilitators
    status = Column(String, default="active")
    password_hash = Column(String, nullable=True)  # For authentication
    created_at = Column(DateTime, default=func.now())
    last_active = Column(DateTime, nullable=True)

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="users")
    participants = relationship("WorkshopParticipantDB", back_populates="user")


class FacilitatorConfigDB(Base):
    """Database model for facilitator configurations."""

    __tablename__ = "facilitator_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())


class WorkshopParticipantDB(Base):
    """Database model for workshop participants."""

    __tablename__ = "workshop_participants"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    role = Column(String, nullable=False)
    assigned_traces = Column(JSON, default=list)
    annotation_quota = Column(Integer, nullable=True)
    joined_at = Column(DateTime, default=func.now())

    # Relationships
    user = relationship("UserDB", back_populates="participants")
    workshop = relationship("WorkshopDB", back_populates="participants")


class WorkshopDB(Base):
    """Database model for workshops."""

    __tablename__ = "workshops"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    facilitator_id = Column(String, nullable=False)
    status = Column(String, default="active")
    current_phase = Column(String, default="intake")
    completed_phases = Column(JSON, default=list)
    discovery_started = Column(Boolean, default=False)
    annotation_started = Column(Boolean, default=False)
    active_discovery_trace_ids = Column(JSON, default=list)
    active_annotation_trace_ids = Column(JSON, default=list)
    discovery_randomize_traces = Column(Boolean, default=False)  # Whether to randomize trace order in discovery
    annotation_randomize_traces = Column(Boolean, default=False)  # Whether to randomize trace order in annotation
    judge_name = Column(String, default="workshop_judge")  # Name used for feedback entries
    input_jsonpath = Column(Text, nullable=True)  # JSONPath query for extracting trace input display
    output_jsonpath = Column(Text, nullable=True)  # JSONPath query for extracting trace output display
    auto_evaluation_job_id = Column(String, nullable=True)  # Job ID for auto-evaluation on annotation start
    auto_evaluation_prompt = Column(Text, nullable=True)  # Derived judge prompt used for auto-evaluation
    auto_evaluation_model = Column(String, nullable=True)  # Model used for auto-evaluation
    show_participant_notes = Column(Boolean, default=False)  # Facilitator toggle: show notepad to SMEs
    created_at = Column(DateTime, default=func.now())

    # Relationships
    users = relationship("UserDB", back_populates="workshop", cascade="all, delete-orphan")
    participants = relationship("WorkshopParticipantDB", back_populates="workshop", cascade="all, delete-orphan")
    traces = relationship("TraceDB", back_populates="workshop", cascade="all, delete-orphan")
    findings = relationship("DiscoveryFindingDB", back_populates="workshop", cascade="all, delete-orphan")
    rubrics = relationship("RubricDB", back_populates="workshop", cascade="all, delete-orphan")
    annotations = relationship("AnnotationDB", back_populates="workshop", cascade="all, delete-orphan")
    mlflow_config = relationship(
        "MLflowIntakeConfigDB", back_populates="workshop", uselist=False, cascade="all, delete-orphan"
    )
    judge_prompts = relationship("JudgePromptDB", back_populates="workshop", cascade="all, delete-orphan")
    judge_evaluations = relationship("JudgeEvaluationDB", back_populates="workshop", cascade="all, delete-orphan")
    databricks_token = relationship(
        "DatabricksTokenDB", back_populates="workshop", uselist=False, cascade="all, delete-orphan"
    )
    user_trace_orders = relationship("UserTraceOrderDB", back_populates="workshop", cascade="all, delete-orphan")
    user_discovery_completions = relationship(
        "UserDiscoveryCompletionDB", back_populates="workshop", cascade="all, delete-orphan"
    )
    custom_llm_provider = relationship(
        "CustomLLMProviderConfigDB", back_populates="workshop", uselist=False, cascade="all, delete-orphan"
    )
    participant_notes = relationship("ParticipantNoteDB", back_populates="workshop", cascade="all, delete-orphan")
    discovery_feedback = relationship("DiscoveryFeedbackDB", back_populates="workshop", cascade="all, delete-orphan")
    discovery_analyses = relationship("DiscoveryAnalysisDB", back_populates="workshop", cascade="all, delete-orphan")


class TraceDB(Base):
    """Database model for traces."""

    __tablename__ = "traces"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id", ondelete="CASCADE"))
    input = Column(Text, nullable=False)
    output = Column(Text, nullable=False)
    context = Column(JSON, nullable=True)
    trace_metadata = Column(JSON, nullable=True)  # Renamed from metadata to avoid SQLAlchemy conflict
    mlflow_trace_id = Column(String, nullable=True)  # Optional MLflow trace ID
    mlflow_url = Column(String, nullable=True)  # Optional MLflow URL
    mlflow_host = Column(String, nullable=True)  # Optional MLflow host
    mlflow_experiment_id = Column(String, nullable=True)  # Optional MLflow experiment ID
    include_in_alignment = Column(Boolean, default=True)  # Whether to include in judge alignment
    sme_feedback = Column(Text, nullable=True)  # Concatenated SME feedback for alignment
    created_at = Column(DateTime, default=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="traces")
    findings = relationship("DiscoveryFindingDB", back_populates="trace")
    annotations = relationship("AnnotationDB", back_populates="trace")
    judge_evaluations = relationship("JudgeEvaluationDB", back_populates="trace")


class DiscoveryFindingDB(Base):
    """Database model for discovery findings."""

    __tablename__ = "discovery_findings"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    trace_id = Column(String, ForeignKey("traces.id"), nullable=False)
    user_id = Column(String, nullable=False)
    insight = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="findings")
    trace = relationship("TraceDB", back_populates="findings")


class UserDiscoveryCompletionDB(Base):
    """Database model for tracking user discovery completion."""

    __tablename__ = "user_discovery_completions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    completed_at = Column(DateTime, default=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="user_discovery_completions")
    user = relationship("UserDB")


class DiscoveryFeedbackDB(Base):
    """Database model for structured discovery feedback (good/bad + comments)."""

    __tablename__ = "discovery_feedback"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    trace_id = Column(String, ForeignKey("traces.id"), nullable=False)
    user_id = Column(String, nullable=False)
    feedback_label = Column(String, nullable=False)  # 'good' | 'bad'
    comment = Column(Text, nullable=False)
    followup_qna = Column(JSON, default=list)  # [{"question": "...", "answer": "..."}, ...]
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="discovery_feedback")
    trace = relationship("TraceDB")


class DiscoveryAnalysisDB(Base):
    """Database model for AI-powered discovery analysis results."""

    __tablename__ = "discovery_analysis"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    template_used = Column(String, nullable=False)  # 'evaluation_criteria' | 'themes_patterns'
    analysis_data = Column(Text, nullable=False)  # Full markdown analysis from LLM
    findings = Column(JSON, nullable=False)  # [{text, evidence_trace_ids, priority}]
    disagreements = Column(JSON, nullable=False)  # {high: [...], medium: [...], lower: [...]}
    participant_count = Column(Integer, nullable=False)
    model_used = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="discovery_analyses")


class RubricDB(Base):
    """Database model for rubrics."""

    __tablename__ = "rubrics"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    question = Column(Text, nullable=False)
    judge_type = Column(String, default="likert")  # likert, binary, freeform
    binary_labels = Column(JSON, nullable=True)  # {"pass": "Pass", "fail": "Fail"}
    rating_scale = Column(Integer, default=5)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="rubrics")


class AnnotationDB(Base):
    """Database model for annotations."""

    __tablename__ = "annotations"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    trace_id = Column(String, ForeignKey("traces.id"), nullable=False)
    user_id = Column(String, nullable=False)
    rating = Column(Integer, nullable=False)  # Legacy: single rating (for backward compatibility)
    ratings = Column(JSON, nullable=True)  # New: multiple ratings as {"question_id": rating}
    comment = Column(Text)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="annotations")
    trace = relationship("TraceDB", back_populates="annotations")


class MLflowIntakeConfigDB(Base):
    """Database model for MLflow intake configuration."""

    __tablename__ = "mlflow_intake_config"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False, unique=True)
    databricks_host = Column(String, nullable=False)
    experiment_id = Column(String, nullable=False)
    max_traces = Column(Integer, default=100)
    filter_string = Column(Text, nullable=True)
    is_ingested = Column(Boolean, default=False)
    trace_count = Column(Integer, default=0)
    last_ingestion_time = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="mlflow_config")


class DatabricksTokenDB(Base):
    """Database model for storing Databricks tokens per workshop."""

    __tablename__ = "databricks_tokens"

    workshop_id = Column(String, ForeignKey("workshops.id"), primary_key=True)
    token = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    workshop = relationship("WorkshopDB", back_populates="databricks_token")


class JudgePromptDB(Base):
    """Database model for judge prompts."""

    __tablename__ = "judge_prompts"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    prompt_text = Column(Text, nullable=False)
    judge_type = Column(String, default="likert")  # likert, binary, freeform
    version = Column(Integer, nullable=False)
    few_shot_examples = Column(JSON, default=list)
    model_name = Column(String, default="demo")
    model_parameters = Column(JSON, nullable=True)
    binary_labels = Column(JSON, nullable=True)  # {"pass": "Pass", "fail": "Fail"}
    rating_scale = Column(Integer, default=5)
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
    performance_metrics = Column(JSON, nullable=True)

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="judge_prompts")
    evaluations = relationship("JudgeEvaluationDB", back_populates="prompt", cascade="all, delete-orphan")


class JudgeEvaluationDB(Base):
    """Database model for judge evaluations."""

    __tablename__ = "judge_evaluations"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    prompt_id = Column(String, ForeignKey("judge_prompts.id"), nullable=False)
    trace_id = Column(String, ForeignKey("traces.id"), nullable=False)
    # For rubric judges (1-5 scale)
    predicted_rating = Column(Integer, nullable=True)
    human_rating = Column(Integer, nullable=True)
    # For binary judges (pass/fail)
    predicted_binary = Column(Boolean, nullable=True)
    human_binary = Column(Boolean, nullable=True)
    # For freeform judges (text feedback)
    predicted_feedback = Column(Text, nullable=True)
    human_feedback = Column(Text, nullable=True)
    # Common fields
    confidence = Column(Float, nullable=True)
    reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="judge_evaluations")
    prompt = relationship("JudgePromptDB", back_populates="evaluations")
    trace = relationship("TraceDB", back_populates="judge_evaluations")


class UserTraceOrderDB(Base):
    """Database model for user-specific trace orderings."""

    __tablename__ = "user_trace_orders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    discovery_traces = Column(JSON, default=list)  # Ordered list of trace IDs for discovery
    annotation_traces = Column(JSON, default=list)  # Ordered list of trace IDs for annotation
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="user_trace_orders")


class ParticipantNoteDB(Base):
    """Database model for participant notes during discovery.

    Allows SMEs/participants to jot down notes while reviewing traces.
    These notes appear in the facilitator's Scratch Pad during rubric creation.
    """

    __tablename__ = "participant_notes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    trace_id = Column(String, ForeignKey("traces.id"), nullable=True)  # Nullable: note can be general
    content = Column(Text, nullable=False)
    phase = Column(String, default="discovery")  # 'discovery' or 'annotation'
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="participant_notes")
    user = relationship("UserDB")
    trace = relationship("TraceDB")


class CustomLLMProviderConfigDB(Base):
    """Database model for custom OpenAI-compatible LLM provider configuration.

    This stores the non-sensitive configuration for custom LLM endpoints.
    The API key is NOT stored here - it's stored in-memory via TokenStorageService.
    """

    __tablename__ = "custom_llm_provider_config"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False, unique=True)
    provider_name = Column(String, nullable=False)  # User-friendly name, e.g., "Azure OpenAI"
    base_url = Column(String, nullable=False)  # Base URL for the endpoint
    model_name = Column(String, nullable=False)  # Model identifier
    is_enabled = Column(Boolean, default=True)  # Whether to use custom provider vs Databricks
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    workshop = relationship("WorkshopDB", back_populates="custom_llm_provider")


# Common PostgreSQL serverless connection error markers
_PG_CONNECTION_ERRORS = (
    "connection is closed",
    "server closed the connection unexpectedly",
    "terminating connection",
    "connection reset",
    "ssl connection has been closed unexpectedly",
    "could not connect to server",
    "connection refused",
    "connection timed out",
    "invalid authorization",  # Lakebase: expired OAuth token
    "database is locked",  # SQLite
)


def _is_connection_error(exc: Exception) -> bool:
    """Check if an exception is a transient connection error."""
    from sqlalchemy.exc import DisconnectionError, OperationalError

    if isinstance(exc, (DisconnectionError, OperationalError)):
        return True
    msg = str(exc).lower()
    return any(marker in msg for marker in _PG_CONNECTION_ERRORS)


def _reset_connection_pool() -> None:
    """Reset the connection pool and force OAuth token refresh.

    Disposes all pooled connections (closing stale ones) and marks the
    OAuth token for refresh so the next connection gets a fresh token.
    """
    engine.dispose()
    if DATABASE_BACKEND == DatabaseBackend.POSTGRESQL:
        try:
            from .db_config import get_token_manager

            get_token_manager().force_refresh()
            logger.info("Connection pool reset and OAuth token marked for refresh")
        except Exception as e:
            logger.warning("Pool reset OK but token refresh failed: %s", e)
    else:
        logger.info("Connection pool reset (SQLite)")


def get_db():
    """Get database session with retry logic for serverless connection drops.

    Serverless PostgreSQL (e.g. Databricks Lakebase) drops idle connections.
    On connection failure during session establishment, resets the pool
    (+ OAuth token) and retries up to 3 times with exponential backoff.

    Errors that occur *during* request processing (after yield) are NOT
    retried here — they bubble up to DatabaseErrorMiddleware which returns
    a 503.  Retrying after yield would cause "generator didn't stop after
    throw()" because a FastAPI dependency generator must only yield once.
    """
    import time as _time

    max_attempts = 3
    db = None

    # Phase 1: Establish connection with retries
    for attempt in range(max_attempts):
        try:
            db = SessionLocal()
            # Quick connectivity check on PostgreSQL to surface stale connections early
            if DATABASE_BACKEND == DatabaseBackend.POSTGRESQL:
                from sqlalchemy import text

                db.execute(text("SELECT 1"))
            break  # Connection succeeded
        except Exception as e:
            if db:
                try:
                    db.close()
                except Exception:
                    pass
                db = None
            if _is_connection_error(e) and attempt < max_attempts - 1:
                backoff = 0.5 * (attempt + 1)  # 0.5s, 1.0s
                logger.warning(
                    "Database connection failed (attempt %d/%d), resetting pool and retrying in %.1fs: %s",
                    attempt + 1,
                    max_attempts,
                    backoff,
                    e,
                )
                _reset_connection_pool()
                _time.sleep(backoff)
                continue
            raise

    # Phase 2: Yield the session for request processing (single yield, no retry)
    try:
        yield db
    finally:
        if db:
            try:
                db.close()
            except Exception as e:
                logger.warning("Error closing database session: %s", e)


def create_tables():
    """Legacy helper to create tables directly (not used in normal operation).

    Schema changes should be applied via Alembic migrations, not at runtime.
    Supports both SQLite and PostgreSQL (Lakebase) backends.
    """
    from .db_config import get_schema_name

    try:
        print("🔧 Creating database tables...")

        # For PostgreSQL/Lakebase, create schema first if needed
        if DATABASE_BACKEND == DatabaseBackend.POSTGRESQL:
            schema_name = get_schema_name()
            pg_user = os.getenv("PGUSER", "")
            if schema_name:
                from sqlalchemy import text

                with engine.connect() as conn:
                    conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema_name}"'))
                    if pg_user:
                        conn.execute(text(f'GRANT ALL PRIVILEGES ON SCHEMA "{schema_name}" TO "{pg_user}"'))
                    conn.commit()
                    print(f"✅ Created/verified schema: {schema_name}")

        # Use checkfirst=True to avoid errors if tables already exist
        Base.metadata.create_all(bind=engine, checkfirst=True)
        print("✅ Database tables created successfully")

        # Grant privileges on all tables to PGUSER (PostgreSQL only)
        if DATABASE_BACKEND == DatabaseBackend.POSTGRESQL:
            schema_name = get_schema_name()
            pg_user = os.getenv("PGUSER", "")
            if schema_name and pg_user:
                try:
                    from sqlalchemy import text

                    with engine.connect() as conn:
                        conn.execute(
                            text(f'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "{schema_name}" TO "{pg_user}"')
                        )
                        conn.execute(
                            text(f'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "{schema_name}" TO "{pg_user}"')
                        )
                        conn.commit()
                        print(f"✅ Privileges granted to {pg_user} on schema {schema_name}")
                except Exception as grant_err:
                    print(f"ℹ️ Privilege grant skipped: {grant_err}")
    except Exception as e:
        # Handle case where tables already exist (common in production)
        error_msg = str(e).lower()
        if "already exists" in error_msg or ("table" in error_msg and "exists" in error_msg):
            print("ℹ️ Some tables already exist, continuing with schema updates...")
        else:
            print(f"❌ Error creating database tables: {e}")
            raise e

    # Enable WAL mode for better SQLite concurrency (only for SQLite)
    if DATABASE_BACKEND == DatabaseBackend.SQLITE:
        try:
            from sqlalchemy import text

            with engine.connect() as conn:
                conn.execute(text("PRAGMA journal_mode=WAL"))
                conn.execute(text("PRAGMA busy_timeout=60000"))  # 60 second busy timeout
                conn.commit()
                print("✅ SQLite WAL mode enabled for better concurrency")
        except Exception as e:
            print(f"ℹ️ Could not enable WAL mode (non-critical): {e}")

    # Update schema for existing databases
    _apply_schema_updates()


def _apply_schema_updates():
    """Apply schema updates for existing databases.

    Handles both SQLite and PostgreSQL syntax differences.
    """
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            # Determine if we're using PostgreSQL or SQLite
            is_postgres = DATABASE_BACKEND == DatabaseBackend.POSTGRESQL

            try:
                # Add new columns to judge_prompts table if they don't exist
                if is_postgres:
                    conn.execute(
                        text("ALTER TABLE judge_prompts ADD COLUMN IF NOT EXISTS model_name VARCHAR DEFAULT 'demo'")
                    )
                    conn.execute(text("ALTER TABLE judge_prompts ADD COLUMN IF NOT EXISTS model_parameters JSON"))
                else:
                    conn.execute(text("ALTER TABLE judge_prompts ADD COLUMN model_name VARCHAR DEFAULT 'demo'"))
                    conn.execute(text("ALTER TABLE judge_prompts ADD COLUMN model_parameters JSON"))
                conn.commit()
                print("✅ Database schema updated for judge_prompts")
            except Exception as e:
                # Columns already exist or table doesn't exist yet
                print(f"ℹ️ judge_prompts schema update skipped (columns may already exist): {e}")

            try:
                # Add ratings column to annotations table for multiple question support
                if is_postgres:
                    conn.execute(text("ALTER TABLE annotations ADD COLUMN IF NOT EXISTS ratings JSON"))
                else:
                    conn.execute(text("ALTER TABLE annotations ADD COLUMN ratings JSON"))
                conn.commit()
                print("✅ Database schema updated for annotations (added ratings column)")
            except Exception as e:
                print(f"ℹ️ annotations schema update skipped (ratings column may already exist): {e}")

            try:
                # Add include_in_alignment column to traces table for alignment filtering
                if is_postgres:
                    conn.execute(
                        text("ALTER TABLE traces ADD COLUMN IF NOT EXISTS include_in_alignment BOOLEAN DEFAULT TRUE")
                    )
                else:
                    conn.execute(text("ALTER TABLE traces ADD COLUMN include_in_alignment BOOLEAN DEFAULT 1"))
                conn.commit()
                print("✅ Database schema updated for traces (added include_in_alignment column)")
            except Exception as e:
                print(f"ℹ️ traces schema update skipped (include_in_alignment column may already exist): {e}")

            try:
                # Add sme_feedback column to traces table for concatenated SME feedback
                if is_postgres:
                    conn.execute(text("ALTER TABLE traces ADD COLUMN IF NOT EXISTS sme_feedback TEXT"))
                else:
                    conn.execute(text("ALTER TABLE traces ADD COLUMN sme_feedback TEXT"))
                conn.commit()
                print("✅ Database schema updated for traces (added sme_feedback column)")
            except Exception as e:
                print(f"ℹ️ traces schema update skipped (sme_feedback column may already exist): {e}")

            try:
                # Add unique constraint to discovery_findings to prevent duplicate entries
                if is_postgres:
                    conn.execute(
                        text(
                            "CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_findings_unique ON discovery_findings (workshop_id, trace_id, user_id)"
                        )
                    )
                else:
                    conn.execute(
                        text(
                            "CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_findings_unique ON discovery_findings (workshop_id, trace_id, user_id)"
                        )
                    )
                conn.commit()
                print("✅ Database schema updated: added unique constraint to discovery_findings")
            except Exception as e:
                print(f"ℹ️ discovery_findings unique constraint skipped (may already exist): {e}")

            try:
                # Add unique constraint to annotations to prevent duplicate entries (user_id + trace_id)
                conn.execute(
                    text("CREATE UNIQUE INDEX IF NOT EXISTS idx_annotations_unique ON annotations (user_id, trace_id)")
                )
                conn.commit()
                print("✅ Database schema updated: added unique constraint to annotations")
            except Exception as e:
                print(f"ℹ️ annotations unique constraint skipped (may already exist): {e}")

            try:
                # Add unique constraint to judge_evaluations to prevent duplicate entries (prompt_id + trace_id)
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS idx_judge_evaluations_unique ON judge_evaluations (prompt_id, trace_id)"
                    )
                )
                conn.commit()
                print("✅ Database schema updated: added unique constraint to judge_evaluations")
            except Exception as e:
                print(f"ℹ️ judge_evaluations unique constraint skipped (may already exist): {e}")

            try:
                # Add show_participant_notes column to workshops table
                if is_postgres:
                    conn.execute(
                        text(
                            "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS show_participant_notes BOOLEAN DEFAULT FALSE"
                        )
                    )
                else:
                    conn.execute(text("ALTER TABLE workshops ADD COLUMN show_participant_notes BOOLEAN DEFAULT 0"))
                conn.commit()
                print("✅ Database schema updated for workshops (added show_participant_notes column)")
            except Exception as e:
                print(f"ℹ️ workshops show_participant_notes column skipped (may already exist): {e}")

            try:
                # Create participant_notes table if it doesn't exist
                if is_postgres:
                    conn.execute(
                        text("""
                        CREATE TABLE IF NOT EXISTS participant_notes (
                            id VARCHAR PRIMARY KEY,
                            workshop_id VARCHAR NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
                            user_id VARCHAR NOT NULL REFERENCES users(id),
                            trace_id VARCHAR REFERENCES traces(id),
                            content TEXT NOT NULL,
                            phase VARCHAR DEFAULT 'discovery' NOT NULL,
                            created_at TIMESTAMP DEFAULT NOW(),
                            updated_at TIMESTAMP DEFAULT NOW()
                        )
                    """)
                    )
                else:
                    conn.execute(
                        text("""
                        CREATE TABLE IF NOT EXISTS participant_notes (
                            id VARCHAR PRIMARY KEY,
                            workshop_id VARCHAR NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
                            user_id VARCHAR NOT NULL REFERENCES users(id),
                            trace_id VARCHAR REFERENCES traces(id),
                            content TEXT NOT NULL,
                            phase VARCHAR DEFAULT 'discovery' NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    """)
                    )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_participant_notes_workshop_user ON participant_notes (workshop_id, user_id)"
                    )
                )
                conn.commit()
                print("✅ Database schema updated: created participant_notes table")
            except Exception as e:
                print(f"ℹ️ participant_notes table creation skipped (may already exist): {e}")

            try:
                # Add phase column to participant_notes table
                if is_postgres:
                    conn.execute(
                        text(
                            "ALTER TABLE participant_notes ADD COLUMN IF NOT EXISTS phase VARCHAR DEFAULT 'discovery' NOT NULL"
                        )
                    )
                else:
                    conn.execute(
                        text("ALTER TABLE participant_notes ADD COLUMN phase VARCHAR DEFAULT 'discovery' NOT NULL")
                    )
                conn.commit()
                print("✅ Database schema updated for participant_notes (added phase column)")
            except Exception as e:
                print(f"ℹ️ participant_notes phase column skipped (may already exist): {e}")

    except Exception as e:
        # Schema updates are optional, don't fail if they error
        print(f"ℹ️ Schema update error (non-critical): {e}")


def drop_tables():
    """Drop all database tables."""
    Base.metadata.drop_all(bind=engine)


if __name__ == "__main__":
    # Create tables when run directly
    create_tables()
    print("Database tables created successfully!")
