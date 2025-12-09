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
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship, sessionmaker
from sqlalchemy.sql import func

try:
  from .utils.encryption import decrypt_sensitive_data, encrypt_sensitive_data
except ImportError:
  pass

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///./workshop.db')

# Enhanced connection arguments for SQLite to handle concurrency better
sqlite_connect_args = (
  {
    'check_same_thread': False,
    'timeout': 30,  # 30 second timeout for database operations
    'isolation_level': None,  # Use autocommit mode for better concurrency
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

# Create session factory with better session management
SessionLocal = sessionmaker(
  autocommit=False,
  autoflush=False,
  bind=engine,
  expire_on_commit=False,  # Prevent lazy loading issues
)

# Flag to prevent infinite recursion during table creation
_tables_created = False

# Create base class for models
Base = declarative_base()


class UserDB(Base):
  """Database model for users."""

  __tablename__ = 'users'

  id = Column(String, primary_key=True)
  email = Column(String, unique=True, nullable=False)
  name = Column(String, nullable=False)
  role = Column(String, nullable=False)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  status = Column(String, default='active')
  password_hash = Column(String, nullable=True)  # For authentication
  created_at = Column(DateTime, default=func.now())
  last_active = Column(DateTime, nullable=True)

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='users')
  participants = relationship('WorkshopParticipantDB', back_populates='user')


class FacilitatorConfigDB(Base):
  """Database model for facilitator configurations."""

  __tablename__ = 'facilitator_configs'

  id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
  email = Column(String, unique=True, nullable=False)
  password_hash = Column(String, nullable=False)
  name = Column(String, nullable=False)
  description = Column(Text, nullable=True)
  created_at = Column(DateTime, default=func.now())


class WorkshopParticipantDB(Base):
  """Database model for workshop participants."""

  __tablename__ = 'workshop_participants'

  id = Column(String, primary_key=True)
  user_id = Column(String, ForeignKey('users.id'), nullable=False)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  role = Column(String, nullable=False)
  assigned_traces = Column(JSON, default=list)
  annotation_quota = Column(Integer, nullable=True)
  joined_at = Column(DateTime, default=func.now())

  # Relationships
  user = relationship('UserDB', back_populates='participants')
  workshop = relationship('WorkshopDB', back_populates='participants')


class WorkshopDB(Base):
  """Database model for workshops."""

  __tablename__ = 'workshops'

  id = Column(String, primary_key=True)
  name = Column(String, nullable=False)
  description = Column(Text)
  facilitator_id = Column(String, nullable=False)
  status = Column(String, default='active')
  current_phase = Column(String, default='intake')
  completed_phases = Column(JSON, default=list)
  discovery_started = Column(Boolean, default=False)
  annotation_started = Column(Boolean, default=False)
  active_discovery_trace_ids = Column(JSON, default=list)
  active_annotation_trace_ids = Column(JSON, default=list)
  judge_name = Column(String, default='workshop_judge')  # Name used for feedback entries
  created_at = Column(DateTime, default=func.now())

  # Relationships
  users = relationship('UserDB', back_populates='workshop', cascade='all, delete-orphan')
  participants = relationship('WorkshopParticipantDB', back_populates='workshop', cascade='all, delete-orphan')
  traces = relationship('TraceDB', back_populates='workshop', cascade='all, delete-orphan')
  findings = relationship('DiscoveryFindingDB', back_populates='workshop', cascade='all, delete-orphan')
  rubrics = relationship('RubricDB', back_populates='workshop', cascade='all, delete-orphan')
  annotations = relationship('AnnotationDB', back_populates='workshop', cascade='all, delete-orphan')
  mlflow_config = relationship('MLflowIntakeConfigDB', back_populates='workshop', uselist=False, cascade='all, delete-orphan')
  judge_prompts = relationship('JudgePromptDB', back_populates='workshop', cascade='all, delete-orphan')
  judge_evaluations = relationship('JudgeEvaluationDB', back_populates='workshop', cascade='all, delete-orphan')
  databricks_token = relationship('DatabricksTokenDB', back_populates='workshop', uselist=False, cascade='all, delete-orphan')
  user_trace_orders = relationship('UserTraceOrderDB', back_populates='workshop', cascade='all, delete-orphan')
  user_discovery_completions = relationship('UserDiscoveryCompletionDB', back_populates='workshop', cascade='all, delete-orphan')


class TraceDB(Base):
  """Database model for traces."""

  __tablename__ = 'traces'

  id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
  workshop_id = Column(String, ForeignKey('workshops.id', ondelete='CASCADE'))
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
  workshop = relationship('WorkshopDB', back_populates='traces')
  findings = relationship('DiscoveryFindingDB', back_populates='trace')
  annotations = relationship('AnnotationDB', back_populates='trace')
  judge_evaluations = relationship('JudgeEvaluationDB', back_populates='trace')


class DiscoveryFindingDB(Base):
  """Database model for discovery findings."""

  __tablename__ = 'discovery_findings'

  id = Column(String, primary_key=True)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  trace_id = Column(String, ForeignKey('traces.id'), nullable=False)
  user_id = Column(String, nullable=False)
  insight = Column(Text, nullable=False)
  created_at = Column(DateTime, default=func.now())

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='findings')
  trace = relationship('TraceDB', back_populates='findings')


