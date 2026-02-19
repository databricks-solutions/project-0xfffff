"""Data models for the workshop application."""

from datetime import datetime
from enum import Enum, StrEnum
from typing import Any

from pydantic import BaseModel, Field


class WorkshopStatus(StrEnum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class WorkshopPhase(StrEnum):
    INTAKE = "intake"
    DISCOVERY = "discovery"
    RUBRIC = "rubric"
    ANNOTATION = "annotation"
    RESULTS = "results"
    JUDGE_TUNING = "judge_tuning"
    UNITY_VOLUME = "unity_volume"


class UserRole(StrEnum):
    FACILITATOR = "facilitator"
    SME = "sme"  # Subject Matter Expert
    PARTICIPANT = "participant"


class UserStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"


class JudgeType(StrEnum):
    """Type of judge evaluation."""

    LIKERT = "likert"  # Likert scale rubric-based scoring (1-5 scale)
    BINARY = "binary"  # Pass/Fail or Yes/No evaluation
    FREEFORM = "freeform"  # Free-form feedback without structured ratings


# User Models
class UserCreate(BaseModel):
    email: str
    name: str
    role: UserRole
    workshop_id: str
    password: str | None = None  # Optional for backward compatibility


class UserLogin(BaseModel):
    email: str
    password: str
    workshop_id: str | None = None  # Required for participants/SMEs to validate access


class User(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    workshop_id: str | None = None  # Nullable for facilitators not tied to a workshop
    status: UserStatus = UserStatus.ACTIVE
    created_at: datetime = Field(default_factory=datetime.now)
    last_active: datetime | None = None
    password_hash: str | None = None  # For internal use only


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
    def for_role(cls, role: UserRole) -> "UserPermissions":
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
        if role == UserRole.SME:
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
        # PARTICIPANT
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
    assigned_traces: list[str] = Field(default_factory=list)
    annotation_quota: int | None = None
    joined_at: datetime = Field(default_factory=datetime.now)


# Request/Response Models
class WorkshopCreate(BaseModel):
    name: str
    description: str | None = None
    facilitator_id: str


class Workshop(BaseModel):
    id: str
    name: str
    description: str | None = None
    facilitator_id: str
    status: WorkshopStatus = WorkshopStatus.ACTIVE
    current_phase: WorkshopPhase = WorkshopPhase.INTAKE
    completed_phases: list[str] = Field(default_factory=list)
    discovery_started: bool = False
    annotation_started: bool = False
    active_discovery_trace_ids: list[str] = Field(default_factory=list)
    active_annotation_trace_ids: list[str] = Field(default_factory=list)
    discovery_randomize_traces: bool = False  # Whether to randomize trace order in discovery
    annotation_randomize_traces: bool = False  # Whether to randomize trace order in annotation
    judge_name: str = "workshop_judge"  # Name used for MLflow feedback entries
    discovery_questions_model_name: str = "demo"  # LLM model/endpoint for discovery question generation
    input_jsonpath: str | None = None  # JSONPath query for extracting trace input display
    output_jsonpath: str | None = None  # JSONPath query for extracting trace output display
    auto_evaluation_job_id: str | None = None  # Job ID for auto-evaluation on annotation start
    auto_evaluation_prompt: str | None = None  # Derived judge prompt used for auto-evaluation
    auto_evaluation_model: str | None = None  # Model used for auto-evaluation
    show_participant_notes: bool = False  # Facilitator toggle: show notepad to SMEs
    created_at: datetime = Field(default_factory=datetime.now)


class TraceUpload(BaseModel):
    input: str
    output: str
    context: dict[str, Any] | None = None
    trace_metadata: dict[str, Any] | None = None  # Renamed from metadata
    mlflow_trace_id: str | None = None
    mlflow_url: str | None = None
    mlflow_host: str | None = None
    mlflow_experiment_id: str | None = None


class Trace(BaseModel):
    id: str
    workshop_id: str
    input: str
    output: str
    context: dict[str, Any] | None = None
    trace_metadata: dict[str, Any] | None = None  # Renamed from metadata
    mlflow_trace_id: str | None = None
    mlflow_url: str | None = None
    mlflow_host: str | None = None
    mlflow_experiment_id: str | None = None
    include_in_alignment: bool = True  # Whether to include in judge alignment
    sme_feedback: str | None = None  # Concatenated SME feedback for alignment
    created_at: datetime = Field(default_factory=datetime.now)


class DiscoveryFindingCreate(BaseModel):
    trace_id: str
    user_id: str
    insight: str
    category: str | None = None  # Classification category (themes, edge_cases, etc.)


class DiscoveryFinding(BaseModel):
    id: str
    workshop_id: str
    trace_id: str
    user_id: str
    insight: str
    category: str | None = None  # Classification category (themes, edge_cases, etc.)
    created_at: datetime = Field(default_factory=datetime.now)


class DiscoveryFindingWithUser(BaseModel):
    """Finding enriched with user display info (for facilitator views)."""

    id: str
    workshop_id: str
    trace_id: str
    user_id: str
    user_name: str
    user_email: str
    insight: str
    created_at: datetime


class RubricCreate(BaseModel):
    question: str
    created_by: str
    judge_type: JudgeType | None = Field(
        default=JudgeType.LIKERT, description="Type of judge: likert, binary, or freeform"
    )
    binary_labels: dict[str, str] | None = Field(default=None, description="Custom labels for binary judge")
    rating_scale: int | None = Field(default=5, description="Rating scale for rubric judge")


class Rubric(BaseModel):
    id: str
    workshop_id: str
    question: str
    judge_type: JudgeType = Field(default=JudgeType.LIKERT)
    binary_labels: dict[str, str] | None = None
    rating_scale: int = 5
    created_by: str
    created_at: datetime = Field(default_factory=datetime.now)


class RubricGenerationRequest(BaseModel):
    """Request model for generating rubric suggestions using AI."""

    endpoint_name: str = Field(
        default="databricks-claude-sonnet-4-5", description="Databricks model serving endpoint name"
    )
    temperature: float = Field(default=0.3, ge=0.0, le=2.0, description="Model temperature (0.0-2.0)")
    include_notes: bool = Field(default=True, description="Include participant notes in prompt")


class RubricSuggestion(BaseModel):
    """AI-generated rubric suggestion."""

    title: str = Field(..., min_length=3, max_length=100, description="Short criterion name")
    description: str = Field(..., min_length=10, max_length=1000, description="Clear definition of what this measures")
    positive: str | None = Field(None, max_length=500, description="What excellent responses demonstrate")
    negative: str | None = Field(None, max_length=500, description="What poor responses demonstrate")
    examples: str | None = Field(None, max_length=500, description="Concrete examples of good and bad")
    judgeType: str = Field(default="likert", pattern="^(likert|binary|freeform)$", description="Judge type")


class AnnotationCreate(BaseModel):
    trace_id: str
    user_id: str
    rating: int = Field(..., ge=1, le=5)  # Legacy: single rating (for backward compatibility)
    ratings: dict[str, int] | None = None  # New: multiple ratings as {"question_id": rating}
    comment: str | None = None


class Annotation(BaseModel):
    id: str
    workshop_id: str
    trace_id: str
    user_id: str
    rating: int = Field(..., ge=1, le=5)  # Legacy: single rating (for backward compatibility)
    ratings: dict[str, int] | None = None  # New: multiple ratings as {"question_id": rating}
    comment: str | None = None
    mlflow_trace_id: str | None = None
    created_at: datetime = Field(default_factory=datetime.now)


class IRRResult(BaseModel):
    workshop_id: str
    score: float
    ready_to_proceed: bool
    calculated_at: datetime = Field(default_factory=datetime.now)
    details: dict[str, Any] | None = None


# Note: Database storage is now handled by DatabaseService
# This file now only contains Pydantic models for API requests/responses


# MLflow Intake Models
class MLflowIntakeConfig(BaseModel):
    """Configuration for MLflow trace intake."""

    databricks_host: str = Field(..., description="Databricks workspace host URL")
    databricks_token: str = Field(..., description="Databricks access token")
    experiment_id: str = Field(..., description="MLflow experiment ID to pull traces from")
    max_traces: int | None = Field(100, description="Maximum number of traces to pull")
    filter_string: str | None = Field(None, description="Optional filter string for traces")


class MLflowIntakeConfigCreate(BaseModel):
    """Request model for creating MLflow intake configuration."""

    databricks_host: str = Field(..., description="Databricks workspace host URL")
    databricks_token: str = Field(..., description="Databricks access token")
    experiment_id: str = Field(..., description="MLflow experiment ID to pull traces from")
    max_traces: int | None = Field(100, description="Maximum number of traces to pull")
    filter_string: str | None = Field(None, description="Optional filter string for traces")


class MLflowIntakeStatus(BaseModel):
    """Status of MLflow intake process."""

    workshop_id: str
    is_configured: bool = False
    is_ingested: bool = False
    trace_count: int = 0
    last_ingestion_time: datetime | None = None
    error_message: str | None = None
    config: MLflowIntakeConfig | None = None


class MLflowTraceInfo(BaseModel):
    """Information about an MLflow trace."""

    trace_id: str
    request_preview: str
    response_preview: str
    execution_time_ms: int | None = None
    status: str
    timestamp_ms: int
    tags: dict[str, str] | None = None
    mlflow_url: str | None = None


# Judge Tuning Models
class JudgePromptCreate(BaseModel):
    """Request model for creating a judge prompt."""

    prompt_text: str = Field(..., description="The judge prompt text")
    judge_type: JudgeType = Field(default=JudgeType.LIKERT, description="Type of judge: likert, binary, or freeform")
    few_shot_examples: list[str] | None = Field(default=[], description="Selected few-shot example trace IDs")
    model_name: str | None = Field(
        default="demo", description="Model to use: demo, databricks-dbrx-instruct, openai-gpt-4, etc."
    )
    model_parameters: dict[str, Any] | None = Field(default=None, description="Model parameters like temperature")
    # Binary judge specific config
    binary_labels: dict[str, str] | None = Field(
        default=None, description='Custom labels for binary judge, e.g. {"pass": "Pass", "fail": "Fail"}'
    )
    # Rubric judge specific config
    rating_scale: int | None = Field(default=5, description="Rating scale for rubric judge (default 5-point)")


class JudgePrompt(BaseModel):
    """Judge prompt model."""

    id: str
    workshop_id: str
    prompt_text: str
    judge_type: JudgeType = Field(default=JudgeType.LIKERT)
    version: int
    few_shot_examples: list[str] = Field(default=[])
    model_name: str = Field(default="demo")
    model_parameters: dict[str, Any] | None = None
    binary_labels: dict[str, str] | None = None
    rating_scale: int | None = 5
    created_by: str
    created_at: datetime = Field(default_factory=datetime.now)
    performance_metrics: dict[str, Any] | None = None


class JudgeEvaluation(BaseModel):
    """Judge evaluation result for a single trace."""

    id: str
    workshop_id: str
    prompt_id: str
    trace_id: str
    # For rubric judges (1-5 scale)
    predicted_rating: int | None = None
    human_rating: int | None = None
    # For binary judges (pass/fail)
    predicted_binary: bool | None = None
    human_binary: bool | None = None
    # For freeform judges (text feedback)
    predicted_feedback: str | None = None
    human_feedback: str | None = None
    # Common fields
    confidence: float | None = None
    reasoning: str | None = None


class JudgeEvaluationRequest(BaseModel):
    """Request model for evaluating a judge prompt."""

    prompt_id: str
    trace_ids: list[str] | None = Field(None, description="Specific traces to evaluate, or None for all")
    override_model: str | None = Field(
        None, description="Override model selection from UI (e.g., 'demo' to force simulation)"
    )


class JudgeEvaluationDirectRequest(BaseModel):
    """Request model for evaluating a judge prompt without saving it."""

    prompt_text: str
    model_name: str = "demo"
    model_parameters: dict[str, Any] | None = None
    trace_ids: list[str] | None = Field(None, description="Specific traces to evaluate, or None for all")


class JudgePerformanceMetrics(BaseModel):
    """Performance metrics for a judge prompt."""

    prompt_id: str
    correlation: float
    accuracy: float
    mean_absolute_error: float
    agreement_by_rating: dict[str, float]
    confusion_matrix: list[list[int]]
    total_evaluations: int


class JudgeEvaluationResult(BaseModel):
    """Result from direct evaluation including both metrics and individual evaluations."""

    metrics: JudgePerformanceMetrics
    evaluations: list[JudgeEvaluation]


class JudgeExportConfig(BaseModel):
    """Configuration for exporting a judge."""

    prompt_id: str
    export_format: str = Field(default="json", description="Export format: json, python, or api")
    include_examples: bool = Field(default=True, description="Include few-shot examples in export")


# DBSQL Export Models
class DBSQLExportRequest(BaseModel):
    """Request model for DBSQL export operations."""

    databricks_host: str = Field(
        ..., description="Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com)"
    )
    databricks_token: str = Field(..., description="Databricks access token for DBSQL authentication")
    http_path: str = Field(..., description="DBSQL warehouse HTTP path (e.g., /sql/1.0/warehouses/xxxxxx)")
    catalog: str = Field(..., description="Unity Catalog catalog name")
    schema_name: str = Field(..., description="Unity Catalog schema name")


class DBSQLExportResponse(BaseModel):
    """Response model for DBSQL export operations."""

    success: bool = Field(..., description="Whether the export was successful")
    message: str = Field(..., description="Human-readable message about the export")
    tables_exported: list[dict[str, Any]] | None = Field(None, description="List of exported tables")
    total_rows: int | None = Field(None, description="Total number of rows exported")
    errors: list[str] | None = Field(None, description="List of errors encountered during export")


# Participant Note Models
class ParticipantNoteCreate(BaseModel):
    """Request model for creating a participant note."""

    user_id: str
    trace_id: str | None = None  # Nullable: note can be general or trace-specific
    content: str
    phase: str = "discovery"  # 'discovery' or 'annotation'


class ParticipantNote(BaseModel):
    """Participant note model."""

    id: str
    workshop_id: str
    user_id: str
    trace_id: str | None = None
    content: str
    phase: str = "discovery"  # 'discovery' or 'annotation'
    user_name: str | None = None  # Populated when returning notes with user details
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


# User Trace Order Models
class UserTraceOrderCreate(BaseModel):
    """Model for creating user trace order."""

    user_id: str
    workshop_id: str
    discovery_traces: list[str] = Field(default_factory=list)
    annotation_traces: list[str] = Field(default_factory=list)


class UserTraceOrder(BaseModel):
    """Model for user-specific trace orderings."""

    id: str
    user_id: str
    workshop_id: str
    discovery_traces: list[str] = Field(default_factory=list)
    annotation_traces: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


# Authentication Models
class FacilitatorConfig(BaseModel):
    """Configuration for pre-configured facilitators."""

    email: str
    password_hash: str
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=datetime.now)


class FacilitatorConfigCreate(BaseModel):
    """Request model for creating facilitator configuration."""

    email: str
    password: str
    name: str
    description: str | None = None


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

    workspace_url: str = Field(..., description="Databricks workspace URL")
    token: str = Field(..., description="Databricks API token")


class DatabricksEndpointCall(BaseModel):
    """Request model for calling a Databricks serving endpoint."""

    endpoint_name: str = Field(..., description="Name of the serving endpoint")
    prompt: str = Field(..., description="The prompt to send to the model")
    temperature: float = Field(default=0.5, ge=0.0, le=1.0, description="Temperature for generation")
    max_tokens: int | None = Field(default=None, gt=0, description="Maximum number of tokens to generate")
    model_parameters: dict[str, Any] | None = Field(default=None, description="Additional model parameters")


class DatabricksChatMessage(BaseModel):
    """Model for chat completion messages."""

    role: str = Field(..., description="Role of the message sender (system, user, assistant)")
    content: str = Field(..., description="Content of the message")


class DatabricksChatCompletion(BaseModel):
    """Request model for Databricks chat completion."""

    endpoint_name: str = Field(..., description="Name of the serving endpoint")
    messages: list[DatabricksChatMessage] = Field(..., description="List of messages for chat completion")
    temperature: float = Field(default=0.5, ge=0.0, le=1.0, description="Temperature for generation")
    max_tokens: int | None = Field(default=None, gt=0, description="Maximum number of tokens to generate")
    model_parameters: dict[str, Any] | None = Field(default=None, description="Additional model parameters")


class DatabricksResponse(BaseModel):
    """Response model for Databricks API calls."""

    success: bool = Field(..., description="Whether the request was successful")
    data: dict[str, Any] | None = Field(default=None, description="Response data from the model")
    error: str | None = Field(default=None, description="Error message if request failed")
    endpoint_name: str = Field(..., description="Name of the endpoint that was called")
    timestamp: datetime = Field(default_factory=datetime.now, description="Timestamp of the request")


class DatabricksEndpointInfo(BaseModel):
    """Model for serving endpoint information."""

    name: str = Field(..., description="Name of the serving endpoint")
    id: str = Field(..., description="Unique identifier of the endpoint")
    state: str | None = Field(default=None, description="Current state of the endpoint")
    config: dict[str, Any] | None = Field(default=None, description="Endpoint configuration")
    creator: str | None = Field(default=None, description="Creator of the endpoint")
    created_at: str | None = Field(default=None, description="Creation timestamp")
    updated_at: str | None = Field(default=None, description="Last update timestamp")


class DatabricksConnectionTest(BaseModel):
    """Model for connection test results."""

    status: str = Field(..., description="Connection status (connected/failed)")
    workspace_url: str = Field(..., description="Workspace URL that was tested")
    endpoints_count: int | None = Field(default=None, description="Number of available endpoints")
    error: str | None = Field(default=None, description="Error message if connection failed")
    message: str = Field(..., description="Human-readable status message")


# Custom LLM Provider Models
class CustomLLMProviderConfig(BaseModel):
    """Configuration for custom OpenAI-compatible LLM provider."""

    provider_name: str = Field(..., description="User-friendly provider name")
    base_url: str = Field(..., description="Base URL for the OpenAI-compatible endpoint")
    api_key: str = Field(..., description="API key (not persisted to DB)")
    model_name: str = Field(..., description="Model name/identifier")
    is_enabled: bool = Field(default=True, description="Whether custom provider is active")


class CustomLLMProviderConfigCreate(BaseModel):
    """Request model for creating/updating custom LLM provider config."""

    provider_name: str = Field(..., description="User-friendly provider name")
    base_url: str = Field(..., description="Base URL for the OpenAI-compatible endpoint")
    api_key: str = Field(..., description="API key for authentication")
    model_name: str = Field(..., description="Model name/identifier")


class CustomLLMProviderStatus(BaseModel):
    """Status of custom LLM provider configuration."""

    workshop_id: str
    is_configured: bool = False
    is_enabled: bool = False
    provider_name: str | None = None
    base_url: str | None = None  # Shown in UI for reference
    model_name: str | None = None
    has_api_key: bool = False  # Whether key is stored (don't expose actual key)


class CustomLLMProviderTestResult(BaseModel):
    """Result of testing custom LLM provider connection."""

    success: bool
    message: str
    response_time_ms: int | None = None
    error_code: str | None = None


# ---------------------------------------------------------------------------
# Assisted Facilitation v2 Models
# ---------------------------------------------------------------------------


class FeedbackLabel(str, Enum):
    GOOD = "good"
    BAD = "bad"


class DiscoveryFeedbackCreate(BaseModel):
    trace_id: str
    user_id: str
    feedback_label: FeedbackLabel
    comment: str


class DiscoveryFeedback(BaseModel):
    id: str
    workshop_id: str
    trace_id: str
    user_id: str
    feedback_label: FeedbackLabel
    comment: str
    followup_qna: list[dict[str, str]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class GenerateFollowUpRequest(BaseModel):
    trace_id: str
    user_id: str


class SubmitFollowUpAnswerRequest(BaseModel):
    trace_id: str
    user_id: str
    question: str
    answer: str


class ClassifiedFinding(BaseModel):
    """A finding with LLM-assigned category."""

    id: str
    workshop_id: str
    trace_id: str
    user_id: str
    text: str
    category: str  # themes|edge_cases|boundary_conditions|failure_modes|missing_info
    question_id: str
    promoted: bool = False
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class ClassifiedFindingCreate(BaseModel):
    """Create a classified finding."""

    trace_id: str
    user_id: str
    text: str
    category: str
    question_id: str


class Disagreement(BaseModel):
    """Auto-detected disagreement between participants."""

    id: str
    workshop_id: str
    trace_id: str
    user_ids: list[str]
    finding_ids: list[str]
    summary: str
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class TraceDiscoveryQuestion(BaseModel):
    """Trace-level discovery question (broadcast to all participants)."""

    id: str
    workshop_id: str
    trace_id: str
    prompt: str
    placeholder: str | None = None
    target_category: str | None = None
    is_fixed: bool = False
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class TraceDiscoveryQuestionCreate(BaseModel):
    """Create a trace discovery question."""

    trace_id: str
    prompt: str
    placeholder: str | None = None
    target_category: str | None = None
    is_fixed: bool = False


class TraceDiscoveryThreshold(BaseModel):
    """Per-trace thresholds for category coverage."""

    id: str
    workshop_id: str
    trace_id: str
    thresholds: dict[str, int]  # {category: count}
    created_at: datetime | None = None

    class Config:
        from_attributes = True


class TraceDiscoveryThresholdCreate(BaseModel):
    """Create trace discovery thresholds."""

    trace_id: str
    thresholds: dict[str, int]


class DraftRubricItem(BaseModel):
    """Promoted finding in draft rubric staging area."""

    id: str
    workshop_id: str
    source_finding_id: str
    source_trace_id: str
    text: str
    promoted_by: str
    promoted_at: datetime | None = None

    class Config:
        from_attributes = True


class DraftRubricItemCreate(BaseModel):
    """Create a draft rubric item."""

    source_finding_id: str
    source_trace_id: str
    text: str


class TraceDiscoveryState(BaseModel):
    """Structured discovery state for a trace (facilitator view)."""

    trace_id: str
    categories: dict[str, list[ClassifiedFinding]] = {}
    disagreements: list[Disagreement] = []
    questions: list[TraceDiscoveryQuestion] = []
    thresholds: dict[str, int] = {}


class FuzzyProgress(BaseModel):
    """Fuzzy progress indicator for participants."""

    status: str  # "exploring" | "good_coverage" | "complete"
    percentage: float  # 0-100


# ---------------------------------------------------------------------------
# Discovery Analysis Models (Step 2 - Findings Synthesis)
# ---------------------------------------------------------------------------


class AnalysisTemplate(str, Enum):
    EVALUATION_CRITERIA = "evaluation_criteria"
    THEMES_PATTERNS = "themes_patterns"


class Finding(BaseModel):
    """A single finding from the analysis (criterion or theme)."""

    text: str
    evidence_trace_ids: list[str] = Field(default_factory=list)
    priority: str = "medium"  # 'high' | 'medium' | 'low'


class DisagreementAnalysis(BaseModel):
    """Analysis of a disagreement between reviewers on a trace."""

    trace_id: str
    summary: str
    underlying_theme: str
    followup_questions: list[str] = Field(default_factory=list)
    facilitator_suggestions: list[str] = Field(default_factory=list)


class DistillationOutput(BaseModel):
    """Structured output from the LLM distillation step."""

    findings: list[Finding] = Field(default_factory=list)
    high_priority_disagreements: list[DisagreementAnalysis] = Field(default_factory=list)
    medium_priority_disagreements: list[DisagreementAnalysis] = Field(default_factory=list)
    lower_priority_disagreements: list[DisagreementAnalysis] = Field(default_factory=list)
    summary: str = ""


class DiscoveryAnalysisResponse(BaseModel):
    """Full analysis record returned from the API."""

    id: str
    workshop_id: str
    template_used: str
    analysis_data: str
    findings: list[dict[str, Any]]
    disagreements: dict[str, list[dict[str, Any]]]
    participant_count: int
    model_used: str
    created_at: datetime
    updated_at: datetime


class AnalyzeDiscoveryRequest(BaseModel):
    """Request model for triggering discovery analysis."""

    template: AnalysisTemplate = Field(default=AnalysisTemplate.EVALUATION_CRITERIA)
    model: str = Field(default="databricks-claude-sonnet-4-5", description="Model endpoint name")
