# Human Evaluation Workshop

This context describes the V2 project lifecycle for creating and operating a long-lived LLM judge calibration system.

## Language

**Project**:
The long-lived container for configuring and operating the judge calibration loop for one app or evaluated system.
_Avoid_: Agent, workshop

**CUJ**:
A critical user journey that describes a user-visible outcome in the project workflow.
_Avoid_: Feature bucket, implementation phase, internal module

**Active Learning Judge**:
The product capability that optimizes criteria elicitation, SME disagreement diagnosis, and judge alignment through targeted feedback loops.
_Avoid_: Generic judge training, one-shot alignment

**Developer**:
The project owner who configures traces, rubrics, judges, workflows, and deployment decisions.
_Avoid_: Facilitator, evaluation lead

**SME Reviewer**:
The human reviewer who provides domain judgment through labels, comments, disagreement resolution, and feedback on judge behavior.
_Avoid_: Annotator, participant, spot checker

**Judge Optimizer**:
The agentic AI actor that ranks feedback opportunities, proposes rubric or judge changes, and recommends next actions.
_Avoid_: Assistant, generic agent

**Agent Interface**:
The shared interface for agentic behavior across trace summarization, active learning, recommendations, explanations, and discussion participation.
_Avoid_: Separate trace summarizer agent, separate optimizer agent

**System Under Review**:
The agentic app or AI system whose behavior is being evaluated by the project.
_Avoid_: Agent

**Select Evaluation Traces**:
The CUJ where the Developer defines the system under review and selects diverse or targeted traces for evaluation.
_Avoid_: Trace pool setup, sampling only

**Dataset**:
A selected set of traces used for criteria elicitation, SME review, judge alignment, monitoring, or audit.
_Avoid_: One-time trace pool

**Review Feed**:
The ordered stream of traces, questions, and review tasks used to gather SME feedback and populate evaluation datasets.
_Avoid_: Static dataset

**Curate Review Feed**:
The CUJ where the Developer and Judge Optimizer build an evolving feed of traces and questions for SME feedback.
_Avoid_: Select traces, create trace pool

**Elicit Rubric Criteria**:
The CUJ where SME feedback is turned into rubric criteria for judging the system under review.
_Avoid_: Discovery, generic criteria elicitation

**Rubric-Based Evaluation**:
An evaluation approach that decomposes expert judgment into explicit criteria that human and LLM judges can apply consistently.
_Avoid_: Holistic quality scoring

**Rubric**:
A versioned evaluation framework composed from criteria for judging the system under review.
_Avoid_: Judge prompt, guideline list

**Criterion**:
A discrete scoring condition within a rubric, such as binary, scalar, Likert, weighted, or hurdle.
_Avoid_: Question, holistic score, vague dimension

**Atomic Criterion**:
A criterion that evaluates one observable dimension of quality and can be interpreted without hidden context.
_Avoid_: Compound criterion, vague quality statement

**Composite Criterion**:
A criterion whose score is derived from multiple child criteria.
_Avoid_: Single rubric question

**Hurdle Criterion**:
A criterion that gates scoring because failure means the response missed a core requirement.
_Avoid_: Ordinary weighted criterion

**Rubric Gap**:
The quality gap between expert-authored or expert-revised rubrics and model-generated rubrics.
_Avoid_: Judge error

**Rubric Quality**:
The degree to which a rubric’s criteria are clear, verifiable, measurable, self-contained, atomic, and valid for the task.
_Avoid_: Rubric length, model-generated polish

**Rubric API**:
The public interface for creating, applying, and improving rubric-based judges from human feedback.
_Avoid_: One judge per rubric question

**Grading**:
The product surface where rubric criteria, human assessments, AI assessments, and alignment evidence come together.
_Avoid_: Rubric-only page, judge-only page

**Workspace**:
The Developer control surface for seeing where the project is in the overall evaluation lifecycle.
_Avoid_: Catch-all dashboard

**Evaluation Lifecycle**:
The full loop from Review Feed through SME Judgement, Grading, judge versions, and production evaluation.
_Avoid_: Phase machine

**Activity Monitor**:
The Workspace model for tracking live progress toward evaluation goals without enforcing lifecycle states.
_Avoid_: State machine, phase completion gate

**Evaluation Goal**:
A target metric set by the Developer, such as human agreement, judge agreement, construct validity, or confidence.
_Avoid_: Phase exit criterion

**Assessment**:
A human or AI judgement applied to a trace through rubric context.
_Avoid_: Annotation, raw label