class UserDiscoveryCompletionDB(Base):
  """Database model for tracking user discovery completion."""

  __tablename__ = 'user_discovery_completions'

  id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  user_id = Column(String, ForeignKey('users.id'), nullable=False)
  completed_at = Column(DateTime, default=func.now())

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='user_discovery_completions')
  user = relationship('UserDB')


class RubricDB(Base):
  """Database model for rubrics."""

  __tablename__ = 'rubrics'

  id = Column(String, primary_key=True)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  question = Column(Text, nullable=False)
  created_by = Column(String, nullable=False)
  created_at = Column(DateTime, default=func.now())

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='rubrics')


class AnnotationDB(Base):
  """Database model for annotations."""

  __tablename__ = 'annotations'

  id = Column(String, primary_key=True)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  trace_id = Column(String, ForeignKey('traces.id'), nullable=False)
  user_id = Column(String, nullable=False)
  rating = Column(Integer, nullable=False)  # Legacy: single rating (for backward compatibility)
  ratings = Column(JSON, nullable=True)  # New: multiple ratings as {"question_id": rating}
  comment = Column(Text)
  created_at = Column(DateTime, default=func.now())

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='annotations')
  trace = relationship('TraceDB', back_populates='annotations')


class MLflowIntakeConfigDB(Base):
  """Database model for MLflow intake configuration."""

  __tablename__ = 'mlflow_intake_config'

  id = Column(String, primary_key=True)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False, unique=True)
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
  workshop = relationship('WorkshopDB', back_populates='mlflow_config')


class DatabricksTokenDB(Base):
  """Database model for storing Databricks tokens per workshop."""

  __tablename__ = 'databricks_tokens'

  workshop_id = Column(String, ForeignKey('workshops.id'), primary_key=True)
  token = Column(Text, nullable=False)
  created_at = Column(DateTime, default=func.now())
  updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

  workshop = relationship('WorkshopDB', back_populates='databricks_token')


class JudgePromptDB(Base):
  """Database model for judge prompts."""

  __tablename__ = 'judge_prompts'

  id = Column(String, primary_key=True)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  prompt_text = Column(Text, nullable=False)
  version = Column(Integer, nullable=False)
  few_shot_examples = Column(JSON, default=list)
  model_name = Column(String, default='demo')
  model_parameters = Column(JSON, nullable=True)
  created_by = Column(String, nullable=False)
  created_at = Column(DateTime, default=func.now())
  performance_metrics = Column(JSON, nullable=True)

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='judge_prompts')
  evaluations = relationship('JudgeEvaluationDB', back_populates='prompt', cascade='all, delete-orphan')


class JudgeEvaluationDB(Base):
  """Database model for judge evaluations."""

  __tablename__ = 'judge_evaluations'

  id = Column(String, primary_key=True)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  prompt_id = Column(String, ForeignKey('judge_prompts.id'), nullable=False)
  trace_id = Column(String, ForeignKey('traces.id'), nullable=False)
  predicted_rating = Column(Integer, nullable=False)
  human_rating = Column(Integer, nullable=False)
  confidence = Column(Float, nullable=True)
  reasoning = Column(Text, nullable=True)
  created_at = Column(DateTime, default=func.now())

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='judge_evaluations')
  prompt = relationship('JudgePromptDB', back_populates='evaluations')
  trace = relationship('TraceDB', back_populates='judge_evaluations')


class UserTraceOrderDB(Base):
  """Database model for user-specific trace orderings."""

  __tablename__ = 'user_trace_orders'

  id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
  user_id = Column(String, nullable=False)
  workshop_id = Column(String, ForeignKey('workshops.id'), nullable=False)
  discovery_traces = Column(JSON, default=list)  # Ordered list of trace IDs for discovery
  annotation_traces = Column(JSON, default=list)  # Ordered list of trace IDs for annotation
  created_at = Column(DateTime, default=func.now())
  updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

  # Relationships
  workshop = relationship('WorkshopDB', back_populates='user_trace_orders')


def get_db():
  """Get database session with proper error handling and connection management."""
  global _tables_created

  # Ensure database tables exist before creating session (only once)
  if not _tables_created:
    try:
      create_tables()
      _tables_created = True
    except Exception as e:
      print(f'Warning: Could not create tables: {e}')

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
        print(f'Warning: Error closing database session: {e}')


def create_tables():
  """Create all database tables."""
  try:
    print('🔧 Creating database tables...')
    Base.metadata.create_all(bind=engine)
    print('✅ Database tables created successfully')

    # Update schema for existing databases
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

  except Exception as e:
    print(f'❌ Error creating database tables: {e}')
    raise e


def drop_tables():
  """Drop all database tables."""
  Base.metadata.drop_all(bind=engine)


if __name__ == '__main__':
  # Create tables when run directly
  create_tables()
  print('Database tables created successfully!')
