# Specifications Index

This directory contains declarative specifications for the Human Evaluation Workshop system. Each spec defines the expected behavior, data models, and implementation requirements for a specific domain.

## Quick Reference


| Spec                                                                    | Domain                   | Key Concepts                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)           | Discovery & Facilitation | discovery, facilitation, findings, classification, promotion, rubric bridge                                                            |
| [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)                                   | Discovery Workspace      | discovery workspace, social threads, milestones, facilitator modes, assistant mentions, agent mentions                                 |
| [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)                         | Auth & Sessions          | login, permissions, session, Databricks auth, fallback                                                                                 |
| [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)                                 | Annotation System        | annotation, rating, editing, MLflow feedback, comments                                                                                 |
| [DATASETS_SPEC](./DATASETS_SPEC.md)                                     | Trace Datasets           | dataset, labeling dataset, composition, randomization, per-user order                                                                  |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md) | Trace Assignment         | trace, assignment, phase, round, visibility, participant                                                                               |
| [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)                     | Roles & Permissions      | role, facilitator, SME, participant, permission, for_role, phase advancement                                                           |
| [RUBRIC_SPEC](./RUBRIC_SPEC.md)                                         | Rubric Management        | rubric, question, parsing, delimiter, scale, binary, Likert                                                                            |
| [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)                     | Judge & Alignment        | judge, evaluation, MLflow, binary, SIMBA, IRR, alignment                                                                               |
| [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)                                   | Eval Mode                | per-example rubric, benchmark, hurdle, weighted criteria, offline eval, per-trace criteria                                             |
| [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)               | Custom LLM Providers     | custom provider, OpenAI-compatible, proxy_url, Azure, vLLM                                                                             |
| [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)                           | UI Components            | pagination, trace viewer, table, export, keyboard shortcuts                                                                            |
| [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)                     | Build & Deploy           | build, deploy, Alembic, migrations, database, bootstrap                                                                                |
| [TESTING_SPEC](./TESTING_SPEC.md)                                       | Testing                  | unit test, e2e, pytest, vitest, playwright, coverage                                                                                   |
| [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)                           | Design System            | color, theme, purple, indigo, dark mode, accessibility                                                                                 |
| [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)                           | Trace Display            | JSONPath, input extraction, output extraction, preview, facilitator settings                                                           |
| [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)                       | Trace Ingestion          | ingest, intake, CSV upload, content extraction, deduplication, mlflow_trace_id, upsert                                                 |
| [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)               | Trace Summarization      | milestone view, executive summary, LLM summarization, batch summarization, job tracking, progress UI, re-summarize, summary indicators |
| [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)                           | Project Setup            | project setup, day-one bootstrap, setup pipeline, Procrastinate, setup progress, Lakeflow delegation                                   |


---

## Keyword Search Index

Use this index to find relevant specs by keyword.

### Project Setup

- **project setup** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **day-one bootstrap** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **/project/setup** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **setup pipeline** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **setup progress** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **setup job** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **Procrastinate** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **task queue** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **Databricks Jobs** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **Lakeflow Jobs** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)
- **JBW Project** → [PROJECT_SETUP_SPEC](./PROJECT_SETUP_SPEC.md)

### Discovery & Assisted Facilitation

- **discovery** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md), [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md), [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **discovery workspace** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **social thread** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **comment thread** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **upvote** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **downvote** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **@assistant** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **@agent** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **follow-up questions** → [DISCOVERY_SPEC](./DISCOVERY_SPEC.md)
- **assisted facilitation** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **finding** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **classification** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **themes** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **edge_cases** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **boundary_conditions** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **failure_modes** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **disagreement** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **promote** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **promotion** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **draft rubric** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **progress bar** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **fuzzy progress** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **question generation** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **broadcast** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **DSPy** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **TraceDiscoveryState** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)
- **ClassifiedFinding** → [ASSISTED_FACILITATION_SPEC](./ASSISTED_FACILITATION_SPEC.md)

### Authentication & Authorization

