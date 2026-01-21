"""Database setup and configuration for the workshop application."""

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
    create_engine,
    event,
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.sql import func

try:
    # Imported for side effects/availability; some deployments may not ship encryption extras.
    from .utils.encryption import decrypt_sensitive_data as _decrypt_sensitive_data  # noqa: F401
    from .utils.encryption import encrypt_sensitive_data as _encrypt_sensitive_data  # noqa: F401
except ImportError:
    pass

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./workshop.db")

# Enhanced connection arguments for SQLite to handle concurrency better
sqlite_connect_args = (
    {
        'check_same_thread': False,
        'timeout': 60,  # 60 second timeout for database operations (increased for concurrent writes)
        'isolation_level': 'DEFERRED',  # Use DEFERRED for better concurrency with proper transaction support
    }
    if 'sqlite' in DATABASE_URL
    else {}
)

# Create engine with connection pooling and better concurrency settings
engine = create_engine(
    DATABASE_URL,
    connect_args=sqlite_connect_args,
    pool_size=20,  # Maximum number of connections to maintain in the pool
    max_overflow=30,  # Maximum number of connections that can be created beyond pool_size
    pool_timeout=30,  # Timeout in seconds for getting connection from pool
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_pre_ping=True,  # Verify connections before use
    echo=False,  # Set to True for SQL debugging
)


# CRITICAL: Enable WAL mode and set busy_timeout for EVERY new SQLite connection
# This is essential for proper concurrent write handling
# Without this, multiple users submitting feedback simultaneously can lose data
if 'sqlite' in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        """Set SQLite PRAGMAs on every new connection for proper concurrency."""
        cursor = dbapi_connection.cursor()
        # WAL mode: Allows concurrent reads during writes (critical for multi-user apps)
        cursor.execute("PRAGMA journal_mode=WAL")
        # Busy timeout: Wait up to 60 seconds if database is locked before failing
        cursor.execute("PRAGMA busy_timeout=60000")
        # Synchronous NORMAL: Good balance of safety and performance with WAL
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

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
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
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


def get_db():
    """Get database session with proper error handling and connection management."""
    db = None
    try:
        db = SessionLocal()
        yield db
    except Exception as e:
        if db:
            db.rollback()
        raise e
    finally:
        if db:
            try:
                db.close()
            except Exception as e:
                # Log the error but don't raise it to avoid masking the original error
                print(f"Warning: Error closing database session: {e}")


def create_tables():
    """Legacy helper to create tables directly (not used in normal operation).

    Schema changes should be applied via Alembic migrations, not at runtime.
    """
    try:
        print('🔧 Creating database tables...')
        # Use checkfirst=True to avoid errors if tables already exist
        Base.metadata.create_all(bind=engine, checkfirst=True)
        print('✅ Database tables created successfully')
    except Exception as e:
        # Handle case where tables already exist (common in production)
        error_msg = str(e).lower()
        if 'already exists' in error_msg or 'table' in error_msg and 'exists' in error_msg:
            print('ℹ️ Some tables already exist, continuing with schema updates...')
        else:
            print(f'❌ Error creating database tables: {e}')
            raise e

    # Enable WAL mode for better SQLite concurrency (allows concurrent reads during writes)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text('PRAGMA journal_mode=WAL'))
            conn.execute(text('PRAGMA busy_timeout=60000'))  # 60 second busy timeout
            conn.commit()
            print('✅ SQLite WAL mode enabled for better concurrency')
    except Exception as e:
        print(f'ℹ️ Could not enable WAL mode (non-critical): {e}')

    # Update schema for existing databases
    try:
        from sqlalchemy import text

        with engine.connect() as conn:
            try:
                # Add new columns to judge_prompts table if they don't exist
                conn.execute(text("ALTER TABLE judge_prompts ADD COLUMN model_name VARCHAR DEFAULT 'demo'"))
                conn.execute(text('ALTER TABLE judge_prompts ADD COLUMN model_parameters JSON'))
                print('✅ Database schema updated for judge_prompts')
            except Exception as e:
                # Columns already exist or table doesn't exist yet
                print(f'ℹ️ judge_prompts schema update skipped (columns may already exist): {e}')

            try:
                # Add ratings column to annotations table for multiple question support
                conn.execute(text('ALTER TABLE annotations ADD COLUMN ratings JSON'))
                conn.commit()
                print('✅ Database schema updated for annotations (added ratings column)')
            except Exception as e:
                # Column already exists or table doesn't exist yet
                print(f'ℹ️ annotations schema update skipped (ratings column may already exist): {e}')

            try:
                # Add include_in_alignment column to traces table for alignment filtering
                conn.execute(text('ALTER TABLE traces ADD COLUMN include_in_alignment BOOLEAN DEFAULT 1'))
                conn.commit()
                print('✅ Database schema updated for traces (added include_in_alignment column)')
            except Exception as e:
                print(f'ℹ️ traces schema update skipped (include_in_alignment column may already exist): {e}')

            try:
                # Add sme_feedback column to traces table for concatenated SME feedback
                conn.execute(text('ALTER TABLE traces ADD COLUMN sme_feedback TEXT'))
                conn.commit()
                print('✅ Database schema updated for traces (added sme_feedback column)')
            except Exception as e:
                print(f'ℹ️ traces schema update skipped (sme_feedback column may already exist): {e}')

            try:
                # Add unique constraint to discovery_findings to prevent duplicate entries
                conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_discovery_findings_unique ON discovery_findings (workshop_id, trace_id, user_id)'))
                conn.commit()
                print('✅ Database schema updated: added unique constraint to discovery_findings')
            except Exception as e:
                print(f'ℹ️ discovery_findings unique constraint skipped (may already exist): {e}')

            try:
                # Add unique constraint to annotations to prevent duplicate entries (user_id + trace_id)
                conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_annotations_unique ON annotations (user_id, trace_id)'))
                conn.commit()
                print('✅ Database schema updated: added unique constraint to annotations')
            except Exception as e:
                print(f'ℹ️ annotations unique constraint skipped (may already exist): {e}')

            try:
                # Add unique constraint to judge_evaluations to prevent duplicate entries (prompt_id + trace_id)
                conn.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS idx_judge_evaluations_unique ON judge_evaluations (prompt_id, trace_id)'))
                conn.commit()
                print('✅ Database schema updated: added unique constraint to judge_evaluations')
            except Exception as e:
                print(f'ℹ️ judge_evaluations unique constraint skipped (may already exist): {e}')

    except Exception as e:
        # Schema updates are optional, don't fail if they error
        print(f'ℹ️ Schema update error (non-critical): {e}')


def drop_tables():
    """Drop all database tables."""
    Base.metadata.drop_all(bind=engine)


if __name__ == "__main__":
    # Create tables when run directly
    create_tables()
    print("Database tables created successfully!")
