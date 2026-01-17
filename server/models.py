# ruff: noqa: D101

"""Data models for the workshop application."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WorkshopStatus(str, Enum):
  ACTIVE = 'active'
  COMPLETED = 'completed'
  CANCELLED = 'cancelled'


class WorkshopPhase(str, Enum):
  INTAKE = 'intake'
  DISCOVERY = 'discovery'
  RUBRIC = 'rubric'
  ANNOTATION = 'annotation'
  RESULTS = 'results'
  JUDGE_TUNING = 'judge_tuning'
  UNITY_VOLUME = 'unity_volume'


class UserRole(str, Enum):
  FACILITATOR = 'facilitator'
  SME = 'sme'  # Subject Matter Expert
  PARTICIPANT = 'participant'


class UserStatus(str, Enum):
  ACTIVE = 'active'
  INACTIVE = 'inactive'
  PENDING = 'pending'


class JudgeType(str, Enum):
  """Type of judge evaluation."""
  LIKERT = 'likert'       # Likert scale rubric-based scoring (1-5 scale)
  BINARY = 'binary'       # Pass/Fail or Yes/No evaluation
  FREEFORM = 'freeform'   # Free-form feedback without structured ratings


# User Models
class UserCreate(BaseModel):
  email: str
  name: str
  role: UserRole
  workshop_id: str
  password: Optional[str] = None  # Optional for backward compatibility


class UserLogin(BaseModel):
  email: str
  password: str
  workshop_id: Optional[str] = None  # Required for participants/SMEs to validate access


class User(BaseModel):
  id: str
  email: str
  name: str
  role: UserRole
  workshop_id: str
  status: UserStatus = UserStatus.ACTIVE
  created_at: datetime = Field(default_factory=datetime.now)
  last_active: Optional[datetime] = None
  password_hash: Optional[str] = None  # For internal use only


class UserPermissions(BaseModel):
  can_view_discovery: bool = True
  can_create_findings: bool = True
  can_view_all_findings: bool = False
  can_create_rubric: bool = False
  can_view_rubric: bool = True
  can_annotate: bool = True
  can_view_all_annotations: bool = False
  can_view_results: bool = True
  can_manage_workshop: bool = False
  can_assign_annotations: bool = False

  @classmethod
  def for_role(cls, role: UserRole) -> 'UserPermissions':
    """Get permissions for a specific role."""
    if role == UserRole.FACILITATOR:
      return cls(
        can_view_discovery=True,
        can_create_findings=False,  # Facilitators do NOT participate in discovery - monitor only
        can_view_all_findings=True,  # Facilitators can see all findings for monitoring
        can_create_rubric=True,  # ONLY facilitators create rubrics
        can_view_rubric=True,
        can_annotate=False,  # Facilitators do NOT annotate
        can_view_all_annotations=True,  # Facilitators can see all annotations for monitoring
        can_view_results=True,  # ONLY facilitators view IRR results
        can_manage_workshop=True,
        can_assign_annotations=True,
      )
    elif role == UserRole.SME:
      return cls(
        can_view_discovery=True,
        can_create_findings=True,
        can_view_all_findings=False,  # SMEs can only see their own findings
        can_create_rubric=False,  # SMEs do NOT create rubrics
        can_view_rubric=False,  # SMEs cannot view rubric - facilitator shares screen
        can_annotate=True,  # SMEs can annotate
        can_view_all_annotations=False,  # SMEs can only see their own annotations
        can_view_results=False,  # SMEs do NOT view IRR results
        can_manage_workshop=False,
        can_assign_annotations=False,
      )
    else:  # PARTICIPANT
      return cls(
        can_view_discovery=True,
        can_create_findings=True,
        can_view_all_findings=False,  # Participants can only see their own findings
        can_create_rubric=False,  # Participants do NOT create rubrics
        can_view_rubric=False,  # Participants cannot view rubric - facilitator shares screen
        can_annotate=True,  # Participants CAN annotate (corrected)
        can_view_all_annotations=False,  # Participants can only see their own annotations
        can_view_results=False,  # Participants do NOT view IRR results
        can_manage_workshop=False,
        can_assign_annotations=False,
      )


class WorkshopParticipant(BaseModel):
  user_id: str
  workshop_id: str
  role: UserRole
  assigned_traces: List[str] = Field(default_factory=list)
  annotation_quota: Optional[int] = None
  joined_at: datetime = Field(default_factory=datetime.now)


# Request/Response Models
class WorkshopCreate(BaseModel):
  name: str
  description: Optional[str] = None
  facilitator_id: str


class Workshop(BaseModel):
  id: str
  name: str
  description: Optional[str] = None
  facilitator_id: str
  status: WorkshopStatus = WorkshopStatus.ACTIVE
  current_phase: WorkshopPhase = WorkshopPhase.INTAKE
  completed_phases: List[str] = Field(default_factory=list)
  discovery_started: bool = False
  annotation_started: bool = False
  active_discovery_trace_ids: List[str] = Field(default_factory=list)
  active_annotation_trace_ids: List[str] = Field(default_factory=list)
  discovery_randomize_traces: bool = False  # Whether to randomize trace order in discovery
  annotation_randomize_traces: bool = False  # Whether to randomize trace order in annotation
  judge_name: str = 'workshop_judge'  # Name used for MLflow feedback entries
  created_at: datetime = Field(default_factory=datetime.now)


class TraceUpload(BaseModel):
  input: str
  output: str
  context: Optional[Dict[str, Any]] = None
  trace_metadata: Optional[Dict[str, Any]] = None  # Renamed from metadata
  mlflow_trace_id: Optional[str] = None
  mlflow_url: Optional[str] = None
  mlflow_host: Optional[str] = None
  mlflow_experiment_id: Optional[str] = None


class Trace(BaseModel):
  id: str
  workshop_id: str
  input: str
  output: str
  context: Optional[Dict[str, Any]] = None
  trace_metadata: Optional[Dict[str, Any]] = None  # Renamed from metadata
  mlflow_trace_id: Optional[str] = None
  mlflow_url: Optional[str] = None
  mlflow_host: Optional[str] = None
  mlflow_experiment_id: Optional[str] = None
  include_in_alignment: bool = True  # Whether to include in judge alignment
  sme_feedback: Optional[str] = None  # Concatenated SME feedback for alignment
  created_at: datetime = Field(default_factory=datetime.now)


class DiscoveryFindingCreate(BaseModel):
  trace_id: str
  user_id: str
  insight: str


class DiscoveryFinding(BaseModel):
  id: str
  workshop_id: str
  trace_id: str
  user_id: str
  insight: str
  created_at: datetime = Field(default_factory=datetime.now)


class RubricCreate(BaseModel):
  question: str
  created_by: str
  judge_type: Optional[JudgeType] = Field(default=JudgeType.LIKERT, description='Type of judge: likert, binary, or freeform')
  binary_labels: Optional[Dict[str, str]] = Field(default=None, description='Custom labels for binary judge')
  rating_scale: Optional[int] = Field(default=5, description='Rating scale for rubric judge')


class Rubric(BaseModel):
  id: str
  workshop_id: str
  question: str
  judge_type: JudgeType = Field(default=JudgeType.LIKERT)
  binary_labels: Optional[Dict[str, str]] = None
  rating_scale: int = 5
  created_by: str
  created_at: datetime = Field(default_factory=datetime.now)


class AnnotationCreate(BaseModel):
  trace_id: str
  user_id: str
  rating: int = Field(..., ge=1, le=5)  # Legacy: single rating (for backward compatibility)
  ratings: Optional[Dict[str, int]] = None  # New: multiple ratings as {"question_id": rating}
  comment: Optional[str] = None


class Annotation(BaseModel):
  id: str
  workshop_id: str
  trace_id: str
  user_id: str
  rating: int = Field(..., ge=1, le=5)  # Legacy: single rating (for backward compatibility)
  ratings: Optional[Dict[str, int]] = None  # New: multiple ratings as {"question_id": rating}
  comment: Optional[str] = None
  mlflow_trace_id: Optional[str] = None
  created_at: datetime = Field(default_factory=datetime.now)


class IRRResult(BaseModel):
  workshop_id: str
  score: float
  ready_to_proceed: bool
  calculated_at: datetime = Field(default_factory=datetime.now)
  details: Optional[Dict[str, Any]] = None


# Note: Database storage is now handled by DatabaseService
# This file now only contains Pydantic models for API requests/responses


# MLflow Intake Models
class MLflowIntakeConfig(BaseModel):
  """Configuration for MLflow trace intake."""

  databricks_host: str = Field(..., description='Databricks workspace host URL')
  databricks_token: str = Field(..., description='Databricks access token')
  experiment_id: str = Field(..., description='MLflow experiment ID to pull traces from')
  max_traces: Optional[int] = Field(100, description='Maximum number of traces to pull')
  filter_string: Optional[str] = Field(None, description='Optional filter string for traces')


class MLflowIntakeConfigCreate(BaseModel):
  """Request model for creating MLflow intake configuration."""

  databricks_host: str = Field(..., description='Databricks workspace host URL')
  databricks_token: str = Field(..., description='Databricks access token')
  experiment_id: str = Field(..., description='MLflow experiment ID to pull traces from')
  max_traces: Optional[int] = Field(100, description='Maximum number of traces to pull')
  filter_string: Optional[str] = Field(None, description='Optional filter string for traces')


class MLflowIntakeStatus(BaseModel):
  """Status of MLflow intake process."""

  workshop_id: str
  is_configured: bool = False
  is_ingested: bool = False
  trace_count: int = 0
  last_ingestion_time: Optional[datetime] = None
  error_message: Optional[str] = None
  config: Optional[MLflowIntakeConfig] = None


class MLflowTraceInfo(BaseModel):
  """Information about an MLflow trace."""

  trace_id: str
  request_preview: str
  response_preview: str
  execution_time_ms: Optional[int] = None
  status: str
  timestamp_ms: int
  tags: Optional[Dict[str, str]] = None
  mlflow_url: Optional[str] = None


# Judge Tuning Models
class JudgePromptCreate(BaseModel):
  """Request model for creating a judge prompt."""

  prompt_text: str = Field(..., description='The judge prompt text')
  judge_type: JudgeType = Field(default=JudgeType.LIKERT, description='Type of judge: likert, binary, or freeform')
  few_shot_examples: Optional[List[str]] = Field(default=[], description='Selected few-shot example trace IDs')
  model_name: Optional[str] = Field(default='demo', description='Model to use: demo, databricks-dbrx-instruct, openai-gpt-4, etc.')
  model_parameters: Optional[Dict[str, Any]] = Field(default=None, description='Model parameters like temperature')
  # Binary judge specific config
  binary_labels: Optional[Dict[str, str]] = Field(default=None, description='Custom labels for binary judge, e.g. {"pass": "Pass", "fail": "Fail"}')
  # Rubric judge specific config  
  rating_scale: Optional[int] = Field(default=5, description='Rating scale for rubric judge (default 5-point)')


class JudgePrompt(BaseModel):
  """Judge prompt model."""

  id: str
  workshop_id: str
  prompt_text: str
  judge_type: JudgeType = Field(default=JudgeType.LIKERT)
  version: int
  few_shot_examples: List[str] = Field(default=[])
  model_name: str = Field(default='demo')
  model_parameters: Optional[Dict[str, Any]] = None
  binary_labels: Optional[Dict[str, str]] = None
  rating_scale: Optional[int] = 5
  created_by: str
  created_at: datetime = Field(default_factory=datetime.now)
  performance_metrics: Optional[Dict[str, Any]] = None


class JudgeEvaluation(BaseModel):
  """Judge evaluation result for a single trace."""

  id: str
  workshop_id: str
  prompt_id: str
  trace_id: str
  # For rubric judges (1-5 scale)
  predicted_rating: Optional[int] = None
  human_rating: Optional[int] = None
  # For binary judges (pass/fail)
  predicted_binary: Optional[bool] = None
  human_binary: Optional[bool] = None
  # For freeform judges (text feedback)
  predicted_feedback: Optional[str] = None
  human_feedback: Optional[str] = None
  # Common fields
  confidence: Optional[float] = None
  reasoning: Optional[str] = None


class JudgeEvaluationRequest(BaseModel):
  """Request model for evaluating a judge prompt."""

  prompt_id: str
  trace_ids: Optional[List[str]] = Field(None, description='Specific traces to evaluate, or None for all')
  override_model: Optional[str] = Field(None, description="Override model selection from UI (e.g., 'demo' to force simulation)")


class JudgeEvaluationDirectRequest(BaseModel):
  """Request model for evaluating a judge prompt without saving it."""

  prompt_text: str
  model_name: str = 'demo'
  model_parameters: Optional[Dict[str, Any]] = None
  trace_ids: Optional[List[str]] = Field(None, description='Specific traces to evaluate, or None for all')


class JudgePerformanceMetrics(BaseModel):
  """Performance metrics for a judge prompt."""

  prompt_id: str
  correlation: float
  accuracy: float
  mean_absolute_error: float
  agreement_by_rating: Dict[str, float]
  confusion_matrix: List[List[int]]
  total_evaluations: int


class JudgeEvaluationResult(BaseModel):
  """Result from direct evaluation including both metrics and individual evaluations."""

  metrics: JudgePerformanceMetrics
  evaluations: List[JudgeEvaluation]


class JudgeExportConfig(BaseModel):
  """Configuration for exporting a judge."""

  prompt_id: str
  export_format: str = Field(default='json', description='Export format: json, python, or api')
  include_examples: bool = Field(default=True, description='Include few-shot examples in export')


# DBSQL Export Models
class DBSQLExportRequest(BaseModel):
  """Request model for DBSQL export operations."""

  databricks_host: str = Field(..., description='Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com)')
  databricks_token: str = Field(..., description='Databricks access token for DBSQL authentication')
  http_path: str = Field(..., description='DBSQL warehouse HTTP path (e.g., /sql/1.0/warehouses/xxxxxx)')
  catalog: str = Field(..., description='Unity Catalog catalog name')
  schema_name: str = Field(..., description='Unity Catalog schema name')


class DBSQLExportResponse(BaseModel):
  """Response model for DBSQL export operations."""

  success: bool = Field(..., description='Whether the export was successful')
  message: str = Field(..., description='Human-readable message about the export')
  tables_exported: Optional[List[Dict[str, Any]]] = Field(None, description='List of exported tables')
  total_rows: Optional[int] = Field(None, description='Total number of rows exported')
  errors: Optional[List[str]] = Field(None, description='List of errors encountered during export')


# User Trace Order Models
class UserTraceOrderCreate(BaseModel):
  """Model for creating user trace order."""

  user_id: str
  workshop_id: str
  discovery_traces: List[str] = Field(default_factory=list)
  annotation_traces: List[str] = Field(default_factory=list)


class UserTraceOrder(BaseModel):
  """Model for user-specific trace orderings."""

  id: str
  user_id: str
  workshop_id: str
  discovery_traces: List[str] = Field(default_factory=list)
  annotation_traces: List[str] = Field(default_factory=list)
  created_at: datetime
  updated_at: datetime


# Authentication Models
class FacilitatorConfig(BaseModel):
  """Configuration for pre-configured facilitators."""

  email: str
  password_hash: str
  name: str
  description: Optional[str] = None
  created_at: datetime = Field(default_factory=datetime.now)


class FacilitatorConfigCreate(BaseModel):
  """Request model for creating facilitator configuration."""

  email: str
  password: str
  name: str
  description: Optional[str] = None


class AuthResponse(BaseModel):
  """Response model for authentication."""

  user: User
  is_preconfigured_facilitator: bool = False
  message: str


class UserInvite(BaseModel):
  """Model for user invitations."""

  email: str
  name: str
  role: UserRole
  workshop_id: str
  invited_by: str
  expires_at: datetime


class UserInvitation(BaseModel):
  """Model for user invitation responses."""

  token: str
  password: str


# Databricks Model Serving Models
class DatabricksConfig(BaseModel):
  """Configuration for Databricks workspace connection."""

  workspace_url: str = Field(..., description='Databricks workspace URL')
  token: str = Field(..., description='Databricks API token')


class DatabricksEndpointCall(BaseModel):
  """Request model for calling a Databricks serving endpoint."""

  endpoint_name: str = Field(..., description='Name of the serving endpoint')
  prompt: str = Field(..., description='The prompt to send to the model')
  temperature: float = Field(default=0.5, ge=0.0, le=1.0, description='Temperature for generation')
  max_tokens: Optional[int] = Field(default=None, gt=0, description='Maximum number of tokens to generate')
  model_parameters: Optional[Dict[str, Any]] = Field(default=None, description='Additional model parameters')


class DatabricksChatMessage(BaseModel):
  """Model for chat completion messages."""

  role: str = Field(..., description='Role of the message sender (system, user, assistant)')
  content: str = Field(..., description='Content of the message')


class DatabricksChatCompletion(BaseModel):
  """Request model for Databricks chat completion."""

  endpoint_name: str = Field(..., description='Name of the serving endpoint')
  messages: List[DatabricksChatMessage] = Field(..., description='List of messages for chat completion')
  temperature: float = Field(default=0.5, ge=0.0, le=1.0, description='Temperature for generation')
  max_tokens: Optional[int] = Field(default=None, gt=0, description='Maximum number of tokens to generate')
  model_parameters: Optional[Dict[str, Any]] = Field(default=None, description='Additional model parameters')


class DatabricksResponse(BaseModel):
  """Response model for Databricks API calls."""

  success: bool = Field(..., description='Whether the request was successful')
  data: Optional[Dict[str, Any]] = Field(default=None, description='Response data from the model')
  error: Optional[str] = Field(default=None, description='Error message if request failed')
  endpoint_name: str = Field(..., description='Name of the endpoint that was called')
  timestamp: datetime = Field(default_factory=datetime.now, description='Timestamp of the request')


class DatabricksEndpointInfo(BaseModel):
  """Model for serving endpoint information."""

  name: str = Field(..., description='Name of the serving endpoint')
  id: str = Field(..., description='Unique identifier of the endpoint')
  state: Optional[str] = Field(default=None, description='Current state of the endpoint')
  config: Optional[Dict[str, Any]] = Field(default=None, description='Endpoint configuration')
  creator: Optional[str] = Field(default=None, description='Creator of the endpoint')
  created_at: Optional[str] = Field(default=None, description='Creation timestamp')
  updated_at: Optional[str] = Field(default=None, description='Last update timestamp')


class DatabricksConnectionTest(BaseModel):
  """Model for connection test results."""

  status: str = Field(..., description='Connection status (connected/failed)')
  workspace_url: str = Field(..., description='Workspace URL that was tested')
  endpoints_count: Optional[int] = Field(default=None, description='Number of available endpoints')
  error: Optional[str] = Field(default=None, description='Error message if connection failed')
  message: str = Field(..., description='Human-readable status message')