- **login** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **logout** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **permission** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **permission denied** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **session** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **race condition** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **isLoading** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **UserContext** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **credentials** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **fallback permissions** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **PAT** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **SDK auth** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **resolve_databricks_token** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **service principal** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md), [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **DATABRICKS_TOKEN** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md), [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **DATABRICKS_CLIENT_ID** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md), [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **OAuth** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **CLI profile** → [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)

### Roles & Permissions

- **role** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **facilitator** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md), [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **SME** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **participant** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md), [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **permission** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md), [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md)
- **for_role** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **UserPermissions** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **can_annotate** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **can_create_rubric** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **can_manage_workshop** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **phase advancement** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **advance phase** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)
- **UserRole** → [ROLE_PERMISSIONS_SPEC](./ROLE_PERMISSIONS_SPEC.md)

### Annotation System

- **annotation** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **rating** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **comment** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **newline** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **multi-line** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **whitespace-pre-wrap** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **editing** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **change detection** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **hasAnnotationChanged** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **toast notification** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)
- **AnnotationDemo** → [ANNOTATION_SPEC](./ANNOTATION_SPEC.md)

### Datasets & Trace Collections

- **dataset** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **labeling dataset** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **trace set** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **composition** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **union** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **subtract** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **randomization** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **random order** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **shuffle** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **seed** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **deterministic** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **MD5** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **UserTraceOrder** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **user_trace_orders** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **per-user order** → [DATASETS_SPEC](./DATASETS_SPEC.md)
- **bias reduction** → [DATASETS_SPEC](./DATASETS_SPEC.md)

### Trace Assignment & Phases

- **trace** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md), [DATASETS_SPEC](./DATASETS_SPEC.md)
- **trace assignment** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **phase** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **round** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **discovery phase** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **annotation phase** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **visibility** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **facilitator** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **participant** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **annotator** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **active_discovery_trace_ids** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)
- **active_annotation_trace_ids** → [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md)

### Rubric System

- **rubric** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **question** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **rubric question** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **delimiter** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **QUESTION_SEPARATOR** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **JUDGE_TYPE_DELIMITER** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **per-question judge_type** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **parseRubricQuestions** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **formatRubricQuestions** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **rubricUtils** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **scale** → [RUBRIC_SPEC](./RUBRIC_SPEC.md)
- **Likert** → [RUBRIC_SPEC](./RUBRIC_SPEC.md), [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **binary** → [RUBRIC_SPEC](./RUBRIC_SPEC.md), [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **Pass/Fail** → [RUBRIC_SPEC](./RUBRIC_SPEC.md), [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)

### Judge & Evaluation

- **judge** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **evaluation** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **MLflow** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **mlflow.genai** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **make_judge** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **alignment** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **align()** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **MemAlign** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **MemAlignOptimizer** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **semantic memory** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **episodic memory** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **auto-evaluation** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **re-evaluation** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **auto_evaluation_model** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **derive_judge_prompt** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **registered judge** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **IRR** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **inter-rater reliability** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **Cohen's Kappa** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **Krippendorff's Alpha** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **binary judge** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **feedback_value_type** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **JudgeTuningPage** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)

### Custom LLM Providers

- **custom provider** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **custom LLM** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **OpenAI-compatible** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **proxy_url** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **Azure OpenAI** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **vLLM** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **base_url** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **custom endpoint** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **LiteLLM** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)
- **FMAPI** → [CUSTOM_LLM_PROVIDER_SPEC](./CUSTOM_LLM_PROVIDER_SPEC.md)

### UI Components

- **pagination** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **page navigation** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **items per page** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **quick jump** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **keyboard shortcuts** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **TraceDataViewer** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **trace viewer** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **JSON table** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **SQL formatting** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **CSV export** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)
- **copy to clipboard** → [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md)

### Build & Deployment

- **build** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **deploy** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **vite** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **terser** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **console removal** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **drop_console** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **minify** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **Alembic** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **migration** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **database migration** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **db-bootstrap** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **db-upgrade** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **db-stamp** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **db-revision** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **SQLite** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **Lakebase** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **Postgres** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **Lakebase branch** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **DATABASE_URL** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **configure-lakebase-local** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **just dev postgres** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **batch mode** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **justfile** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)

### Testing