**Rubric Result**:
The collection of criterion scores, composite scores, rationales, and judge outputs produced by applying a rubric.
_Avoid_: Single judge score

**Rubric Lineage**:
The provenance from rubric criteria and versions back to source examples, Discussion Comments, and SME judgement that produced them.
_Avoid_: Version number only

**Rubric Feedback**:
Human feedback that is interpreted in the context of a rubric, criterion, rubric result, trace, or discussion thread.
_Avoid_: Trace-only feedback

**Discussion Layer**:
The comment-thread surface where SME Reviewers, judges, and the Judge Optimizer exchange reasoning, reactions, and proposed changes.
_Avoid_: Feedback metadata, generic likes

**Discussion Pane**:
The companion UI pane that renders the Discussion Layer beside review or rubric work.
_Avoid_: Standalone destination by default

**Discussion Comment**:
A threaded comment with typed reactions and context such as trace, criterion, score, rationale, or proposed change.
_Avoid_: MLflow feedback record

**Codified Judgment**:
SME Reviewer judgment captured as rubric-contextual scores, rationales, reactions, or discussion comments that the Judge Optimizer can learn from.
_Avoid_: Label, annotation

**Codify SME Judgement**:
The CUJ where SME Reviewers express domain judgement through the rubric and Discussion Layer so the Judge Optimizer can learn from it.
_Avoid_: Label traces, annotate examples, resolve disagreement

**Improve Evaluation Confidence**:
The CUJ where the Developer and Judge Optimizer measure and improve trust in the rubric-based evaluation system.
_Avoid_: One-time judge alignment, raw judge confidence

**Run Evaluation Ops**:
The CUJ where the Developer runs the production ops loop for the rubric-based evaluation system.
_Avoid_: One-time validation, offline benchmark only

**MLflow Feedback**:
Exported feedback attached to an MLflow trace with judge name, score, rationale, source, and metadata.
_Avoid_: Native SME dialogue model

**Per-Example Rubric**:
A rubric scoped to one example, often using an explicit reference answer or expected behavior for that example.
_Avoid_: Global project rubric

**Continuous Judge Alignment**:
The ongoing process by which the judge improves from SME judgement through memory, rubric changes, and updated scoring behavior.
_Avoid_: Point-in-time align step

**Judge Confidence**:
The evidence-backed confidence that the judge is reliable for the project’s current evaluation goals.
_Avoid_: Raw model confidence

**Setup**:
Guided first-run configuration that walks facilitators through the existing settings needed before a project can operate.
_Avoid_: Onboarding wizard, disjoint setup flow, project foundation

**Participant Invite**:
An invitation for a user to join the project as a Developer or SME Reviewer.
_Avoid_: One-time onboarding-only user

**Project Settings**:
The long-lived configuration surfaces for project identity, trace source, participants, rubric, judge, and sprint defaults.
_Avoid_: One-time onboarding

**Setup Requirement**:
A setting or artifact that must be completed before a dependent setup step can run.
_Avoid_: Optional onboarding task

**Workflow**:
A guided sequence of project or sprint configuration actions with prerequisites that determine what can happen next.
_Avoid_: Readiness graph, onboarding wizard, page-local checklist, ad hoc validation

**Workflow Shell**:
The guided container that presents progress, prerequisites, blockers, and next actions while reusing durable settings sections.
_Avoid_: Disjoint wizard, unrelated setup page

**Sprint Creation**:
The workflow for launching a bounded evaluation or judge-calibration run from existing project artifacts.
_Avoid_: Project setup, generic settings

**Sprint**:
A bounded goal-tracking container for evaluation activity and metric movement.
_Avoid_: Workshop, phase state machine, runtime container

**System Version**:
The version of the system under review, such as the agent model, prompt, tools, retrieval config, or application code.
_Avoid_: Judge version

## Relationships

