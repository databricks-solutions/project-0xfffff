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
  JudgeType,
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

  def _workshop_from_db(self, db_workshop: WorkshopDB) -> Workshop:
    """Convert a database workshop object to a Workshop model."""
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
      discovery_randomize_traces=getattr(db_workshop, 'discovery_randomize_traces', False) or False,
      annotation_randomize_traces=getattr(db_workshop, 'annotation_randomize_traces', False) or False,
      judge_name=db_workshop.judge_name or 'workshop_judge',
      input_jsonpath=getattr(db_workshop, 'input_jsonpath', None),
      output_jsonpath=getattr(db_workshop, 'output_jsonpath', None),
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

    workshop = self._workshop_from_db(db_workshop)

    self._set_cache(cache_key, workshop)
    return workshop

  def list_workshops(self, facilitator_id: Optional[str] = None) -> List[Workshop]:
    """List all workshops, optionally filtered by facilitator.
    
    Args:
        facilitator_id: If provided, only return workshops created by this facilitator
        
    Returns:
        List of Workshop objects sorted by creation date (newest first)
    """
    query = self.db.query(WorkshopDB)
    
    if facilitator_id:
      query = query.filter(WorkshopDB.facilitator_id == facilitator_id)
    
    # Order by creation date, newest first
    query = query.order_by(WorkshopDB.created_at.desc())
    
    db_workshops = query.all()
    return [self._workshop_from_db(w) for w in db_workshops]

  def get_workshops_for_user(self, user_id: str) -> List[Workshop]:
    """Get all workshops that a user is part of (either as facilitator or participant).
    
    Args:
        user_id: The user ID to find workshops for
        
    Returns:
        List of Workshop objects the user has access to
    """
    from server.database import UserDB, WorkshopDB
    
    # Get workshops where user is the facilitator
    facilitator_workshops = self.db.query(WorkshopDB).filter(
      WorkshopDB.facilitator_id == user_id
    ).all()
    
    # Get workshops where user has been added as a participant
    participant_workshop_ids = self.db.query(UserDB.workshop_id).filter(
      UserDB.id == user_id,
      UserDB.workshop_id.isnot(None)
    ).distinct().all()
    
    participant_workshop_ids = [w[0] for w in participant_workshop_ids if w[0]]
    
    participant_workshops = self.db.query(WorkshopDB).filter(
      WorkshopDB.id.in_(participant_workshop_ids)
    ).all() if participant_workshop_ids else []
    
    # Combine and deduplicate
    all_workshops = {w.id: w for w in facilitator_workshops}
    for w in participant_workshops:
      if w.id not in all_workshops:
        all_workshops[w.id] = w
    
    # Sort by creation date, newest first
    sorted_workshops = sorted(all_workshops.values(), key=lambda w: w.created_at or '', reverse=True)
    
    return [self._workshop_from_db(w) for w in sorted_workshops]

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

  def update_workshop_jsonpath_settings(
    self,
    workshop_id: str,
    input_jsonpath: Optional[str] = None,
    output_jsonpath: Optional[str] = None,
  ) -> Optional[Workshop]:
    """Update the JSONPath settings for trace display in a workshop.

    Args:
      workshop_id: The workshop ID
      input_jsonpath: JSONPath expression for extracting trace input display (or None to clear)
      output_jsonpath: JSONPath expression for extracting trace output display (or None to clear)

    Returns:
      Updated Workshop model or None if workshop not found
    """
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    # Update the JSONPath fields (empty string is treated same as None)
    db_workshop.input_jsonpath = input_jsonpath if input_jsonpath and input_jsonpath.strip() else None
    db_workshop.output_jsonpath = output_jsonpath if output_jsonpath and output_jsonpath.strip() else None

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

    return self._workshop_from_db(db_workshop)

  def update_active_annotation_traces(self, workshop_id: str, trace_ids: List[str]) -> Optional[Workshop]:
    """Update the active annotation trace IDs for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.active_annotation_trace_ids = trace_ids
    self.db.commit()
    self.db.refresh(db_workshop)

    return self._workshop_from_db(db_workshop)

  def update_discovery_randomize_setting(self, workshop_id: str, randomize: bool) -> Optional[Workshop]:
    """Update the discovery trace randomization setting for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.discovery_randomize_traces = randomize
    self.db.commit()
    self.db.refresh(db_workshop)

    return self._workshop_from_db(db_workshop)

  def update_annotation_randomize_setting(self, workshop_id: str, randomize: bool) -> Optional[Workshop]:
    """Update the annotation trace randomization setting for a workshop."""
    db_workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not db_workshop:
      return None

    db_workshop.annotation_randomize_traces = randomize
    self.db.commit()
    self.db.refresh(db_workshop)

    return self._workshop_from_db(db_workshop)

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
    """Get only the active discovery traces for a workshop.

    If randomization is enabled for the workshop, each user sees traces in a different 
    randomized order (deterministic per user based on user_id seed).
    If randomization is disabled (default), all users see traces in the same chronological order.

    Args:
        workshop_id: The workshop ID
        user_id: The user ID (required for personalized trace ordering when randomization is enabled)

    Returns:
        List of traces in appropriate order

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
    
    # Check if randomization is enabled for this workshop
    randomize_enabled = getattr(workshop, 'discovery_randomize_traces', False) or False

    if not randomize_enabled:
      # Randomization OFF: Return traces in chronological order (same for all users)
      # Fetch traces in the order they appear in active_discovery_trace_ids
      db_traces = self.db.query(TraceDB).filter(TraceDB.id.in_(active_trace_ids)).all()
      
      # Create ordered result - preserve the chronological order from active_discovery_trace_ids
      trace_map = {t.id: t for t in db_traces}
      result = []
      for tid in active_trace_ids:
        if tid in trace_map:
          result.append(self._trace_from_db(trace_map[tid]))

      # Log performance metrics
      load_time = time.time() - start_time
      if load_time > 0.1:
        print(f'⚠️ Slow trace load: {load_time:.3f}s for {len(result)} traces (user: {user_id[:8]}..., no randomization)')

      return result

    # Randomization ON: Get or create user-specific trace order
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
      print(f'⚠️ Slow trace load: {load_time:.3f}s for {len(result)} traces (user: {user_id[:8]}..., randomized)')

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
    """Get only the active annotation traces for a workshop.

    If randomization is enabled for the workshop, each user sees traces in a different 
    randomized order (deterministic per user based on user_id seed).
    If randomization is disabled (default), all users see traces in the same chronological order.

    Args:
        workshop_id: The workshop ID
        user_id: The user ID (required for personalized trace ordering when randomization is enabled)

    Returns:
        List of traces in appropriate order

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
    
    # Check if randomization is enabled for this workshop
    randomize_enabled = getattr(workshop, 'annotation_randomize_traces', False) or False

    if not randomize_enabled:
      # Randomization OFF: Return traces in chronological order (same for all users)
      # Fetch traces in the order they appear in active_annotation_trace_ids
      db_traces = self.db.query(TraceDB).filter(TraceDB.id.in_(active_trace_ids)).all()
      
      # Create ordered result - preserve the chronological order from active_annotation_trace_ids
      trace_map = {t.id: t for t in db_traces}
      result = []
      for tid in active_trace_ids:
        if tid in trace_map:
          result.append(self._trace_from_db(trace_map[tid]))

      # Log performance metrics
      load_time = time.time() - start_time
      if load_time > 0.1:
        print(f'⚠️ Slow annotation trace load: {load_time:.3f}s for {len(result)} traces (user: {user_id[:8]}..., no randomization)')

      return result

    # Randomization ON: Get or create user-specific trace order
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
      print(f'⚠️ Slow annotation trace load: {load_time:.3f}s for {len(result)} traces (user: {user_id[:8]}..., randomized)')

    return result

  # Discovery finding operations
  def add_finding(self, workshop_id: str, finding_data: DiscoveryFindingCreate) -> DiscoveryFinding:
    """Add or update a discovery finding (upsert) with automatic retry on failure.
    
    Retries are handled transparently in the backend - the frontend only sees
    success or failure after all retries are exhausted.
    
    Handles:
    - IntegrityError: Race conditions when multiple users save simultaneously
    - OperationalError: Database locked/busy (SQLite concurrent access)
    - General exceptions: Network issues, timeouts, etc.
    """
    from sqlalchemy.exc import IntegrityError, OperationalError
    import time
    
    finding_id = str(uuid.uuid4())
    max_retries = 3
    base_delay = 0.2  # Base delay in seconds
    
    logger.info(f"📝 add_finding called: workshop_id={workshop_id}, trace_id={finding_data.trace_id}, user_id={finding_data.user_id}")
    
    last_error = None
    for attempt in range(max_retries):
      try:
        # First, try to find existing record to preserve its ID
        # Use with_for_update() to lock the row and prevent race conditions
        existing_finding = self.db.query(DiscoveryFindingDB).filter(
          DiscoveryFindingDB.workshop_id == workshop_id,
          DiscoveryFindingDB.trace_id == finding_data.trace_id,
          DiscoveryFindingDB.user_id == finding_data.user_id
        ).with_for_update().first()
        
        if existing_finding:
          # Update existing finding
          logger.info(f"🔄 Updating existing finding: id={existing_finding.id}")
          existing_finding.insight = finding_data.insight
          self.db.commit()
          self.db.refresh(existing_finding)
          db_finding = existing_finding
          logger.info(f"✅ Finding updated successfully: id={db_finding.id}")
        else:
          # Create new finding
          logger.info(f"🆕 Creating new finding (attempt {attempt + 1}/{max_retries})")
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
          logger.info(f"✅ Finding created successfully: id={db_finding.id}")

        return DiscoveryFinding(
          id=db_finding.id,
          workshop_id=db_finding.workshop_id,
          trace_id=db_finding.trace_id,
          user_id=db_finding.user_id,
          insight=db_finding.insight,
          created_at=db_finding.created_at,
        )
        
      except IntegrityError as e:
        # Handle race condition - another request inserted the same record
        last_error = e
        logger.warning(f"⚠️ IntegrityError on finding save (attempt {attempt + 1}/{max_retries}): {e}")
        self.db.rollback()
        if attempt < max_retries - 1:
          delay = base_delay * (2 ** attempt)  # Exponential backoff: 0.2, 0.4, 0.8s
          logger.info(f"🔄 Retrying in {delay:.1f}s...")
          time.sleep(delay)
          continue
        else:
          # On final attempt, try to fetch and update the existing record
          logger.info("🔄 Final attempt: fetching existing finding to update")
          try:
            existing = self.db.query(DiscoveryFindingDB).filter(
              DiscoveryFindingDB.workshop_id == workshop_id,
              DiscoveryFindingDB.trace_id == finding_data.trace_id,
              DiscoveryFindingDB.user_id == finding_data.user_id
            ).first()
            if existing:
              existing.insight = finding_data.insight
              self.db.commit()
              self.db.refresh(existing)
              logger.info(f"✅ Finding updated after conflict: id={existing.id}")
              return DiscoveryFinding(
                id=existing.id,
                workshop_id=existing.workshop_id,
                trace_id=existing.trace_id,
                user_id=existing.user_id,
                insight=existing.insight,
                created_at=existing.created_at,
              )
          except Exception as final_error:
            logger.error(f"❌ Final recovery attempt also failed: {final_error}")
          logger.error(f"❌ Failed to save finding after all retries: {e}")
          raise e
          
      except OperationalError as e:
        # Handle database locked/busy errors (common with SQLite concurrent access)
        last_error = e
        error_msg = str(e).lower()
        if 'locked' in error_msg or 'busy' in error_msg:
          logger.warning(f"⚠️ Database locked/busy on finding save (attempt {attempt + 1}/{max_retries}): {e}")
        else:
          logger.warning(f"⚠️ OperationalError on finding save (attempt {attempt + 1}/{max_retries}): {e}")
        self.db.rollback()
        if attempt < max_retries - 1:
          delay = base_delay * (2 ** attempt) + 0.5  # Extra delay for database contention
          logger.info(f"🔄 Retrying in {delay:.1f}s...")
          time.sleep(delay)
          continue
        raise e
        
      except Exception as e:
        last_error = e
        logger.error(f"❌ Error saving finding (attempt {attempt + 1}/{max_retries}): {e}")
        self.db.rollback()
        if attempt < max_retries - 1:
          delay = base_delay * (2 ** attempt)
          logger.info(f"🔄 Retrying in {delay:.1f}s...")
          time.sleep(delay)
          continue
        raise e
    
    # This shouldn't be reached, but just in case
    logger.error(f"❌ Failed to save finding after all {max_retries} retries (loop exhausted)")
    raise last_error or Exception("Failed to save finding after all retries")

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
      # Update judge type fields
      if rubric_data.judge_type:
        existing_rubric.judge_type = rubric_data.judge_type
      if rubric_data.binary_labels:
        existing_rubric.binary_labels = rubric_data.binary_labels
      if rubric_data.rating_scale:
        existing_rubric.rating_scale = rubric_data.rating_scale
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
        judge_type=rubric_data.judge_type or 'likert',
        binary_labels=rubric_data.binary_labels,
        rating_scale=rubric_data.rating_scale or 5,
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

  def update_rubric_question(self, workshop_id: str, question_id: str, title: str, description: str, judge_type: Optional[str] = None) -> Optional[Rubric]:
    """Update a specific question in the rubric.

    Args:
        workshop_id: Workshop ID
        question_id: The ID of the question to update (e.g., "q_1", "q_2")
        title: New question title
        description: New question description
        judge_type: Optional judge type ('likert', 'binary', 'freeform')
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
        # Update judge_type if provided
        if judge_type:
          questions[i]['judge_type'] = judge_type
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
    """Parse the rubric question text into individual questions.
    
    Format: "title: description|||JUDGE_TYPE|||judgeType" separated by "|||QUESTION_SEPARATOR|||"
    """
    questions = []
    if not question_text:
      return questions

    # Use a special delimiter to separate questions (supports newlines within descriptions)
    QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'
    JUDGE_TYPE_DELIMITER = '|||JUDGE_TYPE|||'
    question_parts = question_text.split(QUESTION_DELIMITER)
    
    for i, part in enumerate(question_parts):
      part = part.strip()
      if not part:
        continue
      
      # Check if question has judge type embedded
      content = part
      judge_type = 'likert'  # default
      
      if JUDGE_TYPE_DELIMITER in part:
        content_part, type_part = part.split(JUDGE_TYPE_DELIMITER, 1)
        content = content_part.strip()
        parsed_type = type_part.strip()
        if parsed_type in ('likert', 'binary', 'freeform'):
          judge_type = parsed_type
        
      # Split only at the first colon to separate title from description
      if ':' in content:
        title, description = content.split(':', 1)
        questions.append({
          'id': f'q_{i + 1}', 
          'title': title.strip(), 
          'description': description.strip(),
          'judge_type': judge_type
        })

    return questions

  def _reconstruct_rubric_questions(self, questions: list) -> str:
    """Reconstruct individual questions into a single question text.
    
    Format: "title: description|||JUDGE_TYPE|||judgeType" separated by "|||QUESTION_SEPARATOR|||"
    """
    if not questions:
      return ''

    QUESTION_DELIMITER = '|||QUESTION_SEPARATOR|||'
    JUDGE_TYPE_DELIMITER = '|||JUDGE_TYPE|||'
    question_parts = []
    for i, question in enumerate(questions):
      # Update the ID to be sequential
      question['id'] = f'q_{i + 1}'
      judge_type = question.get('judge_type', 'likert')
      question_parts.append(f'{question["title"]}: {question["description"]}{JUDGE_TYPE_DELIMITER}{judge_type}')

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
      judge_type=db_rubric.judge_type or 'likert',
      binary_labels=db_rubric.binary_labels,
      rating_scale=db_rubric.rating_scale or 5,
    )

  # Annotation operations
  def add_annotation(self, workshop_id: str, annotation_data: AnnotationCreate) -> Annotation:
    """Add an annotation. If a duplicate exists, update the existing one."""
    logger.info(f"📝 add_annotation called: trace_id={annotation_data.trace_id}, user_id={annotation_data.user_id}, rating={annotation_data.rating}, ratings={annotation_data.ratings}")
    
    # Get rubric to determine judge type for validation
    rubric = self.get_rubric(workshop_id)
    default_judge_type = rubric.judge_type if rubric else 'likert'
    logger.info(f"🔍 Default judge type: {default_judge_type}")
    
    # Parse rubric questions to get per-question judge types
    # Frontend uses format: {rubric_id}_{index} (e.g., "1daa749b-d147-45e3-a667-fa3eca40269b_0")
    # Backend parses as: q_1, q_2, etc.
    # We need to match by index, not by ID
    question_judge_types_by_id = {}  # For direct ID matches (q_1, q_2, etc.)
    question_judge_types_by_index = {}  # For index-based matches (rubric_id_0, rubric_id_1, etc.)
    parsed_questions = []
    
    if rubric and rubric.question:
      parsed_questions = self._parse_rubric_questions(rubric.question)
      for index, question in enumerate(parsed_questions):
        question_id = question.get('id')  # e.g., "q_1"
        question_judge_type = question.get('judge_type', default_judge_type)
        
        # Store by backend ID (q_1, q_2, etc.)
        if question_id:
          question_judge_types_by_id[question_id] = question_judge_type
        
        # Store by index for frontend format matching
        question_judge_types_by_index[index] = question_judge_type
        
        # Also store by frontend format: {rubric_id}_{index}
        frontend_id = f"{rubric.id}_{index}"
        question_judge_types_by_id[frontend_id] = question_judge_type
      
      logger.info(f"📋 Question judge types by ID: {question_judge_types_by_id}")
      logger.info(f"📋 Question judge types by index: {question_judge_types_by_index}")
      logger.info(f"📋 Parsed {len(parsed_questions)} questions from rubric")
    
    # Validate and normalize ratings based on judge type
    validated_rating = None
    validated_ratings = None
    
    if annotation_data.rating is not None:
      validated_rating = self._validate_and_normalize_rating(annotation_data.rating, default_judge_type)
      logger.info(f"✅ Validated legacy rating: {annotation_data.rating} -> {validated_rating}")
    
    # Process ratings - handle both None and empty dict cases
    # Note: ratings can be None (not provided), {} (empty), or {'q1': 0} (with 0 values)
    if annotation_data.ratings is not None:
      validated_ratings = {}
      for question_id, rating_value in annotation_data.ratings.items():
        # Explicitly check for None (0 is a valid value, so we need to check is not None)
        if rating_value is not None:
          # Get judge type for this specific question
          # Try direct ID match first (works for both q_1 format and rubric_id_0 format)
          question_judge_type = question_judge_types_by_id.get(question_id)
          
          # If not found, try to extract index from frontend format (rubric_id_index)
          if question_judge_type is None and '_' in question_id:
            try:
              # Extract index from format like "1daa749b-d147-45e3-a667-fa3eca40269b_0"
              index_str = question_id.split('_')[-1]
              index = int(index_str)
              question_judge_type = question_judge_types_by_index.get(index)
            except (ValueError, IndexError):
              pass
          
          # Fallback to default if still not found
          if question_judge_type is None:
            question_judge_type = default_judge_type
            logger.warning(f"⚠️ Could not find judge type for question_id={question_id}, using default={default_judge_type}")
          
          logger.info(f"🔍 Validating {question_id} with judge_type={question_judge_type}, rating_value={rating_value}")
          # Validate the rating (including 0 for binary Fail)
          validated_value = self._validate_and_normalize_rating(rating_value, question_judge_type)
          # Only add if validation succeeded (returns a number, including 0)
          # Note: 0 is a valid value, so we check is not None (0 is not None)
          if validated_value is not None:
            validated_ratings[question_id] = validated_value
            logger.info(f"✅ Validated rating for {question_id}: {rating_value} -> {validated_value} (judge_type={question_judge_type})")
          else:
            logger.error(f"❌ Validation returned None for {question_id}: rating_value={rating_value}, judge_type={question_judge_type}")
            # For debugging: try to understand why validation failed
            logger.error(f"   rating_value type: {type(rating_value)}, value: {repr(rating_value)}")
        else:
          # rating_value is None - skip this question
          logger.debug(f"⏭️ Skipping {question_id}: rating_value is None")
      logger.info(f"📊 Final validated_ratings: {validated_ratings}")
    
    # Check if annotation already exists for this user and trace
    # Use retry logic to handle concurrent write conflicts transparently
    # Retries are automatic and invisible to the frontend
    from sqlalchemy.exc import IntegrityError, OperationalError
    import time
    
    max_retries = 3
    base_delay = 0.2  # Base delay in seconds
    annotation_id = str(uuid.uuid4())
    
    last_error = None
    for attempt in range(max_retries):
      try:
        existing_annotation = (
          self.db.query(AnnotationDB)
          .filter(AnnotationDB.user_id == annotation_data.user_id, AnnotationDB.trace_id == annotation_data.trace_id)
          .with_for_update()  # Lock the row if it exists
          .first()
        )

        if existing_annotation:
          logger.info(f"🔄 Updating existing annotation: id={existing_annotation.id}, current ratings={existing_annotation.ratings}")
          # Update existing annotation - only update fields that are provided
          if validated_rating is not None:
            existing_annotation.rating = validated_rating
            logger.info(f"  → Updated rating: {validated_rating}")
          # Always update ratings if provided and validated
          # validated_ratings will be None if ratings was not provided, or a dict if it was
          if annotation_data.ratings is not None and validated_ratings is not None:
            # Only update if we have validated ratings
            # Note: validated_ratings can be {} if all validations failed, but we still update to clear
            # However, if we received ratings but got empty dict, log a warning
            if len(validated_ratings) == 0 and len(annotation_data.ratings) > 0:
              logger.warning(f"⚠️ All ratings failed validation! Received: {annotation_data.ratings}, but validated_ratings is empty")
              logger.warning(f"⚠️ Not updating ratings to avoid clearing existing data")
            else:
              existing_annotation.ratings = validated_ratings
              logger.info(f"  → Updated ratings: {existing_annotation.ratings}")
          elif annotation_data.ratings is not None:
            # Ratings were provided but validation failed completely - log error
            logger.error(f"❌ Ratings provided but validation failed completely: {annotation_data.ratings}")
          if annotation_data.comment is not None:
            existing_annotation.comment = annotation_data.comment
            logger.info("  → Updated comment")
          self.db.commit()
          self.db.refresh(existing_annotation)
          logger.info(f"✅ Annotation updated in DB: id={existing_annotation.id}, ratings={existing_annotation.ratings}")
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
          logger.info(f"🆕 Creating new annotation (attempt {attempt + 1}/{max_retries})")
          db_annotation = AnnotationDB(
            id=annotation_id,
            workshop_id=workshop_id,
            trace_id=annotation_data.trace_id,
            user_id=annotation_data.user_id,
            rating=validated_rating,
            ratings=validated_ratings,
            comment=annotation_data.comment,
          )
          logger.info(f"📝 New annotation object: rating={validated_rating}, ratings={validated_ratings}")
          self.db.add(db_annotation)
          self.db.commit()
          self.db.refresh(db_annotation)
          logger.info(f"✅ Annotation created in DB: id={db_annotation.id}, ratings={db_annotation.ratings}")
          self._sync_annotation_with_mlflow(workshop_id, db_annotation)

          return Annotation(
            id=db_annotation.id,
            workshop_id=db_annotation.workshop_id,
            trace_id=db_annotation.trace_id,
            user_id=db_annotation.user_id,
            rating=db_annotation.rating,
            ratings=db_annotation.ratings,
            comment=db_annotation.comment,
            mlflow_trace_id=db_annotation.trace.mlflow_trace_id if db_annotation.trace else None,
            created_at=db_annotation.created_at,
          )
            
      except IntegrityError as e:
        # Handle race condition - another request inserted the same record
        last_error = e
        logger.warning(f"⚠️ IntegrityError on annotation save (attempt {attempt + 1}/{max_retries}): {e}")
        self.db.rollback()
        if attempt < max_retries - 1:
          delay = base_delay * (2 ** attempt)  # Exponential backoff: 0.2, 0.4, 0.8s
          logger.info(f"🔄 Retrying in {delay:.1f}s...")
          time.sleep(delay)
          continue
        else:
          # On final attempt, try to fetch and update the existing record
          logger.info("🔄 Final attempt: fetching existing annotation to update")
          try:
            existing = self.db.query(AnnotationDB).filter(
              AnnotationDB.user_id == annotation_data.user_id,
              AnnotationDB.trace_id == annotation_data.trace_id
            ).first()
            if existing:
              if validated_rating is not None:
                existing.rating = validated_rating
              if validated_ratings is not None:
                existing.ratings = validated_ratings
              if annotation_data.comment is not None:
                existing.comment = annotation_data.comment
              self.db.commit()
              self.db.refresh(existing)
              logger.info(f"✅ Annotation updated after conflict: id={existing.id}")
              self._sync_annotation_with_mlflow(workshop_id, existing)
              return Annotation(
                id=existing.id,
                workshop_id=existing.workshop_id,
                trace_id=existing.trace_id,
                user_id=existing.user_id,
                rating=existing.rating,
                ratings=existing.ratings,
                comment=existing.comment,
                mlflow_trace_id=existing.trace.mlflow_trace_id if existing.trace else None,
                created_at=existing.created_at,
              )
          except Exception as final_error:
            logger.error(f"❌ Final recovery attempt also failed: {final_error}")
          raise e
          
      except OperationalError as e:
        # Handle database locked/busy errors (common with SQLite concurrent access)
        last_error = e
        error_msg = str(e).lower()
        if 'locked' in error_msg or 'busy' in error_msg:
          logger.warning(f"⚠️ Database locked/busy on annotation save (attempt {attempt + 1}/{max_retries}): {e}")
        else:
          logger.warning(f"⚠️ OperationalError on annotation save (attempt {attempt + 1}/{max_retries}): {e}")
        self.db.rollback()
        if attempt < max_retries - 1:
          delay = base_delay * (2 ** attempt) + 0.5  # Extra delay for database contention
          logger.info(f"🔄 Retrying in {delay:.1f}s...")
          time.sleep(delay)
          continue
        raise e
        
      except Exception as e:
        last_error = e
        logger.error(f"❌ Error saving annotation (attempt {attempt + 1}/{max_retries}): {e}")
        self.db.rollback()
        if attempt < max_retries - 1:
          delay = base_delay * (2 ** attempt)
          logger.info(f"🔄 Retrying in {delay:.1f}s...")
          time.sleep(delay)
          continue
        raise e
    
    # This shouldn't be reached, but just in case
    logger.error(f"❌ Failed to save annotation after all {max_retries} retries (loop exhausted)")
    raise last_error or Exception("Failed to save annotation after all retries")

  def _validate_and_normalize_rating(self, rating: any, judge_type: str) -> Optional[int]:
    """Validate and normalize a rating based on judge type.
    
    Returns:
      - For binary: 0 or 1 (normalizes any truthy value to 1, falsy to 0)
      - For Likert: 1-5 (clamps to valid range)
      - None if rating is invalid
    """
    logger.debug(f"🔍 _validate_and_normalize_rating: rating={rating} (type={type(rating)}), judge_type={judge_type}")
    
    if rating is None:
      logger.debug("  → Rating is None, returning None")
      return None
    
    # Convert to int if possible
    try:
      rating_int = int(float(rating))
      logger.debug(f"  → Converted to int: {rating_int}")
    except (ValueError, TypeError) as e:
      logger.warning(f"  → Failed to convert to int: {e}")
      return None
    
    if judge_type == 'binary':
      # Binary: only 0 or 1 are valid
      if rating_int == 0:
        logger.debug(f"  → Binary rating 0 (Fail) - returning 0")
        return 0
      elif rating_int == 1:
        logger.debug(f"  → Binary rating 1 (Pass) - returning 1")
        return 1
      else:
        # Normalize: any non-zero becomes 1, but log a warning
        logger.warning(f"Invalid binary rating {rating_int}, normalizing to 1")
        return 1
    else:
      # Likert: 1-5 are valid
      if 1 <= rating_int <= 5:
        return rating_int
      else:
        # Clamp to valid range
        clamped = max(1, min(5, rating_int))
        logger.warning(f"Invalid Likert rating {rating_int}, clamping to {clamped}")
        return clamped

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

  def update_user_role_in_workshop(self, workshop_id: str, user_id: str, new_role: str) -> Optional[User]:
    """Update a user's role in a workshop (SME <-> Participant)."""
    from server.models import UserRole
    
    # Update the workshop participant record
    db_participant = (
      self.db.query(WorkshopParticipantDB)
      .filter(and_(WorkshopParticipantDB.workshop_id == workshop_id, WorkshopParticipantDB.user_id == user_id))
      .first()
    )
    
    if db_participant:
      # Map string to UserRole enum
      role_enum = UserRole.SME if new_role == 'sme' else UserRole.PARTICIPANT
      db_participant.role = role_enum
    
    # Also update the user's global role
    db_user = self.db.query(UserDB).filter(UserDB.id == user_id).first()
    if db_user:
      role_enum = UserRole.SME if new_role == 'sme' else UserRole.PARTICIPANT
      db_user.role = role_enum
      
    self.db.commit()
    
    # Return updated user
    return self.get_user(user_id)

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

    # Get rubric to validate ratings if available
    rubric = None
    if evaluations:
      rubric = self.get_rubric(evaluations[0].workshop_id)
    
    # Detect judge type: parse questions first (more accurate), then fall back to rubric-level judge_type
    judge_type_str = 'likert'  # Default
    if rubric:
      # First, try to parse rubric questions to get per-question judge types
      if rubric.question:
        try:
          questions = self._parse_rubric_questions(rubric.question)
          if questions:
            # Check if any question is binary
            binary_questions = [q for q in questions if q.get('judge_type') == 'binary']
            likert_questions = [q for q in questions if q.get('judge_type') == 'likert']
            
            if binary_questions and not likert_questions:
              # All questions are binary
              judge_type_str = 'binary'
              logger.info(f"Detected binary judge type from rubric questions ({len(binary_questions)} binary questions) for evaluation validation")
            elif likert_questions and not binary_questions:
              # All questions are likert
              judge_type_str = 'likert'
            elif binary_questions:
              # Mixed - but if we have binary questions, prefer binary
              judge_type_str = 'binary'
              logger.info(f"Detected binary judge type from rubric questions (mixed types, {len(binary_questions)} binary questions) for evaluation validation")
        except Exception as parse_error:
          logger.warning(f"Could not parse rubric questions for judge type detection: {parse_error}")
      
      # Fallback to rubric-level judge_type if no questions parsed or all questions are likert
      if judge_type_str == 'likert' and hasattr(rubric, 'judge_type') and rubric.judge_type:
        judge_type_enum = rubric.judge_type
        if isinstance(judge_type_enum, JudgeType):
          judge_type_str = judge_type_enum.value
        else:
          judge_type_str = str(judge_type_enum)
    
    is_binary = judge_type_str == 'binary'
    logger.info(f"Judge type for evaluation validation: {judge_type_str}, is_binary={is_binary}")

    # Add new evaluations with validation
    for evaluation in evaluations:
      # Validate and normalize predicted_rating based on judge type
      validated_predicted_rating = evaluation.predicted_rating
      if validated_predicted_rating is not None:
        if is_binary:
          # Binary: only 0 or 1 are valid - reject anything else
          if validated_predicted_rating == 0:
            validated_predicted_rating = 0.0
          elif validated_predicted_rating == 1:
            validated_predicted_rating = 1.0
          else:
            # Reject invalid binary values - set to None
            original_value = validated_predicted_rating
            validated_predicted_rating = None
            logger.error(f"Invalid binary predicted_rating {original_value} for trace {evaluation.trace_id[:8]}... - must be 0 or 1, rejecting evaluation")
        else:
          # Likert: clamp to 1-5 range
          if not (1 <= validated_predicted_rating <= 5):
            original_value = validated_predicted_rating
            validated_predicted_rating = max(1.0, min(5.0, validated_predicted_rating))
            logger.warning(f"Likert predicted_rating {original_value} out of range for trace {evaluation.trace_id[:8]}... - clamped to {validated_predicted_rating}")
      
      db_evaluation = JudgeEvaluationDB(
        id=evaluation.id,
        workshop_id=evaluation.workshop_id,
        prompt_id=evaluation.prompt_id,
        trace_id=evaluation.trace_id,
        predicted_rating=validated_predicted_rating,
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

  def delete_all_traces(self, workshop_id: str) -> int:
    """Delete all traces for a workshop and reset to intake phase.
    
    Returns the number of traces deleted.
    """
    # Import all related models
    from server.database import (
      AnnotationDB, UserTraceOrderDB, RubricDB, MLflowIntakeConfigDB,
      DiscoveryFindingDB, UserDiscoveryCompletionDB, JudgePromptDB, JudgeEvaluationDB
    )
    
    # Get trace IDs first
    trace_ids = [t.id for t in self.db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id).all()]
    
    if trace_ids:
      # Delete annotations for these traces
      self.db.query(AnnotationDB).filter(AnnotationDB.trace_id.in_(trace_ids)).delete(synchronize_session=False)
      # Delete judge evaluations for these traces
      self.db.query(JudgeEvaluationDB).filter(JudgeEvaluationDB.trace_id.in_(trace_ids)).delete(synchronize_session=False)
    
    # Delete user trace orders for this workshop
    self.db.query(UserTraceOrderDB).filter(UserTraceOrderDB.workshop_id == workshop_id).delete(synchronize_session=False)
    
    # Delete discovery findings for this workshop
    self.db.query(DiscoveryFindingDB).filter(DiscoveryFindingDB.workshop_id == workshop_id).delete(synchronize_session=False)
    
    # Delete user discovery completions for this workshop
    self.db.query(UserDiscoveryCompletionDB).filter(UserDiscoveryCompletionDB.workshop_id == workshop_id).delete(synchronize_session=False)
    
    # Delete judge prompts for this workshop (after evaluations are deleted)
    self.db.query(JudgePromptDB).filter(JudgePromptDB.workshop_id == workshop_id).delete(synchronize_session=False)
    
    # Delete all traces
    deleted_count = self.db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id).delete(synchronize_session=False)
    
    # Delete rubric for this workshop
    self.db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).delete(synchronize_session=False)
    
    # Reset MLflow intake status (trace_count and is_ingested)
    mlflow_config = self.db.query(MLflowIntakeConfigDB).filter(MLflowIntakeConfigDB.workshop_id == workshop_id).first()
    if mlflow_config:
      mlflow_config.trace_count = 0
      mlflow_config.is_ingested = False
      mlflow_config.last_ingestion_time = None
    
    # Reset workshop to intake phase
    workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if workshop:
      workshop.current_phase = WorkshopPhase.INTAKE
      workshop.completed_phases = []
      workshop.discovery_started = False
      workshop.annotation_started = False
      workshop.active_discovery_trace_ids = None
      workshop.active_annotation_trace_ids = None
    
    self.db.commit()
    return deleted_count

  def reset_workshop_to_discovery(self, workshop_id: str) -> Optional[Workshop]:
    """Reset a workshop back to the discovery start page (before discovery was started).
    
    This allows changing the discovery configuration (e.g., number of traces).
    The phase stays as DISCOVERY but discovery_started is set to False,
    which causes the UI to show the Discovery Start Page.
    
    IMPORTANT: This also clears all discovery-related data so participants start fresh:
    - Discovery findings (participant responses)
    - User trace orders (personalized trace lists)
    - User discovery completions (who completed discovery)
    
    Returns the updated workshop or None if not found.
    """
    workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not workshop:
      return None
    
    # Clear all discovery-related data so participants start fresh
    # 1. Clear discovery findings (participant responses)
    self.db.query(DiscoveryFindingDB).filter(
      DiscoveryFindingDB.workshop_id == workshop_id
    ).delete(synchronize_session=False)
    
    # 2. Clear user trace orders (personalized trace lists)
    self.db.query(UserTraceOrderDB).filter(
      UserTraceOrderDB.workshop_id == workshop_id
    ).delete(synchronize_session=False)
    
    # 3. Clear user discovery completions (who completed discovery)
    self.db.query(UserDiscoveryCompletionDB).filter(
      UserDiscoveryCompletionDB.workshop_id == workshop_id
    ).delete(synchronize_session=False)
    
    # Keep phase as DISCOVERY but mark discovery as NOT started
    # This causes the UI to show the Discovery Start Page
    workshop.current_phase = WorkshopPhase.DISCOVERY
    workshop.discovery_started = False
    
    # Keep completed phases up to intake (discovery not yet complete)
    completed = workshop.completed_phases or []
    workshop.completed_phases = [p for p in completed if p in ['intake']]
    
    # Clear active discovery trace list so new selection can be made
    workshop.active_discovery_trace_ids = None
    
    self.db.commit()
    self.db.refresh(workshop)
    
    return Workshop(
      id=workshop.id,
      name=workshop.name,
      description=workshop.description,
      facilitator_id=workshop.facilitator_id,
      status=workshop.status,
      current_phase=workshop.current_phase,
      completed_phases=workshop.completed_phases or [],
      discovery_started=workshop.discovery_started or False,
      annotation_started=workshop.annotation_started or False,
      active_discovery_trace_ids=workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=workshop.active_annotation_trace_ids or [],
      created_at=workshop.created_at,
    )

  def reset_workshop_to_annotation(self, workshop_id: str) -> Optional[Workshop]:
    """Reset a workshop back to the annotation start page (before annotation was started).
    
    This allows changing the annotation configuration (e.g., trace selection, randomization).
    The phase stays as ANNOTATION but annotation_started is set to False,
    which causes the UI to show the Annotation Start Page.
    
    IMPORTANT: This clears all annotation-related data so SMEs start fresh:
    - All annotations submitted by SMEs
    
    Traces are kept, but SMEs will start fresh from the beginning.
    
    Returns the updated workshop or None if not found.
    """
    workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not workshop:
      return None
    
    # Clear all annotation-related data so SMEs start fresh
    # Clear annotations submitted by SMEs
    self.db.query(AnnotationDB).filter(
      AnnotationDB.workshop_id == workshop_id
    ).delete(synchronize_session=False)
    
    # Keep phase as ANNOTATION but mark annotation as NOT started
    # This causes the UI to show the Annotation Start Page
    workshop.current_phase = WorkshopPhase.ANNOTATION
    workshop.annotation_started = False
    
    # Keep completed phases up to discovery (annotation not yet complete)
    completed = workshop.completed_phases or []
    workshop.completed_phases = [p for p in completed if p in ['intake', 'discovery']]
    
    # Clear active annotation trace list so new selection can be made
    workshop.active_annotation_trace_ids = None
    
    self.db.commit()
    self.db.refresh(workshop)
    
    return Workshop(
      id=workshop.id,
      name=workshop.name,
      description=workshop.description,
      facilitator_id=workshop.facilitator_id,
      status=workshop.status,
      current_phase=workshop.current_phase,
      completed_phases=workshop.completed_phases or [],
      discovery_started=workshop.discovery_started or False,
      annotation_started=workshop.annotation_started or False,
      active_discovery_trace_ids=workshop.active_discovery_trace_ids or [],
      active_annotation_trace_ids=workshop.active_annotation_trace_ids or [],
      created_at=workshop.created_at,
    )
