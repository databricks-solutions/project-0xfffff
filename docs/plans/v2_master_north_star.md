# V2 Master North Star

## Purpose

V2 is a project-based system for building and operating rubric-based evaluation with SME judgement and active-learning judge optimization. The product is not a one-time workshop or a standalone judge-training wizard. It is a long-lived project workflow that curates evidence, elicits rubric criteria, codifies expert judgement, improves evaluation confidence, and operates the evaluation system in production.

This document is the semantic north star for V2 naming, user journeys, and product slices. Existing PRDs and architecture notes may be revised later to align with this vocabulary.

## Primary Roles

**Developer**

The project owner who configures traces, rubrics, judges, workflows, and deployment decisions. This role replaces the older "facilitator" framing in V2.

**SME Reviewer**

The human reviewer who provides domain judgement through rubric-contextual scores, rationales, reactions, and discussion.

**Judge Optimizer**

The agentic AI actor that ranks feedback opportunities, proposes rubric or judge changes, and recommends next actions.

**Agent Interface**

The shared interface for agentic behavior across trace summarization, active learning, recommendations, explanations, and discussion participation. The same interface that summarizes traces should also support Review Feed active selection, Grading recommendations, Evaluation Confidence explanations, and direct questions to SME Reviewers in the Discussion Layer.

## Core Product Model

**Project**

The long-lived container for configuring and operating the rubric-based evaluation loop for one app or evaluated system.

**System Under Review**

The agentic app or AI system whose behavior is being evaluated by the project.

**Rubric**

The concrete, versioned interface for evaluation. A rubric composes criteria, judging plans, underlying judges, scores, rationales, and feedback context.

**Criterion**

A discrete scoring condition within a rubric. Criteria may be binary, scalar, Likert, weighted, hurdle, or composite. Binary atomic criteria are often preferred for reliability, but they are not the only valid form.

**Rubric API**

The public interface for creating, applying, and improving rubric-based judges from human feedback. The Rubric API may coordinate one or many underlying judges while presenting one coherent rubric interface to the Developer.

**Grading**

The product surface where rubric criteria, human assessments, AI assessments, and alignment evidence come together. Grading is where SME judgement on an example becomes AI judgement and evidence about whether the rubric-based evaluation system is improving.

Grading must preserve rubric lineage. A rubric criterion or version should be traceable back to the Review Feed examples, trace spans, Discussion Comments, and SME judgements that motivated it. For example, a criterion such as "query considers the top quartile of customers" should link back to the source examples, spans, and discussion that produced that judgement.

Lineage is bidirectional. From a criterion, a Developer should be able to inspect its source objects. From a trace or discussion thread, a Developer should be able to see which criteria, assessments, or proposed changes it influenced.

Keep the model simple: lineage connects existing domain objects, such as traces, spans, discussion threads, criteria, rubric versions, judge versions, assessments, and proposed changes. Those objects carry their own metadata, such as creation time, creator or generating process, model or judge version, and relevant content. We should not introduce separate evidence, provenance, or lineage-object models until the product needs them.

Lineage is cross-cutting. It is not owned only by Grading; Review Feed, Discussion Layer, Improve Evaluation Confidence, and Run Evaluation Ops all create or consume lineage.

**Workspace**

The Developer control surface for seeing where the project is in the overall evaluation lifecycle. Workspace should not be a catch-all dashboard. Its north-star job is to show the active cycle: SME activity, rubric activity, judge activity, production status, and how SME feedback has flowed into rubric versions and judge versions that are running in production.

The Evaluation Lifecycle is the Workspace spine:

```text
Review Feed -> SME Judgement -> Grading / Rubric Version -> Judge Version -> Production Evaluation
```

Workspace should render this as an activity monitor, not a state machine. The Developer sets goals such as human agreement, judge agreement, construct validity, and confidence. Workspace shows how the project is moving toward those goals, similar to monitoring a training run, rather than declaring that a phase is complete when a fixed number of labels has been collected.

Grading activity should happen directly in the Review Feed wherever possible, because the Discussion Layer is the substrate for human judgement. The Grading surface still owns rubric, assessment, and alignment context, and may also need a Discussion Pane, especially for rubric criteria and rubric versions.

**Discussion Layer**

The comment-thread surface where SME Reviewers, judges, and the Judge Optimizer exchange reasoning, reactions, and proposed changes. This is the native SME dialogue model; MLflow feedback is an interoperability/export shape, not the product's full feedback model.

The Discussion Layer should usually render as a companion pane, especially beside the Review Feed and potentially beside Rubric work, rather than as a standalone primary destination by default.

## Canonical CUJs

### 1. Curate Review Feed

The Developer and Judge Optimizer build an evolving feed of traces and questions for SME feedback.

The Review Feed is the operating model. Datasets are artifacts that emerge from the feed as traces are reviewed, discussed, and used for rubric elicitation, judge alignment, monitoring, or audit. A project may start with a small diverse starter feed, then add targeted examples as themes, rubric gaps, or judge uncertainty emerge.