- A **Project** owns the durable settings and artifacts used by the judge calibration loop.
- The V2 product narrative is organized around **CUJs**, not implementation phases.
- The **Active Learning Judge** primarily optimizes the CUJs for criteria elicitation, SME disagreement diagnosis, and judge alignment.
- Implementation slices should align to **CUJs** even when a slice spans multiple artifacts.
- V2 uses three primary roles: **Developer**, **SME Reviewer**, and **Judge Optimizer**.
- The **Agent Interface** is shared across trace summarization, Review Feed active selection, Grading recommendations, Evaluation Confidence explanations, and Discussion Layer questions.
- The **Judge Optimizer** may ask SME Reviewers questions directly in the **Discussion Layer** when active learning identifies uncertainty that human judgement can resolve.
- **Select Evaluation Traces** provides the system context and trace set used by later criteria, labeling, and judge alignment work.
- **Select Evaluation Traces** is evergreen: projects may create new **Datasets** for setup, sprints, monitoring, active learning, or audit.
- A **Review Feed** is used to gather SME feedback and populate or refine a **Dataset**.
- The **Review Feed** can be updated as themes, rubric gaps, or judge uncertainty emerge.
- **Curate Review Feed** is the canonical CUJ for selecting traces, targeting review questions, and building datasets over time.
- **Elicit Rubric Criteria** produces the concrete rubric criteria used by later review and judge alignment work.
- **Rubric-Based Evaluation** avoids vague holistic scoring by decomposing judgment into explicit **Criteria**.
- **Grading** is the user-facing place where SME judgement on examples becomes AI judgement and alignment evidence.
- **Grading** contains **Rubrics**, **Assessments**, **Rubric Results**, and judge alignment context.
- **Workspace** summarizes SME activity, rubric activity, judge activity, production status, lifecycle position, and how feedback flowed into rubric and judge versions.
- **Evaluation Lifecycle** is the organizing concept for **Workspace**.
- **Workspace** is an **Activity Monitor** for **Evaluation Goals**, not a state machine.
- **Evaluation Goals** are monitored like training-run metrics rather than completed as rigid workflow stages.
- Grading activity should happen directly in the **Review Feed** where possible, because the **Discussion Layer** is the substrate for human judgement.
- The **Discussion Pane** may also appear in **Grading**, especially around rubric criteria or rubric versions.
- **Rubric Lineage** connects existing domain objects such as traces, spans, discussion threads, criteria, rubric versions, judge versions, assessments, and proposed changes.
- Domain objects carry their own metadata, such as creation time, creator or generating process, model version, and relevant content.
- **Lineage** is cross-cutting across Review Feed, Grading, Discussion Layer, Evaluation Confidence, and Evaluation Ops.
- A **Rubric** may compose binary and scalar **Criteria** into higher-level concepts.
- **Atomic Criteria** are preferred because they reduce cognitive load and improve human-human and human-judge agreement.
- A **Composite Criterion** such as financial literacy may be judged from multiple binary criteria plus a scalar criterion.
- A **Hurdle Criterion** can prevent reward hacking by requiring a core task objective before other scores matter.
- The **Rubric Gap** is why SME Reviewer judgement is required for rubric authorship and revision.
- **Rubric Quality** must be assessed separately from judge performance; a judge can only apply the rubric it is given.
- The **Rubric API** can create and coordinate multiple underlying judges while presenting one interface to the Developer.
- A **Rubric** is the concrete versioned interface that collects criteria, underlying judges, and scores.
- A **Rubric Result** may include outputs from one or many underlying judges.
- **Continuous Judge Alignment** happens from accumulated feedback and should not require a user to start a separate alignment phase.
- **Judge Confidence** depends on both judge behavior and the quality of **Codified Judgment**; decreasing human agreement limits confidence in the judge.
- **Rubric Feedback** may reference traces, criteria, scores, judge rationales, or discussion context.
- The **Discussion Layer** is the unified elicitation surface for SME dialogue and evolving rubric context.
- The **Discussion Pane** appears beside the Review Feed and may also appear beside Rubric work.
- A **Discussion Comment** can target a trace, criterion, judge rationale, another comment, or proposed rubric change.
- **Codified Judgment** is the SME signal used by the active-learning judge to reduce uncertainty and improve alignment.
- **Codify SME Judgement** is the canonical CUJ for collecting SME signal through rubric-contextual scoring, reactions, rationales, and discussion.
- **Improve Evaluation Confidence** depends on rubric quality, SME agreement, judge alignment, uncertainty, and remaining SME feedback needs.
- **Run Evaluation Ops** extends evaluation confidence into production monitoring, lineage, audit, drift, and ongoing SME re-engagement.
- **MLflow Feedback** is an export/interoperability shape; it does not replace **Rubric Feedback** because it cannot fully represent SME dialogue or the rubric criteria humans used.
- **Setup** is a prerequisite workflow for entering the CUJs, not a canonical CUJ itself.
- **Setup** requires project identity, system under review context, trace source access, initial Developer identity, and participant invites before the first **Review Feed** can operate.
- **Setup** may populate draft/default state for the next CUJ, such as a starter **Review Feed**, but the Developer can tweak it before use.
- A **Per-Example Rubric** is valid in eval mode when an example has an explicit reference outcome.
- **Setup** guides a facilitator through required parts of **Project Settings**.
- **Project Settings** remain editable after **Setup** is complete.
- A **Setup Requirement** can unlock another **Setup Requirement**.
- A **Workflow** governs **Setup** and later sprint creation flows.
- A **Workflow Shell** can guide users through existing **Project Settings** without replacing those settings.
- **Setup** and **Sprint Creation** are sibling **Workflows**.
- A **Sprint** tracks goals, activity, metric trajectories, and snapshots over a bounded window.
- A **Sprint** coordinates evaluation activity with changes to the **System Version**.
- A workshop is a short **Sprint**, not the canonical V2 container.
- **Sprint Creation** depends on existing project artifacts such as traces, rubric, judge, and participants.
- A project description is a **Setup Requirement** for generating a draft rubric.
- A selected MLflow experiment is a **Setup Requirement** for creating a trace pool.
- A draft rubric and judge are **Setup Requirements** for sampling strategies that depend on judge scoring.

