# Specifications Index

This directory contains declarative specifications for the Human Evaluation Workshop system. Each spec defines the expected behavior, data models, and implementation requirements for a specific domain.

## Quick Reference

| Spec | Domain | Key Concepts |
|------|--------|--------------|
| [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md) | Auth & Sessions | login, permissions, session, Databricks auth, fallback |
| [ANNOTATION_SPEC](./ANNOTATION_SPEC.md) | Annotation System | annotation, rating, editing, MLflow feedback, comments |
| [DATASETS_SPEC](./DATASETS_SPEC.md) | Trace Datasets | dataset, labeling dataset, composition, randomization, per-user order |
| [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md) | Trace Assignment | trace, assignment, phase, round, visibility, participant |
| [RUBRIC_SPEC](./RUBRIC_SPEC.md) | Rubric Management | rubric, question, parsing, delimiter, scale, binary, Likert |
| [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md) | Judge & Alignment | judge, evaluation, MLflow, binary, SIMBA, IRR, alignment |
| [UI_COMPONENTS_SPEC](./UI_COMPONENTS_SPEC.md) | UI Components | pagination, trace viewer, table, export, keyboard shortcuts |
| [BUILD_AND_DEPLOY_SPEC](./BUILD_AND_DEPLOY_SPEC.md) | Build & Deploy | build, deploy, Alembic, migrations, database, bootstrap |
| [TESTING_SPEC](./TESTING_SPEC.md) | Testing | unit test, e2e, pytest, vitest, playwright, coverage |
| [DESIGN_SYSTEM_SPEC](./DESIGN_SYSTEM_SPEC.md) | Design System | color, theme, purple, indigo, dark mode, accessibility |
| [TRACE_DISPLAY_SPEC](./TRACE_DISPLAY_SPEC.md) | Trace Display | JSONPath, input extraction, output extraction, preview, facilitator settings |

---

## Keyword Search Index

Use this index to find relevant specs by keyword.

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
- **SIMBA** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **SIMBAAlignmentOptimizer** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **IRR** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **inter-rater reliability** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **Cohen's Kappa** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **Krippendorff's Alpha** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **binary judge** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **feedback_value_type** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)
- **JudgeTuningPage** → [JUDGE_EVALUATION_SPEC](./JUDGE_EVALUATION_SPEC.md)

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

## Related Documentation

- [doc/CHANGELOG.md](../doc/CHANGELOG.md) - Version history
- [doc/RELEASE_NOTES.md](../doc/RELEASE_NOTES.md) - Release documentation
- [README.md](../README.md) - Project overview
