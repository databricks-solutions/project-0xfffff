"""Database service layer for workshop operations."""

import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from server.database import (
  AnnotationDB,
  DatabricksTokenDB,
  DiscoveryFindingDB,
  FacilitatorConfigDB,
  JudgeEvaluationDB,
  JudgePromptDB,
  MLflowIntakeConfigDB,
  RubricDB,
  TraceDB,
  UserDB,
  UserDiscoveryCompletionDB,
  UserTraceOrderDB,
  WorkshopDB,
  WorkshopParticipantDB,
)
from server.models import (
  Annotation,
  AnnotationCreate,
  DiscoveryFinding,
  DiscoveryFindingCreate,
  FacilitatorConfig,
  FacilitatorConfigCreate,
  JudgeEvaluation,
  JudgePrompt,
  JudgePromptCreate,
  MLflowIntakeConfig,
  MLflowIntakeStatus,
  Rubric,
  RubricCreate,
  Trace,
  TraceUpload,
  User,
  UserCreate,
  UserRole,
  UserStatus,
  UserTraceOrder,
  Workshop,
  WorkshopCreate,
  WorkshopParticipant,
  WorkshopPhase,
)
from server.services.token_storage_service import token_storage
from server.utils.config import get_facilitator_config
from server.utils.password import generate_default_password, hash_password, verify_password


logger = logging.getLogger(__name__)