## Example Dialogue

> **Dev:** "Should setup have its own separate wizard pages?"
> **Domain expert:** "No — setup should walk me through the same settings I can return to later."

> **Dev:** "Is setup one of the core CUJs?"
> **Domain expert:** "No — setup prepares a project to enter the core CUJs."

> **Dev:** "Can users configure sampling before choosing traces and drafting a judge?"
> **Domain expert:** "Only for sampling strategies that do not depend on those artifacts; setup should gate dependent strategies until requirements are complete."

> **Dev:** "Is prerequisite gating only for setup?"
> **Domain expert:** "No — sprint creation also depends on completed project artifacts, so workflows should model prerequisites consistently."

> **Dev:** "Is sprint creation just another settings page?"
> **Domain expert:** "No — it is a workflow that uses existing settings and artifacts to launch a bounded run."

> **Dev:** "Does setup need separate forms from settings?"
> **Domain expert:** "No — setup should use a workflow shell over the same settings sections users can revisit later."

> **Dev:** "Should we describe the project as one judge-training loop?"
> **Domain expert:** "No — describe the product in terms of CUJs, then name the workflows and actions inside those journeys."

> **Dev:** "Is the facilitator a separate V2 role?"
> **Domain expert:** "No — simplify V2 around Developer, SME Reviewer, and Judge Optimizer."

> **Dev:** "Is trace selection just choosing rows from MLflow?"
> **Domain expert:** "No — the Developer first establishes what system is under review, then selects diverse or targeted traces such as traces with heavy tool use."

> **Dev:** "Is trace selection only part of first-run setup?"
> **Domain expert:** "No — selecting datasets recurs throughout the project as the system learns, production shifts, and new questions arise."

> **Dev:** "Do we create a dataset first and then show it as a feed?"
> **Domain expert:** "Usually the feed is the better operating model: start with a few traces, learn from SME feedback, add targeted examples, and let the dataset emerge from that process."

> **Dev:** "Does each rubric question always map to exactly one judge?"
> **Domain expert:** "No — the public interface should be a rubric API that can create one or many underlying judges depending on the rubric composition."

> **Dev:** "Can a criterion exist without source evidence?"
> **Domain expert:** "It can be authored directly, but the product should preserve lineage when a criterion comes from examples or SME discussion."

> **Dev:** "Does the Developer explicitly start judge alignment?"
> **Domain expert:** "No — judge alignment should happen continuously from feedback; the user needs confidence, evidence, and guidance on what SME input is still needed."

> **Dev:** "Is feedback only attached to an MLflow trace?"
> **Domain expert:** "No — trace-level feedback is not enough for long-form discussion or evolving rubric context; feedback should be interpreted through the rubric and discussion context."

> **Dev:** "Can MLflow feedback be the native feedback model?"
> **Domain expert:** "No — MLflow feedback is useful for interop, but it only captures judge name, score, rationale, source, and metadata, not the SME dialogue or rubric criteria context."

> **Dev:** "Are SMEs just labeling traces?"
> **Domain expert:** "No — SMEs are codifying judgment in rubric and discussion context so the Judge Optimizer can learn from it."

## Flagged Ambiguities

- "onboarding wizard" was used for project creation, but the resolved term is **Setup**: a guided pass through durable **Project Settings**, not a separate one-time flow.
- "train judge from SME feedback loop" was used as an umbrella phrase, but the resolved framing is **CUJ**-based: the project contains multiple critical journeys, and judge retuning is only one action inside them.