- **test** → [TESTING_SPEC](./TESTING_SPEC.md)
- **unit test** → [TESTING_SPEC](./TESTING_SPEC.md)
- **e2e** → [TESTING_SPEC](./TESTING_SPEC.md)
- **end-to-end** → [TESTING_SPEC](./TESTING_SPEC.md)
- **pytest** → [TESTING_SPEC](./TESTING_SPEC.md)
- **vitest** → [TESTING_SPEC](./TESTING_SPEC.md)
- **playwright** → [TESTING_SPEC](./TESTING_SPEC.md)
- **coverage** → [TESTING_SPEC](./TESTING_SPEC.md)
- **RTL** → [TESTING_SPEC](./TESTING_SPEC.md)
- **React Testing Library** → [TESTING_SPEC](./TESTING_SPEC.md)

### Design System

- **color** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **theme** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **purple** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **indigo** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **dark mode** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **light mode** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **Tailwind** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **accessibility** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **WCAG** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **contrast** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **badge** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)
- **button** → [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md)

### Trace Display Customization

- **JSONPath** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **input extraction** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **output extraction** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **input_jsonpath** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **output_jsonpath** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **trace display** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **preview** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)
- **facilitator settings** → [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md)

### Trace Ingestion & Identity

- **ingest** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **intake** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **CSV upload** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **mlflow_trace_id** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **content extraction** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **role_hint** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **deduplication** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **upsert** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **re-ingest** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **mlflow_url** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **TraceUpload** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **add_traces** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)
- **_extract_content_from_json** → [TRACE_INGESTION_SPEC](./TRACE_INGESTION_SPEC.md)

### Trace Summarization

- **summarization** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **milestone** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **milestone view** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **executive summary** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **trace summary** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **trace agent** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization_enabled** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization_model** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization_guidance** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **TraceSummarizationService** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **resummarize** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **batch summarization** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization status** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization progress** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **SummarizationJob** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **SummarizationJobDB** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization_job_id** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **re-summarize button** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summary indicator** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **summarization-status** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)
- **DiscoveryTraceCard summary** → [TRACE_SUMMARIZATION_SPEC](./TRACE_SUMMARIZATION_SPEC.md)

### Eval Mode & Benchmarking

- **eval mode** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **benchmark mode** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **per-example rubric** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **per-trace criteria** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **hurdle** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **hurdle criterion** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **weighted criteria** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **criterion_type** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **TraceCriterion** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **CriterionEvaluation** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **TraceEvalScore** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **offline eval** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **eval export** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **scoring aggregation** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **HealthBench** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **ACE benchmark** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)
- **workshop mode** → [EVAL_MODE_SPEC](./EVAL_MODE_SPEC.md)

### Build and Deployment

- **SQLite rescue** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **Volume backup** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **Databricks Apps** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **service principal** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)
- **SIGTERM** → [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md)

---

## Spec Structure

Each specification follows a consistent structure:

1. **Overview** - High-level description and purpose
2. **Core Concepts** - Key terminology and definitions
3. **Behavior** - Expected system behavior and rules
4. **Data Model** - Schema definitions and relationships
5. **Implementation** - Technical implementation details
6. **Success Criteria** - Acceptance criteria and verification steps
7. **Future Work** - Out-of-scope items and roadmap

---

## Known Discrepancies

Issues where the spec documents intended behavior but the implementation diverges.


| Spec                            | Discrepancy                                         | Current Implementation                                                                 | Spec Says                                     |
| ------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| ROLE_PERMISSIONS_SPEC           | Phase advancement has no backend role enforcement   | All phase-advance endpoints accept any request; "(facilitator only)" is docstring-only | Only facilitators can advance workshop phases |
| ROLE_PERMISSIONS_SPEC           | Annotation endpoint has no backend permission check | `POST /workshops/{id}/annotations` accepts from any role                               | Annotation requires `can_annotate` permission |
| DISCOVERY_TRACE_ASSIGNMENT_SPEC | `update_workshop_participant` is a no-op            | Function queries DB but discards result, no commit                                     | Trace assignments should persist              |


---

## Related Documentation

- [doc/CHANGELOG.md](../doc/CHANGELOG.md) - Version history
- [doc/RELEASE_NOTES.md](../doc/RELEASE_NOTES.md) - Release documentation
- [README.md](../README.md) - Project overview