class DatabaseService:
  """Service layer for database operations with caching support."""

  def __init__(self, db: Session):
    self.db = db
    # Simple in-memory cache for frequently accessed data
    self._cache = {}
    self._cache_ttl = 30  # 30 seconds TTL

  def _get_cache_key(self, prefix: str, *args) -> str:
    """Generate a cache key from prefix and arguments."""
    return f'{prefix}:{":".join(str(arg) for arg in args)}'

  def _get_from_cache(self, key: str):
    """Get value from cache if not expired."""
    import time

    if key in self._cache:
      value, timestamp = self._cache[key]
      if time.time() - timestamp < self._cache_ttl:
        return value
      else:
        del self._cache[key]
    return None

  def _set_cache(self, key: str, value):
    """Set value in cache with timestamp."""
    import time

    self._cache[key] = (value, time.time())

  # Workshop operations
  def create_workshop(self, workshop_data: WorkshopCreate) -> Workshop:
    """Create a new workshop in the database."""
    workshop_id = str(uuid.uuid4())
    db_workshop = WorkshopDB(
      id=workshop_id,
      name=workshop_data.name,
      description=workshop_data.description,
      facilitator_id=workshop_data.facilitator_id,
    )
    self.db.add(db_workshop)
    self.db.commit()
    self.db.refresh(db_workshop)

    return Workshop(
      id=db_workshop.id,
      name=db_workshop.name,
      description=db_workshop.description,
      facilitator_id=db_workshop.facilitator_id,
      status=db_workshop.status,
      current_phase=db_workshop.current_phase,
      completed_phases=db_workshop.completed_phases or [],
      discovery_started=db_workshop.discovery_started or False,
      annotation_started=db_workshop.annotation_started or False,
      active_discovery_trace_ids=db_workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=db_workshop.active_annotation_trace_ids or [],
      created_at=db_workshop.created_at,
    )

  def get_workshop(self, workshop_id: str) -> Optional[Workshop]:
    """Get a workshop by ID with caching."""
    cache_key = self._get_cache_key('workshop', workshop_id)
    cached_workshop = self._get_from_cache(cache_key)
    if cached_workshop is not None:
      return cached_workshop

    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    workshop = Workshop(
      id=db_workshop.id,
      name=db_workshop.name,
      description=db_workshop.description,
      facilitator_id=db_workshop.facilitator_id,
      status=db_workshop.status,
      current_phase=db_workshop.current_phase,
      completed_phases=db_workshop.completed_phases or [],
      discovery_started=db_workshop.discovery_started or False,
      annotation_started=db_workshop.annotation_started or False,
      active_discovery_trace_ids=db_workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=db_workshop.active_annotation_trace_ids or [],
      judge_name=db_workshop.judge_name or 'workshop_judge',
      created_at=db_workshop.created_at,
    )

    self._set_cache(cache_key, workshop)
    return workshop

  def update_workshop_judge_name(self, workshop_id: str, judge_name: str) -> Optional[Workshop]:
    """Update the judge name for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.judge_name = judge_name
    self.db.commit()
    self.db.refresh(db_workshop)

    # Clear cache for this workshop
    cache_key = self._get_cache_key('workshop', workshop_id)
    if cache_key in self._cache:
      del self._cache[cache_key]

    return self.get_workshop(workshop_id)

  def update_workshop_phase(self, workshop_id: str, new_phase: WorkshopPhase) -> Optional[Workshop]:
    """Update the current phase of a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.current_phase = new_phase
    self.db.commit()
    self.db.refresh(db_workshop)

    return Workshop(
      id=db_workshop.id,
      name=db_workshop.name,
      description=db_workshop.description,
      facilitator_id=db_workshop.facilitator_id,
      status=db_workshop.status,
      current_phase=db_workshop.current_phase,
      completed_phases=db_workshop.completed_phases or [],
      discovery_started=db_workshop.discovery_started or False,
      annotation_started=db_workshop.annotation_started or False,
      active_discovery_trace_ids=db_workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=db_workshop.active_annotation_trace_ids or [],
      created_at=db_workshop.created_at,
    )

  def update_phase_started(
    self,
    workshop_id: str,
    discovery_started: Optional[bool] = None,
    annotation_started: Optional[bool] = None,
  ) -> Optional[Workshop]:
    """Update the phase started flags for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    if discovery_started is not None:
      db_workshop.discovery_started = discovery_started
    if annotation_started is not None:
      db_workshop.annotation_started = annotation_started

    self.db.commit()
    self.db.refresh(db_workshop)

    return Workshop(
      id=db_workshop.id,
      name=db_workshop.name,
      description=db_workshop.description,
      facilitator_id=db_workshop.facilitator_id,
      status=db_workshop.status,
      current_phase=db_workshop.current_phase,
      completed_phases=db_workshop.completed_phases or [],
      discovery_started=db_workshop.discovery_started or False,
      annotation_started=db_workshop.annotation_started or False,
      active_discovery_trace_ids=db_workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=db_workshop.active_annotation_trace_ids or [],
      created_at=db_workshop.created_at,
    )

  def update_active_discovery_traces(self, workshop_id: str, trace_ids: List[str]) -> Optional[Workshop]:
    """Update the active discovery trace IDs for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.active_discovery_trace_ids = trace_ids
    self.db.commit()
    self.db.refresh(db_workshop)

    return Workshop(
      id=db_workshop.id,
      name=db_workshop.name,
      description=db_workshop.description,
      facilitator_id=db_workshop.facilitator_id,
      status=db_workshop.status,
      current_phase=db_workshop.current_phase,
      completed_phases=db_workshop.completed_phases or [],
      discovery_started=db_workshop.discovery_started or False,
      annotation_started=db_workshop.annotation_started or False,
      active_discovery_trace_ids=db_workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=db_workshop.active_annotation_trace_ids or [],
      created_at=db_workshop.created_at,
    )

  def update_active_annotation_traces(self, workshop_id: str, trace_ids: List[str]) -> Optional[Workshop]:
    """Update the active annotation trace IDs for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.active_annotation_trace_ids = trace_ids
    self.db.commit()
    self.db.refresh(db_workshop)

    return Workshop(
      id=db_workshop.id,
      name=db_workshop.name,
      description=db_workshop.description,
      facilitator_id=db_workshop.facilitator_id,
      status=db_workshop.status,
      current_phase=db_workshop.current_phase,
      completed_phases=db_workshop.completed_phases or [],
      discovery_started=db_workshop.discovery_started or False,
      annotation_started=db_workshop.annotation_started or False,
      active_discovery_trace_ids=db_workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=db_workshop.active_annotation_trace_ids or [],
      created_at=db_workshop.created_at,
    )

  # Trace operations
  def add_traces(self, workshop_id: str, traces: List[TraceUpload]) -> List[Trace]:
    """Add traces to a workshop."""
    db_traces = []

    for trace_data in traces:
      trace_id = str(uuid.uuid4())
      db_trace = TraceDB(
        id=trace_id,
        workshop_id=workshop_id,
        input=trace_data.input,
        output=trace_data.output,
        context=trace_data.context,
        trace_metadata=trace_data.trace_metadata,
        mlflow_trace_id=trace_data.mlflow_trace_id,
        mlflow_experiment_id=trace_data.mlflow_experiment_id,
      )
      self.db.add(db_trace)
      db_traces.append(db_trace)

    self.db.commit()

    # Refresh and create response objects after commit
    created_traces = []
    for db_trace in db_traces:
      self.db.refresh(db_trace)
      created_traces.append(
        Trace(
          id=db_trace.id,
          workshop_id=db_trace.workshop_id,
          input=db_trace.input,
          output=db_trace.output,
          context=db_trace.context,
          trace_metadata=db_trace.trace_metadata,
          mlflow_trace_id=db_trace.mlflow_trace_id,
          created_at=db_trace.created_at,
        )
      )

    return created_traces

  def get_traces(self, workshop_id: str) -> List[Trace]:
    """Get all traces for a workshop in chronological order."""
    db_traces = self.db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id).order_by(TraceDB.created_at).all()

    return [self._trace_from_db(db_trace) for db_trace in db_traces]

  def get_traces_by_experiment(self, workshop_id: str, experiment_id: str) -> List[Trace]:
    """Get all traces for a workshop that were ingested from a specific MLflow experiment."""
    db_traces = self.db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id, TraceDB.mlflow_experiment_id == experiment_id).all()

    return [self._trace_from_db(db_trace) for db_trace in db_traces]

  def get_active_discovery_traces(self, workshop_id: str, user_id: str) -> List[Trace]:
    """Get only the active discovery traces for a workshop in user-specific randomized order.

    Each user sees the same set of traces but in a different randomized order.
    The order is deterministic per user (based on user_id seed).

    Args:
        workshop_id: The workshop ID
        user_id: The user ID (required for personalized trace ordering)

    Returns:
        List of traces in user-specific randomized order

    Raises:
        ValueError: If user_id is not provided
    """
    import time

    if not user_id:
      raise ValueError('user_id is required for fetching discovery traces')

    start_time = time.time()

    # Get workshop data (cached)
    workshop = self.get_workshop(workshop_id)
    if not workshop or not workshop.active_discovery_trace_ids:
      return []

    active_trace_ids = workshop.active_discovery_trace_ids

    # Get or create user-specific trace order
    user_order = self.get_user_trace_order(workshop_id, user_id)
    
    if not user_order:
      # Create new user trace order with randomized discovery traces
      user_order = self.create_user_trace_order(workshop_id, user_id)
      # Generate randomized order for this user
      user_order.discovery_traces = self._generate_randomized_trace_order(active_trace_ids, user_id)
      self.update_user_trace_order(user_order)
    elif not user_order.discovery_traces or set(user_order.discovery_traces) != set(active_trace_ids):
      # Update if trace set has changed (e.g., new traces added)
      # Preserve existing order for traces already seen, add new ones randomly
      existing_traces = [tid for tid in user_order.discovery_traces if tid in active_trace_ids]
      new_traces = [tid for tid in active_trace_ids if tid not in user_order.discovery_traces]
      
      # Randomize only the new traces
      randomized_new_traces = self._generate_randomized_trace_order(new_traces, user_id)
      
      # Combine: existing traces first (in their original order), then new randomized traces
      user_order.discovery_traces = existing_traces + randomized_new_traces
      self.update_user_trace_order(user_order)

    # Use the user's personalized trace order
    ordered_ids = user_order.discovery_traces

    # Optimized trace fetching - single query with IN clause
    if not ordered_ids:
      return []

    db_traces = self.db.query(TraceDB).filter(TraceDB.id.in_(ordered_ids)).all()

    # Create ordered result efficiently - preserve the user-specific order
    trace_map = {t.id: t for t in db_traces}
    result = []
    for tid in ordered_ids:
      if tid in trace_map:
        result.append(self._trace_from_db(trace_map[tid]))

    # Log performance metrics
    load_time = time.time() - start_time
    if load_time > 0.1:  # Log slow requests
      print(f'⚠️ Slow trace load: {load_time:.3f}s for {len(result)} traces (user: {user_id[:8]}...)')

    return result

  def _generate_randomized_trace_order(self, trace_ids: List[str], user_id: str) -> List[str]:
    """Generate a randomized order of trace IDs for a specific user.

    Uses the user_id combined with the sorted trace IDs as a seed to ensure:
    1. Consistent randomization per user for the same set of traces
    2. Different randomization when the trace set changes

    Args:
        trace_ids: List of trace IDs to randomize
        user_id: User ID to use as random seed

    Returns:
        Randomized list of trace IDs
    """
    import random
    import hashlib

    if not trace_ids:
      return []

    # Create a deterministic seed from user_id + sorted trace IDs
    # This ensures that the same user sees the same order for the same set of traces,
    # but different traces (e.g., newly added ones) will have different randomization
    sorted_trace_ids = sorted(trace_ids)
    seed_string = f"{user_id}::{','.join(sorted_trace_ids)}"
    seed = int(hashlib.md5(seed_string.encode()).hexdigest(), 16) % (2**31)
    
    # Create a new random instance with the user-specific seed
    rng = random.Random(seed)
    
    # Create a copy and shuffle it
    randomized_ids = trace_ids.copy()
    rng.shuffle(randomized_ids)
    
    return randomized_ids

  def get_active_annotation_traces(self, workshop_id: str, user_id: str) -> List[Trace]:
    """Get only the active annotation traces for a workshop in user-specific randomized order.

    Each user sees the same set of traces but in a different randomized order.
    The order is deterministic per user (based on user_id seed).

    Args:
        workshop_id: The workshop ID
        user_id: The user ID (required for personalized trace ordering)

    Returns:
        List of traces in user-specific randomized order

    Raises:
        ValueError: If user_id is not provided
    """
    import time

    if not user_id:
      raise ValueError('user_id is required for fetching annotation traces')

    start_time = time.time()

    workshop = self.get_workshop(workshop_id)
    if not workshop or not workshop.active_annotation_trace_ids:
      return []

    active_trace_ids = workshop.active_annotation_trace_ids

    # Get or create user-specific trace order
    user_order = self.get_user_trace_order(workshop_id, user_id)
    
    if not user_order:
      # Create new user trace order with randomized annotation traces
      user_order = self.create_user_trace_order(workshop_id, user_id)
      # Generate randomized order for this user
      user_order.annotation_traces = self._generate_randomized_trace_order(active_trace_ids, user_id)
      self.update_user_trace_order(user_order)
    elif not user_order.annotation_traces or set(user_order.annotation_traces) != set(active_trace_ids):
      # Update if trace set has changed (e.g., new traces added)
      # Preserve existing order for traces already seen, add new ones randomly
      existing_traces = [tid for tid in user_order.annotation_traces if tid in active_trace_ids]
      new_traces = [tid for tid in active_trace_ids if tid not in user_order.annotation_traces]
      
      # Randomize only the new traces
      randomized_new_traces = self._generate_randomized_trace_order(new_traces, user_id)
      
      # Combine: existing traces first (in their original order), then new randomized traces
      user_order.annotation_traces = existing_traces + randomized_new_traces
      self.update_user_trace_order(user_order)

    # Use the user's personalized trace order
    ordered_ids = user_order.annotation_traces

    # Optimized trace fetching - single query with IN clause
    if not ordered_ids:
      return []

    db_traces = self.db.query(TraceDB).filter(TraceDB.id.in_(ordered_ids)).all()

    # Create ordered result efficiently - preserve the user-specific order
    trace_map = {t.id: t for t in db_traces}
    result = []
    for tid in ordered_ids:
      if tid in trace_map:
        result.append(self._trace_from_db(trace_map[tid]))

    # Log performance metrics
    load_time = time.time() - start_time
    if load_time > 0.1:  # Log slow requests
      print(f'⚠️ Slow annotation trace load: {load_time:.3f}s for {len(result)} traces (user: {user_id[:8]}...)')

    return result

  # Discovery finding operations
  def add_finding(self, workshop_id: str, finding_data: DiscoveryFindingCreate) -> DiscoveryFinding:
    """Add a discovery finding."""
    finding_id = str(uuid.uuid4())
    db_finding = DiscoveryFindingDB(
      id=finding_id,
      workshop_id=workshop_id,
      trace_id=finding_data.trace_id,
      user_id=finding_data.user_id,
      insight=finding_data.insight,
    )
    self.db.add(db_finding)
    self.db.commit()
    self.db.refresh(db_finding)

    return DiscoveryFinding(
      id=db_finding.id,
      workshop_id=db_finding.workshop_id,
      trace_id=db_finding.trace_id,
      user_id=db_finding.user_id,
      insight=db_finding.insight,
      created_at=db_finding.created_at,
    )

  def get_findings(self, workshop_id: str, user_id: Optional[str] = None) -> List[DiscoveryFinding]:
    """Get discovery findings for a workshop, optionally filtered by user."""
    query = self.db.query(DiscoveryFindingDB).filter(DiscoveryFindingDB.workshop_id == workshop_id)

    # Filter by user_id if provided
    if user_id:
      query = query.filter(DiscoveryFindingDB.user_id == user_id)

    db_findings = query.all()

    return [
      DiscoveryFinding(
        id=db_finding.id,
        workshop_id=db_finding.workshop_id,
        trace_id=db_finding.trace_id,
        user_id=db_finding.user_id,
        insight=db_finding.insight,
        created_at=db_finding.created_at,
      )
      for db_finding in db_findings
    ]

  def get_findings_with_user_details(self, workshop_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get discovery findings with user details for facilitator view."""
    query = (
      self.db.query(DiscoveryFindingDB, UserDB)
      .join(UserDB, DiscoveryFindingDB.user_id == UserDB.id)
      .filter(DiscoveryFindingDB.workshop_id == workshop_id)
    )

    # Filter by user_id if provided
    if user_id:
      query = query.filter(DiscoveryFindingDB.user_id == user_id)

    results = query.all()

    return [
      {
        'id': finding.id,
        'workshop_id': finding.workshop_id,
        'trace_id': finding.trace_id,
        'user_id': finding.user_id,
        'user_name': user.name,
        'user_email': user.email,
        'insight': finding.insight,
        'created_at': finding.created_at,
      }
      for finding, user in results
    ]

  # Rubric operations
  def create_rubric(self, workshop_id: str, rubric_data: RubricCreate) -> Rubric:
    """Create or update a rubric for a workshop."""
    # Check if rubric already exists
    existing_rubric = self.db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).first()

    if existing_rubric:
      # Update existing rubric
      existing_rubric.question = rubric_data.question
      existing_rubric.created_by = rubric_data.created_by
      self.db.commit()
      self.db.refresh(existing_rubric)
      db_rubric = existing_rubric
    else:
      # Create new rubric
      rubric_id = str(uuid.uuid4())
      db_rubric = RubricDB(
        id=rubric_id,
        workshop_id=workshop_id,
        question=rubric_data.question,
        created_by=rubric_data.created_by,
      )
      self.db.add(db_rubric)
      self.db.commit()
      self.db.refresh(db_rubric)

    # Auto-derive and save judge_name from the first rubric question title
    # This ensures the backend always has the correct judge name for MLflow feedback
    workshop_db = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if workshop_db and (not workshop_db.judge_name or workshop_db.judge_name == 'workshop_judge'):
      # Parse the rubric question to get the first title
      questions = self._parse_rubric_questions(rubric_data.question)
      if questions and questions[0].get('title'):
        title = questions[0]['title']
        # Convert to snake_case and append _judge
        import re
        snake_case = re.sub(r'[^a-z0-9]+', '_', title.lower()).strip('_')
        derived_judge_name = f"{snake_case}_judge"
        workshop_db.judge_name = derived_judge_name
        self.db.commit()
        logger.info("Auto-derived judge_name '%s' from rubric title '%s'", derived_judge_name, title)
        # Clear workshop cache
        cache_key = self._get_cache_key('workshop', workshop_id)
        if cache_key in self._cache:
          del self._cache[cache_key]

    return Rubric(
      id=db_rubric.id,
      workshop_id=db_rubric.workshop_id,
      question=db_rubric.question,
      created_by=db_rubric.created_by,
      created_at=db_rubric.created_at,
    )

  def update_rubric_question(self, workshop_id: str, question_id: str, title: str, description: str) -> Optional[Rubric]:
    """Update a specific question in the rubric.

    Args:
        workshop_id: Workshop ID
        question_id: The ID of the question to update (e.g., "q_1", "q_2")
        title: New question title
        description: New question description
    """
    # Get existing rubric
    existing_rubric = self.db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).first()

    if not existing_rubric:
      return None

    # Parse existing questions
    questions = self._parse_rubric_questions(existing_rubric.question)

    # Find and update the specific question
    question_found = False
    for i, question in enumerate(questions):
      if question.get('id') == question_id:
        questions[i]['title'] = title
        questions[i]['description'] = description
        question_found = True
        break

    if not question_found:
      return None

    # Reconstruct the question field
    updated_question = self._reconstruct_rubric_questions(questions)

    # Update the rubric
    existing_rubric.question = updated_question
    self.db.commit()
    self.db.refresh(existing_rubric)

    return Rubric(
      id=existing_rubric.id,
      workshop_id=existing_rubric.workshop_id,
      question=existing_rubric.question,
      created_by=existing_rubric.created_by,
      created_at=existing_rubric.created_at,
    )

  def delete_rubric_question(self, workshop_id: str, question_id: str) -> Optional[Rubric]:
    """Delete a specific question from the rubric.

    Args:
        workshop_id: Workshop ID
        question_id: The ID of the question to delete (e.g., "q_1", "q_2")
    """
    # Get existing rubric
    existing_rubric = self.db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).first()

    if not existing_rubric:
      return None

    # Parse existing questions
    questions = self._parse_rubric_questions(existing_rubric.question)

    # Remove the specific question
    questions = [q for q in questions if q.get('id') != question_id]

    if not questions:
      # If no questions left, delete the entire rubric
      self.db.delete(existing_rubric)
      self.db.commit()
      return None

    # Reconstruct the question field
    updated_question = self._reconstruct_rubric_questions(questions)

    # Update the rubric
    existing_rubric.question = updated_question
    self.db.commit()
    self.db.refresh(existing_rubric)

    return Rubric(
      id=existing_rubric.id,
      workshop_id=existing_rubric.workshop_id,
      question=existing_rubric.question,
      created_by=existing_rubric.created_by,
      created_at=existing_rubric.created_at,
    )

  def _parse_rubric_questions(self, question_text: str) -> list:
    """Parse the rubric question text into individual questions."""
    questions = []
    if not question_text:
      return questions

    # Use a special delimiter to separate questions (supports newlines within descriptions)
    QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'
    question_parts = question_text.split(QUESTION_DELIMITER)
    
    for i, part in enumerate(question_parts):
      part = part.strip()
      if not part:
        continue
        
      # Split only at the first colon to separate title from description
      if ':' in part:
        title, description = part.split(':', 1)
        questions.append({'id': f'q_{i + 1}', 'title': title.strip(), 'description': description.strip()})

    return questions

  def _reconstruct_rubric_questions(self, questions: list) -> str:
    """Reconstruct individual questions into a single question text."""
    if not questions:
      return ''

    QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'
    question_parts = []
    for i, question in enumerate(questions):
      # Update the ID to be sequential
      question['id'] = f'q_{i + 1}'
      question_parts.append(f'{question["title"]}: {question["description"]}')

    return QUESTION_DELIMITER.join(question_parts)

  def get_rubric(self, workshop_id: str) -> Optional[Rubric]:
    """Get the rubric for a workshop."""
    db_rubric = self.db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).first()

    if not db_rubric:
      return None

    return Rubric(
      id=db_rubric.id,
      workshop_id=db_rubric.workshop_id,
      question=db_rubric.question,
      created_by=db_rubric.created_by,
      created_at=db_rubric.created_at,
    )

  # Annotation operations
  def add_annotation(self, workshop_id: str, annotation_data: AnnotationCreate) -> Annotation:
    """Add an annotation. If a duplicate exists, update the existing one."""
    # Check if annotation already exists for this user and trace
    existing_annotation = (
      self.db.query(AnnotationDB).filter(AnnotationDB.user_id == annotation_data.user_id, AnnotationDB.trace_id == annotation_data.trace_id).first()
    )

    if existing_annotation:
      # Update existing annotation
      existing_annotation.rating = annotation_data.rating
      existing_annotation.ratings = annotation_data.ratings  # Support multiple ratings
      existing_annotation.comment = annotation_data.comment
      self.db.commit()
      self.db.refresh(existing_annotation)
      self._sync_annotation_with_mlflow(workshop_id, existing_annotation)

      return Annotation(
        id=existing_annotation.id,
        workshop_id=existing_annotation.workshop_id,
        trace_id=existing_annotation.trace_id,
        user_id=existing_annotation.user_id,
        rating=existing_annotation.rating,
        ratings=existing_annotation.ratings,
        comment=existing_annotation.comment,
        mlflow_trace_id=existing_annotation.trace.mlflow_trace_id,
        created_at=existing_annotation.created_at,
      )
    else:
      # Create new annotation
      annotation_id = str(uuid.uuid4())
      db_annotation = AnnotationDB(
        id=annotation_id,
        workshop_id=workshop_id,
        trace_id=annotation_data.trace_id,
        user_id=annotation_data.user_id,
        rating=annotation_data.rating,
        ratings=annotation_data.ratings,  # Support multiple ratings
        comment=annotation_data.comment,
      )
      self.db.add(db_annotation)
      self.db.commit()
      self.db.refresh(db_annotation)
      self._sync_annotation_with_mlflow(workshop_id, db_annotation)

      return Annotation(
        id=db_annotation.id,
        workshop_id=db_annotation.workshop_id,
        trace_id=db_annotation.trace_id,
        user_id=db_annotation.user_id,
        rating=db_annotation.rating,
        ratings=db_annotation.ratings,
        comment=db_annotation.comment,
        mlflow_trace_id=db_annotation.trace.mlflow_trace_id,
        created_at=db_annotation.created_at,
      )

  def _sync_annotation_with_mlflow(self, workshop_id: str, annotation_db: AnnotationDB) -> None:
    """Ensure MLflow trace carries SME tag + feedback once an annotation is captured."""
    if not annotation_db or not getattr(annotation_db, 'trace', None):
      return

    mlflow_trace_id = getattr(annotation_db.trace, 'mlflow_trace_id', None)
    if not mlflow_trace_id:
      return

    config = (
      self.db.query(MLflowIntakeConfigDB)
      .filter(MLflowIntakeConfigDB.workshop_id == workshop_id)
      .first()
    )
    if not config or not config.databricks_host or not config.experiment_id:
      logger.debug('Skipping MLflow sync: config missing for workshop %s', workshop_id)
      return

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
      databricks_token = self.get_databricks_token(workshop_id)
      if databricks_token:
        token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
      logger.debug('Skipping MLflow sync: token missing for workshop %s', workshop_id)
      return

    try:
      import mlflow
      from mlflow.entities import AssessmentSource, AssessmentSourceType
    except ImportError:
      logger.warning('MLflow is not available; cannot sync annotation feedback.')
      return

    os.environ['DATABRICKS_HOST'] = config.databricks_host.rstrip('/')
    os.environ['DATABRICKS_TOKEN'] = databricks_token
    os.environ.pop('DATABRICKS_CLIENT_ID', None)
    os.environ.pop('DATABRICKS_CLIENT_SECRET', None)

    mlflow.set_tracking_uri('databricks')

    try:
      mlflow.set_experiment(experiment_id=config.experiment_id)
    except Exception as exc:
      logger.warning('Failed to set MLflow experiment %s: %s', config.experiment_id, exc)
      return

    set_trace_tag = getattr(mlflow, 'set_trace_tag', None)
    tags = {
      'label': 'jbws',
      'workshop_id': workshop_id,
    }
    if set_trace_tag:
      for key, value in tags.items():
        try:
          set_trace_tag(trace_id=mlflow_trace_id, key=key, value=value)
        except Exception as exc:
          logger.warning('Failed to set MLflow trace tag %s for %s: %s', key, mlflow_trace_id, exc)
    else:
      logger.debug('mlflow.set_trace_tag not available; skip tagging for trace %s', mlflow_trace_id)

    if annotation_db.rating is None:
      return

    # Get the workshop's judge_name (used for MLflow feedback entries)
    workshop_db = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    judge_name = workshop_db.judge_name if workshop_db and workshop_db.judge_name else 'workshop_judge'

    try:
      rationale = annotation_db.comment.strip() if annotation_db.comment else None
      mlflow.log_feedback(
        trace_id=mlflow_trace_id,
        name=judge_name,
        value=annotation_db.rating,
        source=AssessmentSource(
          source_type=AssessmentSourceType.HUMAN,
          source_id=annotation_db.user_id or workshop_id,
        ),
        rationale=rationale,
      )
    except Exception as exc:
      logger.warning('Failed to log MLflow feedback for trace %s: %s', mlflow_trace_id, exc)

  def resync_annotations_to_mlflow(self, workshop_id: str) -> Dict[str, Any]:
    """Re-sync all annotations to MLflow with the current workshop judge_name.
    
    This is useful when the judge_name changes after annotations were created.
    Creates new MLflow feedback entries with the correct judge_name.
    """
    workshop_db = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not workshop_db:
      return {'error': 'Workshop not found', 'synced': 0}
    
    judge_name = workshop_db.judge_name if workshop_db.judge_name else 'workshop_judge'
    
    # Get all annotations
    annotations = self.get_annotations(workshop_id)
    
    synced_count = 0
    errors = []
    
    for annotation in annotations:
      try:
        # Get the annotation DB record to access trace relationship
        annotation_db = self.db.query(AnnotationDB).filter(AnnotationDB.id == annotation.id).first()
        if annotation_db:
          self._sync_annotation_with_mlflow(workshop_id, annotation_db)
          synced_count += 1
      except Exception as e:
        errors.append(f"Annotation {annotation.id}: {str(e)}")
        logger.warning('Failed to resync annotation %s: %s', annotation.id, e)
    
    return {
      'synced': synced_count,
      'total': len(annotations),
      'judge_name': judge_name,
      'errors': errors if errors else None
    }

  def get_annotations(self, workshop_id: str, user_id: Optional[str] = None) -> List[Annotation]:
    """Get annotations for a workshop, optionally filtered by user."""
    query = self.db.query(AnnotationDB).join(TraceDB).filter(AnnotationDB.workshop_id == workshop_id)

    # Filter by user_id if provided
    if user_id:
      query = query.filter(AnnotationDB.user_id == user_id)

    db_annotations = query.all()

    return [
      Annotation(
        id=db_annotation.id,
        workshop_id=db_annotation.workshop_id,
        trace_id=db_annotation.trace_id,
        user_id=db_annotation.user_id,
        rating=db_annotation.rating,
        ratings=db_annotation.ratings,  # Include multiple ratings
        comment=db_annotation.comment,
        mlflow_trace_id=db_annotation.trace.mlflow_trace_id,
        created_at=db_annotation.created_at,
      )
      for db_annotation in db_annotations
    ]

  def get_annotations_with_user_details(self, workshop_id: str, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get annotations with user details for facilitator view."""
    query = self.db.query(AnnotationDB, UserDB).join(UserDB, AnnotationDB.user_id == UserDB.id).filter(AnnotationDB.workshop_id == workshop_id)

    # Filter by user_id if provided
    if user_id:
      query = query.filter(AnnotationDB.user_id == user_id)

    results = query.all()

    return [
      {
        'id': annotation.id,
        'workshop_id': annotation.workshop_id,
        'trace_id': annotation.trace_id,
        'user_id': annotation.user_id,
        'user_name': user.name,
        'user_email': user.email,
        'rating': annotation.rating,
        'ratings': annotation.ratings,  # Include per-metric ratings dictionary
        'comment': annotation.comment,
        'mlflow_trace_id': getattr(annotation, 'mlflow_trace_id', None),
        'created_at': annotation.created_at,
      }
      for annotation, user in results
    ]

  # User management operations
  def create_user(self, user: User) -> User:
    """Create a new user in the database."""
    db_user = UserDB(
      id=user.id,
      email=user.email,
      name=user.name,
      role=user.role,
      workshop_id=user.workshop_id,
      status=user.status,
      password_hash=user.password_hash,
      created_at=user.created_at,
      last_active=user.last_active,
    )
    self.db.add(db_user)
    self.db.commit()
    self.db.refresh(db_user)
    return user

  def create_user_with_password(self, user_data: UserCreate) -> User:
    """Create a new user with password."""
    # Normalize email to lowercase for consistency
    normalized_email = user_data.email.lower()
    
    # Generate default password if not provided
    if not user_data.password:
      user_data.password = generate_default_password(normalized_email)

    # Hash the password
    password_hash = hash_password(user_data.password)

    # Create user with PENDING status
    user = User(
      id=str(uuid.uuid4()),
      email=normalized_email,
      name=user_data.name,
      role=user_data.role,
      workshop_id=user_data.workshop_id,
      status=UserStatus.PENDING,
      password_hash=password_hash,
    )

    return self.create_user(user)

  def authenticate_user(self, email: str, password: str) -> Optional[User]:
    """Authenticate a user with email and password. SMEs and participants only need email."""
    # Case-insensitive email comparison
    db_user = self.db.query(UserDB).filter(UserDB.email.ilike(email)).first()
    if not db_user:
      return None

    # For SMEs and participants, skip password verification (email-only login)
    if db_user.role in ['sme', 'participant']:
      pass  # No password verification needed
    # For facilitators, require password verification
    elif db_user.role == 'facilitator':
      if not verify_password(password, db_user.password_hash or ''):
        return None
    else:
      # Unknown role, require password for security
      if not verify_password(password, db_user.password_hash or ''):
        return None

    return User(
      id=db_user.id,
      email=db_user.email,
      name=db_user.name,
      role=db_user.role,
      workshop_id=db_user.workshop_id,
      status=db_user.status,
      password_hash=db_user.password_hash,
      created_at=db_user.created_at,
      last_active=db_user.last_active,
    )

  def authenticate_facilitator_from_yaml(self, email: str, password: str) -> Optional[Dict[str, Any]]:
    """Authenticate a facilitator using YAML configuration."""
    facilitator_config = get_facilitator_config(email)
    if not facilitator_config:
      return None

    if facilitator_config.get('password') != password:
      return None

    return facilitator_config

  def get_or_create_facilitator_user(self, facilitator_data: Dict[str, Any]) -> User:
    """Get or create a facilitator user from YAML config."""
    # Normalize email to lowercase for consistency
    email = facilitator_data['email'].lower()

    # Check if user already exists
    existing_user = self.get_user_by_email(email)
    if existing_user:
      return existing_user

    # Create new facilitator user
    password_hash = hash_password(facilitator_data['password'])

    user = User(
      id=str(uuid.uuid4()),
      email=email,
      name=facilitator_data['name'],
      role=UserRole.FACILITATOR,
      workshop_id='',  # Will be set when workshop is created
      password_hash=password_hash,
    )

    return self.create_user(user)

  def get_user_by_email(self, email: str) -> Optional[User]:
    """Get user by email address."""
    # Case-insensitive email comparison
    db_user = self.db.query(UserDB).filter(UserDB.email.ilike(email)).first()
    if not db_user:
      return None

    return User(
      id=db_user.id,
      email=db_user.email,
      name=db_user.name,
      role=db_user.role,
      workshop_id=db_user.workshop_id,
      status=db_user.status,
      password_hash=db_user.password_hash,
      created_at=db_user.created_at,
      last_active=db_user.last_active,
    )

  def create_facilitator_config(self, config_data: FacilitatorConfigCreate) -> FacilitatorConfig:
    """Create a facilitator configuration."""
    password_hash = hash_password(config_data.password)

    db_config = FacilitatorConfigDB(
      id=str(uuid.uuid4()),
      email=config_data.email,
      password_hash=password_hash,
      name=config_data.name,
      description=config_data.description,
    )

    self.db.add(db_config)
    self.db.commit()
    self.db.refresh(db_config)

    return FacilitatorConfig(
      email=db_config.email,
      password_hash=db_config.password_hash,
      name=db_config.name,
      description=db_config.description,
      created_at=db_config.created_at,
    )

  def get_facilitator_config(self, email: str) -> Optional[FacilitatorConfig]:
    """Get facilitator configuration by email."""
    # Case-insensitive email comparison
    db_config = self.db.query(FacilitatorConfigDB).filter(FacilitatorConfigDB.email.ilike(email)).first()

    if not db_config:
      return None

    return FacilitatorConfig(
      email=db_config.email,
      password_hash=db_config.password_hash,
      name=db_config.name,
      description=db_config.description,
      created_at=db_config.created_at,
    )

  def list_facilitator_configs(self) -> List[FacilitatorConfig]:
    """List all facilitator configurations."""
    db_configs = self.db.query(FacilitatorConfigDB).all()

    return [
      FacilitatorConfig(
        email=config.email,
        password_hash=config.password_hash,
        name=config.name,
        description=config.description,
        created_at=config.created_at,
      )
      for config in db_configs
    ]

  def get_user(self, user_id: str) -> Optional[User]:
    """Get a user by ID."""
    db_user = self.db.query(UserDB).filter(UserDB.id == user_id).first()
    if not db_user:
      return None

    return User(
      id=db_user.id,
      email=db_user.email,
      name=db_user.name,
      role=db_user.role,
      workshop_id=db_user.workshop_id,
      status=db_user.status,
      created_at=db_user.created_at,
      last_active=db_user.last_active,
    )

  def update_user(self, user: User) -> User:
    """Update an existing user."""
    db_user = self.db.query(UserDB).filter(UserDB.id == user.id).first()
    if not db_user:
      raise ValueError(f'User {user.id} not found')

    db_user.email = user.email
    db_user.name = user.name
    db_user.role = user.role
    db_user.workshop_id = user.workshop_id
    db_user.status = user.status
    db_user.last_active = user.last_active

    self.db.commit()
    self.db.refresh(db_user)
    return user

  def activate_user_on_login(self, user_id: str) -> None:
    """Activate a user when they log in for the first time."""
    db_user = self.db.query(UserDB).filter(UserDB.id == user_id).first()
    if db_user and db_user.status == 'pending':
      db_user.status = 'active'
      db_user.last_active = datetime.now()
      self.db.commit()

  def list_users(self, workshop_id: Optional[str] = None, role: Optional[UserRole] = None) -> List[User]:
    """List users, optionally filtered by workshop or role."""
    if workshop_id:
      # For workshop-specific queries, use the workshop_participants table
      return self.list_workshop_users(workshop_id, role)

    # For general user queries, use the users table
    query = self.db.query(UserDB)

    if role:
      query = query.filter(UserDB.role == role)

    db_users = query.all()

    return [
      User(
        id=db_user.id,
        email=db_user.email,
        name=db_user.name,
        role=db_user.role,
        workshop_id=db_user.workshop_id,
        status=db_user.status,
        created_at=db_user.created_at,
        last_active=db_user.last_active,
      )
      for db_user in db_users
    ]

  def list_workshop_users(self, workshop_id: str, role: Optional[UserRole] = None) -> List[User]:
    """List all users in a specific workshop by joining workshop_participants and users tables."""
    query = (
      self.db.query(UserDB, WorkshopParticipantDB)
      .join(WorkshopParticipantDB, UserDB.id == WorkshopParticipantDB.user_id)
      .filter(WorkshopParticipantDB.workshop_id == workshop_id)
    )

    if role:
      query = query.filter(WorkshopParticipantDB.role == role)

    results = query.all()

    return [
      User(
        id=db_user.id,
        email=db_user.email,
        name=db_user.name,
        role=db_participant.role,  # Use the role from WorkshopParticipantDB
        workshop_id=workshop_id,  # Use the workshop_id parameter
        status=db_user.status,
        created_at=db_user.created_at,
        last_active=db_user.last_active,
      )
      for db_user, db_participant in results
    ]

  # Workshop participant operations
  def add_workshop_participant(self, participant: WorkshopParticipant) -> WorkshopParticipant:
    """Add a participant to a workshop."""
    participant_id = str(uuid.uuid4())
    db_participant = WorkshopParticipantDB(
      id=participant_id,
      user_id=participant.user_id,
      workshop_id=participant.workshop_id,
      role=participant.role,
      assigned_traces=participant.assigned_traces,
      annotation_quota=participant.annotation_quota,
      joined_at=participant.joined_at,
    )
    self.db.add(db_participant)
    self.db.commit()
    self.db.refresh(db_participant)

    return WorkshopParticipant(
      user_id=db_participant.user_id,
      workshop_id=db_participant.workshop_id,
      role=db_participant.role,
      assigned_traces=db_participant.assigned_traces or [],
      annotation_quota=db_participant.annotation_quota,
      joined_at=db_participant.joined_at,
    )

  def get_workshop_participants(self, workshop_id: str) -> List[WorkshopParticipant]:
    """Get all participants in a workshop."""
    db_participants = self.db.query(WorkshopParticipantDB).filter(WorkshopParticipantDB.workshop_id == workshop_id).all()

    return [
      WorkshopParticipant(
        user_id=db_participant.user_id,
        workshop_id=db_participant.workshop_id,
        role=db_participant.role,
        assigned_traces=db_participant.assigned_traces or [],
        annotation_quota=db_participant.annotation_quota,
        joined_at=db_participant.joined_at,
      )
      for db_participant in db_participants
    ]

  def get_workshop_participant(self, workshop_id: str, user_id: str) -> Optional[WorkshopParticipant]:
    """Get a specific workshop participant."""
    db_participant = (
      self.db.query(WorkshopParticipantDB)
      .filter(and_(WorkshopParticipantDB.workshop_id == workshop_id, WorkshopParticipantDB.user_id == user_id))
      .first()
    )

    if not db_participant:
      return None

    return WorkshopParticipant(
      user_id=db_participant.user_id,
      workshop_id=db_participant.workshop_id,
      role=db_participant.role,
      assigned_traces=db_participant.assigned_traces or [],
      annotation_quota=db_participant.annotation_quota,
      joined_at=db_participant.joined_at,
    )

  def update_workshop_participant(self, participant: WorkshopParticipant) -> WorkshopParticipant:
    """Update a workshop participant."""
    # TODO: pretty sure this does nothing (no commit, no update)?
    # db_participant = (
    (
      self.db.query(WorkshopParticipantDB)
      .filter(
        and_(
          WorkshopParticipantDB.workshop_id == participant.workshop_id,
          WorkshopParticipantDB.user_id == participant.user_id,
        )
      )
      .first()
    )

  def remove_user_from_workshop(self, workshop_id: str, user_id: str) -> bool:
    """Remove a user from a workshop (but keep them in the system)."""
    db_participant = (
      self.db.query(WorkshopParticipantDB)
      .filter(and_(WorkshopParticipantDB.workshop_id == workshop_id, WorkshopParticipantDB.user_id == user_id))
      .first()
    )

    if not db_participant:
      return False

    self.db.delete(db_participant)
    self.db.commit()
    return True

    # TODO: this was ostensibly here for a reason, but I don't know what it is.
    # if not db_participant:
    #   raise ValueError(
    #     f'Participant {participant.user_id} not found in workshop {participant.workshop_id}'
    #   )

    # db_participant.assigned_traces = participant.assigned_traces
    # db_participant.annotation_quota = participant.annotation_quota

    # self.db.commit()
    # self.db.refresh(db_participant)
    # return participant

  # User Discovery Completion operations
  def mark_user_discovery_complete(self, workshop_id: str, user_id: str) -> None:
    """Mark a user as having completed discovery for a workshop."""
    # Check if already completed
    existing = (
      self.db.query(UserDiscoveryCompletionDB)
      .filter(
        and_(
          UserDiscoveryCompletionDB.workshop_id == workshop_id,
          UserDiscoveryCompletionDB.user_id == user_id,
        )
      )
      .first()
    )

    if not existing:
      completion = UserDiscoveryCompletionDB(workshop_id=workshop_id, user_id=user_id)
      self.db.add(completion)
      self.db.commit()

  def is_user_discovery_complete(self, workshop_id: str, user_id: str) -> bool:
    """Check if a user has completed discovery for a workshop."""
    completion = (
      self.db.query(UserDiscoveryCompletionDB)
      .filter(
        and_(
          UserDiscoveryCompletionDB.workshop_id == workshop_id,
          UserDiscoveryCompletionDB.user_id == user_id,
        )
      )
      .first()
    )
    return completion is not None

  def get_discovery_completion_status(self, workshop_id: str) -> Dict[str, Any]:
    """Get discovery completion status for all users in a workshop."""
    # Get all workshop participants (SMEs and participants, not facilitators) with user details
    participants = (
      self.db.query(WorkshopParticipantDB, UserDB)
      .join(UserDB, WorkshopParticipantDB.user_id == UserDB.id)
      .filter(
        and_(
          WorkshopParticipantDB.workshop_id == workshop_id,
          WorkshopParticipantDB.role.in_(['sme', 'participant']),
        )
      )
      .all()
    )

    # Get completion status for each participant
    completion_status = {}
    for participant, user in participants:
      is_complete = self.is_user_discovery_complete(workshop_id, participant.user_id)
      completion_status[participant.user_id] = {
        'user_id': participant.user_id,
        'user_name': user.name,
        'user_email': user.email,
        'role': participant.role,
        'completed': is_complete,
      }

    # Calculate summary
    total_participants = len(participants)
    completed_participants = sum(1 for status in completion_status.values() if status['completed'])

    return {
      'total_participants': total_participants,
      'completed_participants': completed_participants,
      'completion_percentage': (completed_participants / total_participants * 100) if total_participants > 0 else 0,
      'all_completed': completed_participants == total_participants and total_participants > 0,
      'participant_status': completion_status,
    }

  def get_traces_by_workshop(self, workshop_id: str) -> List[Trace]:
    """Get all traces for a workshop (alias for get_traces)."""
    return self.get_traces(workshop_id)

  # Testing/debugging operations
  def clear_findings(self, workshop_id: str) -> None:
    """Clear all findings for a workshop (for testing)."""
    self.db.query(DiscoveryFindingDB).filter(DiscoveryFindingDB.workshop_id == workshop_id).delete()
    self.db.commit()

  def clear_annotations(self, workshop_id: str) -> None:
    """Clear all annotations for a workshop (for testing)."""
    self.db.query(AnnotationDB).filter(AnnotationDB.workshop_id == workshop_id).delete()
    self.db.commit()

  def clear_rubric(self, workshop_id: str) -> None:
    """Clear the rubric for a workshop (for testing)."""
    self.db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).delete()
    self.db.commit()

  # MLflow Intake Configuration operations
  def create_mlflow_config(self, workshop_id: str, config_data: MLflowIntakeConfig) -> MLflowIntakeConfig:
    """Create or update MLflow intake configuration for a workshop (without storing token)."""
    # Check if config already exists
    existing_config = self.db.query(MLflowIntakeConfigDB).filter(MLflowIntakeConfigDB.workshop_id == workshop_id).first()

    if existing_config:
      # Update existing config
      existing_config.databricks_host = config_data.databricks_host
      existing_config.experiment_id = config_data.experiment_id
      existing_config.max_traces = config_data.max_traces
      existing_config.filter_string = config_data.filter_string
      existing_config.is_ingested = False
      existing_config.trace_count = 0
      existing_config.last_ingestion_time = None
      existing_config.error_message = None

      self.db.commit()
      self.db.refresh(existing_config)

      return MLflowIntakeConfig(
        databricks_host=existing_config.databricks_host,
        databricks_token=config_data.databricks_token,  # Return the provided token, not from DB
        experiment_id=existing_config.experiment_id,
        max_traces=existing_config.max_traces,
        filter_string=existing_config.filter_string,
      )
    else:
      # Create new config
      config_id = str(uuid.uuid4())
      db_config = MLflowIntakeConfigDB(
        id=config_id,
        workshop_id=workshop_id,
        databricks_host=config_data.databricks_host,
        experiment_id=config_data.experiment_id,
        max_traces=config_data.max_traces,
        filter_string=config_data.filter_string,
      )

      self.db.add(db_config)
      self.db.commit()
      self.db.refresh(db_config)

      return MLflowIntakeConfig(
        databricks_host=db_config.databricks_host,
        databricks_token=config_data.databricks_token,  # Return the provided token, not from DB
        experiment_id=db_config.experiment_id,
        max_traces=db_config.max_traces,
        filter_string=db_config.filter_string,
      )

  def get_mlflow_config(self, workshop_id: str) -> Optional[MLflowIntakeConfig]:
    """Get MLflow intake configuration for a workshop (without token)."""
    db_config = self.db.query(MLflowIntakeConfigDB).filter(MLflowIntakeConfigDB.workshop_id == workshop_id).first()

    if not db_config:
      return None

    return MLflowIntakeConfig(
      databricks_host=db_config.databricks_host,
      databricks_token='',  # Token is not stored in database
      experiment_id=db_config.experiment_id,
      max_traces=db_config.max_traces,
      filter_string=db_config.filter_string,
    )

  def set_databricks_token(self, workshop_id: str, token: str) -> None:
    """Persist Databricks token for a workshop."""
    if not token:
      return

    db_token = self.db.query(DatabricksTokenDB).filter(DatabricksTokenDB.workshop_id == workshop_id).first()

    if db_token:
      db_token.token = token
      db_token.updated_at = datetime.now()
    else:
      db_token = DatabricksTokenDB(workshop_id=workshop_id, token=token)
      self.db.add(db_token)

    self.db.commit()

  def get_databricks_token(self, workshop_id: str) -> Optional[str]:
    """Retrieve persisted Databricks token for a workshop."""
    db_token = self.db.query(DatabricksTokenDB).filter(DatabricksTokenDB.workshop_id == workshop_id).first()
    if db_token:
      return db_token.token
    return None

  def update_mlflow_ingestion_status(self, workshop_id: str, trace_count: int, error_message: Optional[str] = None) -> None:
    """Update MLflow ingestion status for a workshop."""
    db_config = self.db.query(MLflowIntakeConfigDB).filter(MLflowIntakeConfigDB.workshop_id == workshop_id).first()

    if db_config:
      # Update ingestion status based on trace count
      if trace_count > 0:
        db_config.is_ingested = True
      else:
        db_config.is_ingested = False
      db_config.trace_count = trace_count

      db_config.last_ingestion_time = datetime.now()
      db_config.error_message = error_message

      self.db.commit()

  def get_mlflow_intake_status(self, workshop_id: str) -> MLflowIntakeStatus:
    """Get MLflow intake status for a workshop."""
    db_config = self.db.query(MLflowIntakeConfigDB).filter(MLflowIntakeConfigDB.workshop_id == workshop_id).first()

    if not db_config:
      return MLflowIntakeStatus(workshop_id=workshop_id, is_configured=False, is_ingested=False, trace_count=0)

    config = MLflowIntakeConfig(
      databricks_host=db_config.databricks_host,
      databricks_token='',  # Token is not stored in database
      experiment_id=db_config.experiment_id,
      max_traces=db_config.max_traces,
      filter_string=db_config.filter_string,
    )

    return MLflowIntakeStatus(
      workshop_id=workshop_id,
      is_configured=True,
      is_ingested=db_config.is_ingested,
      trace_count=db_config.trace_count,
      last_ingestion_time=db_config.last_ingestion_time,
      error_message=db_config.error_message,
      config=config,
    )

  # Judge Tuning operations
  def create_judge_prompt(self, workshop_id: str, prompt_data: JudgePromptCreate) -> JudgePrompt:
    """Create a new judge prompt."""
    # Get current version number
    existing_prompts = self.db.query(JudgePromptDB).filter(JudgePromptDB.workshop_id == workshop_id).all()

    next_version = max([p.version for p in existing_prompts], default=0) + 1

    prompt_id = str(uuid.uuid4())
    db_prompt = JudgePromptDB(
      id=prompt_id,
      workshop_id=workshop_id,
      prompt_text=prompt_data.prompt_text,
      version=next_version,
      few_shot_examples=prompt_data.few_shot_examples or [],
      model_name=prompt_data.model_name or 'demo',
      model_parameters=prompt_data.model_parameters,
      created_by='demo_facilitator',  # In production, get from auth context
    )

    self.db.add(db_prompt)
    self.db.commit()
    self.db.refresh(db_prompt)

    return JudgePrompt(
      id=db_prompt.id,
      workshop_id=db_prompt.workshop_id,
      prompt_text=db_prompt.prompt_text,
      version=db_prompt.version,
      few_shot_examples=db_prompt.few_shot_examples,
      model_name=db_prompt.model_name,
      model_parameters=db_prompt.model_parameters,
      created_by=db_prompt.created_by,
      created_at=db_prompt.created_at,
      performance_metrics=db_prompt.performance_metrics,
    )

  def get_judge_prompts(self, workshop_id: str) -> List[JudgePrompt]:
    """Get all judge prompts for a workshop."""
    db_prompts = self.db.query(JudgePromptDB).filter(JudgePromptDB.workshop_id == workshop_id).order_by(JudgePromptDB.version.desc()).all()

    return [
      JudgePrompt(
        id=db_prompt.id,
        workshop_id=db_prompt.workshop_id,
        prompt_text=db_prompt.prompt_text,
        version=db_prompt.version,
        few_shot_examples=db_prompt.few_shot_examples,
        created_by=db_prompt.created_by,
        created_at=db_prompt.created_at,
        performance_metrics=db_prompt.performance_metrics,
      )
      for db_prompt in db_prompts
    ]

  def get_judge_prompt(self, workshop_id: str, prompt_id: str) -> Optional[JudgePrompt]:
    """Get a specific judge prompt."""
    db_prompt = self.db.query(JudgePromptDB).filter(and_(JudgePromptDB.workshop_id == workshop_id, JudgePromptDB.id == prompt_id)).first()

    if not db_prompt:
      return None

    return JudgePrompt(
      id=db_prompt.id,
      workshop_id=db_prompt.workshop_id,
      prompt_text=db_prompt.prompt_text,
      version=db_prompt.version,
      few_shot_examples=db_prompt.few_shot_examples,
      model_name=db_prompt.model_name,
      model_parameters=db_prompt.model_parameters,
      created_by=db_prompt.created_by,
      created_at=db_prompt.created_at,
      performance_metrics=db_prompt.performance_metrics,
    )

  def update_judge_prompt_metrics(self, prompt_id: str, metrics: dict) -> None:
    """Update performance metrics for a judge prompt."""
    db_prompt = self.db.query(JudgePromptDB).filter(JudgePromptDB.id == prompt_id).first()

    if db_prompt:
      db_prompt.performance_metrics = metrics
      self.db.commit()

  def store_judge_evaluations(self, evaluations: List[JudgeEvaluation]) -> None:
    """Store judge evaluation results."""
    # Clear existing evaluations for this prompt
    if evaluations:
      self.db.query(JudgeEvaluationDB).filter(JudgeEvaluationDB.prompt_id == evaluations[0].prompt_id).delete()

    # Add new evaluations
    for evaluation in evaluations:
      db_evaluation = JudgeEvaluationDB(
        id=evaluation.id,
        workshop_id=evaluation.workshop_id,
        prompt_id=evaluation.prompt_id,
        trace_id=evaluation.trace_id,
        predicted_rating=evaluation.predicted_rating,
        human_rating=evaluation.human_rating,
        confidence=evaluation.confidence,
        reasoning=evaluation.reasoning,
      )
      self.db.add(db_evaluation)

    self.db.commit()

  def get_judge_evaluations(self, workshop_id: str, prompt_id: str) -> List[JudgeEvaluation]:
    """Get evaluation results for a judge prompt."""
    db_evaluations = (
      self.db.query(JudgeEvaluationDB).filter(and_(JudgeEvaluationDB.workshop_id == workshop_id, JudgeEvaluationDB.prompt_id == prompt_id)).all()
    )

    return [
      JudgeEvaluation(
        id=db_eval.id,
        workshop_id=db_eval.workshop_id,
        prompt_id=db_eval.prompt_id,
        trace_id=db_eval.trace_id,
        predicted_rating=db_eval.predicted_rating,
        human_rating=db_eval.human_rating,
        confidence=db_eval.confidence,
        reasoning=db_eval.reasoning,
      )
      for db_eval in db_evaluations
    ]

  def clear_judge_evaluations(self, workshop_id: str, prompt_id: str) -> None:
    """Clear all evaluation results for a specific judge prompt."""
    self.db.query(JudgeEvaluationDB).filter(and_(JudgeEvaluationDB.workshop_id == workshop_id, JudgeEvaluationDB.prompt_id == prompt_id)).delete()
    self.db.commit()

  # User trace order operations
  def get_user_trace_order(self, workshop_id: str, user_id: str) -> Optional[UserTraceOrder]:
    """Get user's trace order for a workshop."""
    db_order = self.db.query(UserTraceOrderDB).filter(and_(UserTraceOrderDB.workshop_id == workshop_id, UserTraceOrderDB.user_id == user_id)).first()

    if not db_order:
      return None

    return UserTraceOrder(
      id=db_order.id,
      user_id=db_order.user_id,
      workshop_id=db_order.workshop_id,
      discovery_traces=db_order.discovery_traces or [],
      annotation_traces=db_order.annotation_traces or [],
      created_at=db_order.created_at,
      updated_at=db_order.updated_at,
    )

  def create_user_trace_order(self, workshop_id: str, user_id: str) -> UserTraceOrder:
    """Create a new user trace order."""
    order_id = str(uuid.uuid4())
    db_order = UserTraceOrderDB(
      id=order_id,
      user_id=user_id,
      workshop_id=workshop_id,
      discovery_traces=[],
      annotation_traces=[],
    )
    self.db.add(db_order)
    self.db.commit()
    self.db.refresh(db_order)

    return UserTraceOrder(
      id=db_order.id,
      user_id=db_order.user_id,
      workshop_id=db_order.workshop_id,
      discovery_traces=db_order.discovery_traces or [],
      annotation_traces=db_order.annotation_traces or [],
      created_at=db_order.created_at,
      updated_at=db_order.updated_at,
    )

  def update_user_trace_order(self, user_order: UserTraceOrder) -> None:
    """Update an existing user trace order."""
    db_order = self.db.query(UserTraceOrderDB).filter(UserTraceOrderDB.id == user_order.id).first()

    if db_order:
      db_order.discovery_traces = user_order.discovery_traces
      db_order.annotation_traces = user_order.annotation_traces
      db_order.updated_at = datetime.now()
      self.db.commit()

  def get_trace(self, trace_id: str) -> Optional[Trace]:
    """Get a specific trace by ID."""
    db_trace = self.db.query(TraceDB).filter(TraceDB.id == trace_id).first()

    if not db_trace:
      return None

    return self._trace_from_db(db_trace)

  def _trace_from_db(self, db_trace: TraceDB) -> Trace:
    """Convert a database trace to a response model."""
    return Trace(
      id=db_trace.id,
      workshop_id=db_trace.workshop_id,
      input=db_trace.input,
      output=db_trace.output,
      context=db_trace.context,
      trace_metadata=db_trace.trace_metadata,  # Renamed from metadata
      mlflow_trace_id=db_trace.mlflow_trace_id,
      mlflow_url=db_trace.mlflow_url,
      mlflow_host=db_trace.mlflow_host,
      mlflow_experiment_id=db_trace.mlflow_experiment_id,
      include_in_alignment=db_trace.include_in_alignment if db_trace.include_in_alignment is not None else True,
      sme_feedback=db_trace.sme_feedback,
      created_at=db_trace.created_at,
    )

  def update_trace_alignment_inclusion(self, trace_id: str, include_in_alignment: bool) -> Optional[Trace]:
    """Update whether a trace should be included in judge alignment."""
    db_trace = self.db.query(TraceDB).filter(TraceDB.id == trace_id).first()
    if not db_trace:
      return None

    db_trace.include_in_alignment = include_in_alignment
    self.db.commit()
    self.db.refresh(db_trace)

    return self._trace_from_db(db_trace)

  def update_trace_sme_feedback(self, trace_id: str, sme_feedback: str) -> Optional[Trace]:
    """Update the concatenated SME feedback for a trace."""
    db_trace = self.db.query(TraceDB).filter(TraceDB.id == trace_id).first()
    if not db_trace:
      return None

    db_trace.sme_feedback = sme_feedback
    self.db.commit()
    self.db.refresh(db_trace)

    return self._trace_from_db(db_trace)

  def get_traces_for_alignment(self, workshop_id: str) -> List[Trace]:
    """Get all traces that are marked for inclusion in alignment."""
    db_traces = (
      self.db.query(TraceDB)
      .filter(
        TraceDB.workshop_id == workshop_id,
        TraceDB.include_in_alignment == True  # noqa: E712
      )
      .order_by(TraceDB.created_at)
      .all()
    )
    return [self._trace_from_db(db_trace) for db_trace in db_traces]

  def aggregate_sme_feedback_for_trace(self, workshop_id: str, trace_id: str) -> Optional[str]:
    """Aggregate all SME comments for a trace into a single feedback string.
    
    Returns the concatenated feedback from all annotations on this trace.
    """
    annotations = self.get_annotations(workshop_id)
    trace_annotations = [a for a in annotations if a.trace_id == trace_id and a.comment]
    
    if not trace_annotations:
      return None
    
    # Concatenate all non-empty comments
    feedback_parts = []
    for ann in trace_annotations:
      if ann.comment and ann.comment.strip():
        feedback_parts.append(f"[{ann.user_id}]: {ann.comment.strip()}")
    
    return "\n\n".join(feedback_parts) if feedback_parts else None