Examples:

- Start with a handful of diverse traces from an MLflow experiment.
- Add traces with heavy tool use.
- Add examples where the judge is uncertain about "emotional escalation."
- Add examples matching a newly discovered theme, such as the agent needing more context before issuing SQL.

### 2. Elicit Rubric Criteria

The Developer and Judge Optimizer use SME feedback from the evaluation feed to discover, draft, refine, and organize rubric criteria.

The concrete takeaway is the rubric. The strategic advantage is that criteria come from SME judgement rather than developer-only iteration or fully model-generated rubrics. LLMs may draft, cluster, and propose, but SME judgement is required to close the rubric gap.

### 3. Codify SME Judgement

SME Reviewers express domain judgement through the rubric and Discussion Layer so the Judge Optimizer can learn from it.

This is not merely labeling or annotation. SME Reviewers codify judgement through scores, rationales, reactions, discussion comments, changed-mind signals, unresolved disagreements, and feedback on judge reasoning. The Discussion Layer is the substrate the active-learning judge uses to reduce uncertainty.

### 4. Improve Evaluation Confidence

The Developer and Judge Optimizer measure and improve trust in the rubric-based evaluation system.

Evaluation confidence depends on rubric quality, SME agreement, judge alignment, uncertainty, and the remaining SME feedback needed. The core questions are:

- Are SME Reviewers becoming more consistent?
- Is the judge agreeing with SME judgement more often?
- Which criteria are unstable or ambiguous?
- Where is the judge uncertain?
- What additional examples or questions should go back into the Review Feed?
- How do we know the evaluation system is better, not just more confident?

### 5. Run Evaluation Ops

The Developer runs the production ops loop for the rubric-based evaluation system.

This extends evaluation confidence into production monitoring, lineage, audit, drift, and ongoing SME re-engagement. The project should help decide whether production issues require more SME judgement, rubric revision, judge improvement, or model remediation.

## Workflow Semantics

**Setup** is a prerequisite workflow, not a canonical CUJ and not an onboarding wizard. It guides the Developer through the settings and artifacts required before a project can enter the core CUJs.

Setup should complete the minimum required to start the first Review Feed:

- Project name
- System under review description
- MLflow experiment or trace source access
- Initial Developer identity and permissions
- Participant invites for SME Reviewers or additional Developers
- Enough trace access to produce a starter Review Feed

Setup may populate draft/default state for the next CUJ. For example, it can produce a starter Review Feed draft that the Developer tweaks before use.

**Sprint Creation** is another workflow. It launches a bounded evaluation or calibration run from existing project artifacts.

**Sprint** is a bounded goal-tracking container for evaluation activity and metric movement. It tracks goals, activity, metric trajectories, and snapshots over a bounded window. A sprint also coordinates evaluation work with changes to the system under review, such as the agent model, prompt, tools, retrieval config, or application code. A workshop is a short sprint, not the canonical V2 container.

In the workshop setting, the sprint goals are to increase human agreement, judge-human agreement, judge confidence, and construct validity. Setup bootstraps a baseline rubric and judge when none exist yet. The workshop sprint then improves those baseline metrics through Review Feed activity, SME judgement, Grading, and judge optimization.

The Workspace for a workshop sprint should act as the control surface. A useful north-star layout is:

```text
App / system description header
  -> points to the system version or detail page

Data Source -> Review Feed -> Grading -> Confidence
```

The left-to-right flow should make clear what needs to happen to improve the final outcome: trace source and starter data, Review Feed activity and human agreement, Grading activity and judge-human agreement, then confidence and construct-validity signals.

Workflows should align to CUJs and their prerequisites, but they should reuse durable settings and artifacts rather than creating disconnected setup-only forms.

## Rubric, Judge, And Feedback Boundaries

Rubric-based evaluation should avoid vague holistic scoring by decomposing judgement into explicit criteria. Criteria should be clear, measurable, interpretable, and valid for the task. Some criteria are atomic; some are composite; some may be hurdles that gate further scoring.

The judge is not the public product interface. The rubric is. A rubric may produce a judging plan that uses one judge call, multiple underlying judges, or a hybrid strategy.

Human feedback should be rubric-contextual. Feedback may target a trace, criterion, criterion result, composite result, judge rationale, discussion thread, or proposed rubric change. MLflow feedback can receive exported score/rationale/source records, but it cannot represent the full SME dialogue or evolving rubric context.

## Slice Alignment

Implementation slices should map back to the CUJs even when they span multiple artifacts. The active-learning judge core primarily optimizes:

- **Elicit Rubric Criteria**
- **Codify SME Judgement**
- **Improve Evaluation Confidence**

**Curate Review Feed** is the upstream evidence engine. **Run Evaluation Ops** is the downstream ops loop.
