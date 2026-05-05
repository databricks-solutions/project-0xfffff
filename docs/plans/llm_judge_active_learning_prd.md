# PRD: Active-Learning LLM Judge System for Production Quality Monitoring

## 1. Executive Summary

This product creates and maintains LLM-based judges for evaluating production model quality. It starts with a workshop workflow where a baseline, unoptimized judge scores examples; SMEs independently review those examples; and then SMEs react to the judge's score, rationale, and memory usage. This shifts judge misalignment detection earlier in the process and makes judge optimization more sample-efficient.

After launch, the system monitors production logs using calibrated judges, samples the most informative examples for SME review, and decides whether observed issues require model retraining, judge retraining, rubric revision, or SME re-engagement.

The system treats judges not as static artifacts, but as production measurement systems under continuous calibration.

Core thesis:

> Model retraining fixes bad answers. Judge retraining fixes bad measurement. Rubric revision fixes missing concepts. SME re-engagement resolves uncertainty about which one is happening.

---

## 2. Problem Statement

Customers who run rubric creation, annotation, and judge-alignment workshops often ask:

1. How do we know the judges are good in production?
2. When do we retrain the model?
3. When do we retrain the judges?
4. When do we re-engage SMEs?

Existing evaluation workflows often assume that once SMEs create a rubric and align a judge, the judge is ready for production use. In practice, this is insufficient because:

- SMEs disagree in nuanced ways.
- Mode aggregation can erase important disagreement structure.
- Rubric dimensions are human-designed approximations and may not cover future production failure modes.
- Judges can be confidently wrong.
- Production examples may differ meaningfully from workshop examples.
- SME attention is scarce and non-compulsory.
- Judge memories distilled from SME feedback can be wrong, overbroad, underspecified, or stale.

The product must therefore support a full operating loop: create judges, align them, monitor them, sample production examples efficiently, re-engage SMEs selectively, and update the model/judge/rubric system based on evidence.

---

## 3. Goals

### 3.1 Workshop Goals

- Use a baseline judge to pre-score examples before SME review.
- Preserve independent SME signal through blind first-pass review.
- Let SMEs react directly to the judge's scores, rationales, rubric attribution, and memory usage.
- Extract more than labels: rationales, disagreement structure, memory patches, missing dimensions, and judge error types.
- Produce an optimized judge and initial operating baseline.

### 3.2 Production Goals

- Monitor whether judges remain valid on production data.
- Detect whether quality issues are caused by model drift, judge miscalibration, rubric gaps, or policy ambiguity.
- Sample production examples efficiently for SME review.
- Route the right example, with the right question, to the right SME.
- Convert SME feedback into model patches, judge patches, rubric revisions, and memory updates.
- Maintain long-term judge quality with minimal SME burden.

### 3.3 Business Goals

- Give customers confidence that judges remain reliable after deployment.
- Reduce cost of SME review by prioritizing high-value feedback.
- Shorten the loop between production failures and corrective action.
- Make SME participation more engaging and less like bulk labeling.
- Provide clear operational answers for model retraining, judge retraining, and SME re-engagement.

---

## 4. Non-Goals

This product does not attempt to:

- Fully automate all SME judgment.
- Force consensus where real policy or value disagreement exists.
- Treat mode labels as ground truth.
- Replace production monitoring, user feedback, or business outcome metrics.
- Use social engagement mechanics without safeguards against groupthink or popularity bias.
- Run model retraining automatically without human or customer-approved governance.

---

## 5. Personas

### 5.1 Evaluation Lead

Owns the customer evaluation program, judge quality, and production monitoring. Needs dashboards, confidence metrics, failure taxonomies, and clear action recommendations.

### 5.2 SME / Domain Expert

Provides expert feedback on examples, judge rationales, rubric dimensions, and proposed memory updates. Needs low-friction, high-impact review experiences.

### 5.3 ML / AI Engineer

Uses judge and SME feedback to retrain models, improve prompts, update retrieval systems, and patch production behavior.

### 5.4 Customer Stakeholder

Needs confidence that the deployed model is being measured accurately and improved when needed.

### 5.5 Judge Optimizer Agent

An automated system that analyzes judge/SME disagreement, proposes memory updates, selects production examples, asks targeted questions, and recommends actions.

---

## 6. Key Concepts

### 6.1 Baseline Judge

An unoptimized or lightly configured judge used before SME review. Its purpose is not to be correct. Its purpose is to generate an initial hypothesis that SMEs can critique.

### 6.2 Blind SME Review

The SME first reviews an example without seeing the judge's output. This preserves independent human signal and avoids anchoring.

### 6.3 Judge Reaction Review

After blind review, the SME sees the judge score, rationale, rubric attribution, confidence, and memory trace. The SME reacts to the judge's reasoning.

### 6.4 Episodic Memory

Concrete precedents extracted from SME feedback.

Example:

> In this case, recommending an ER visit was correct because symptoms indicated urgent risk.

### 6.5 Semantic Memory

Generalized rules distilled from SME feedback.

Example:

> In emergency triage cases, direct ER recommendations should not be penalized for tone when urgency is clinically justified.

### 6.6 Memory Patch

A proposed update to judge memory based on SME correction.

Example:

> Prior rule was too broad. Add exception: do not recommend ER for mild symptoms without red flags.

### 6.7 Rubric Coverage Gap

A case where the existing judge dimensions do not capture an important quality issue.

Example:

> Existing dimensions cover correctness, usefulness, and tone, but production examples reveal a missing dimension: triage justification.

### 6.8 Confident Wrongness

A high-value feedback pattern where the judge is confident, but SMEs or other signals suggest the judge is wrong.

### 6.9 Active Questioning

The system does not merely select examples for labeling. It selects an example, a specific question, and a specific SME.

---

## 7. End-to-End Workflow

## 7.1 Phase 1: Baseline Judge Pre-Scoring

The system runs a baseline judge on an initial set of n workshop examples.

For each example, the judge produces:

- Rubric dimension scores
- Overall score
- Confidence
- Rationale
- Applied rubric dimensions
- Retrieved episodic memories, if any
- Applied semantic memories, if any
- Uncertainty or coverage-gap flags

Example judge output:

```text
Correctness: 5/5
Tone: 2/5
Overall: 4/5
Rationale: The answer correctly recommends emergency care, but the language may be alarming.
Applied memory: "Use calm tone in high-stress user interactions."
Confidence: High
```

The baseline judge output is hidden from SMEs during the blind pass.

---

## 7.2 Phase 2: SME Blind Review

SMEs independently review each example before seeing judge output.

Required SME inputs:

- Dimension scores
- Overall score
- Primary issue
- Confidence
- Short rationale
- Missing-dimension flag

Optional SME inputs:

- Suggested rubric change
- Suggested memory rule
- Counterexample
- Escalation flag

Purpose:

- Preserve independent SME signal.
- Measure SME disagreement.
- Avoid anchoring SMEs on the baseline judge.
- Create a ground signal for judge critique.

---

## 7.3 Phase 3: Reveal Judge Output

After blind review, the SME sees:

- Judge score
- Judge rationale
- Judge confidence
- Rubric dimension attribution
- Retrieved episodic memory
- Applied semantic memory
- Proposed reasoning chain or summary

The UI frames this as:

> The judge interpreted the example this way. Do you agree?

---

## 7.4 Phase 4: SME Reacts to Judge

SMEs react to the judge's output using structured actions.

Possible reactions:

- Agree
- Disagree
- Score too high
- Score too low
- Right score, wrong reason
- Wrong rubric dimension
- Missing rubric dimension
- Bad memory retrieval
- Semantic memory too broad
- Semantic memory too narrow
- Missing exception
- Needs another SME
- Unresolved policy disagreement

Example:

```text
Judge: This is good medical advice because it recommends ER care.
SME: Disagree. ER recommendation is too aggressive here because there are no red-flag symptoms.
Error type: Semantic memory too broad.
Suggested patch: Recommend ER only when red flags or serious risk indicators are present.
```

This turns the initial annotation phase into a judge-debugging workflow.

---

## 7.5 Phase 5: Discussion and Structured Deliberation

After independent review and judge reaction, SMEs may participate in a discussion thread.

The system supports:

- Comments
- Replies
- Typed reactions
- Proposed memory diffs
- Proposed rubric updates
- Changed-my-mind events
- Unresolved disagreement flags

Typed reactions replace generic likes.

Examples:

- Agree
- Disagree
- Useful distinction
- Too broad
- Too narrow
- Changed my mind
- Missing dimension
- Needs policy owner

The system should preserve:

- Pre-discussion score
- Post-discussion score
- Rationale changes
- Which arguments changed minds
- Minority views
- Policy disagreements

The goal is not to force consensus. The goal is to capture the structure of disagreement.

---

## 7.6 Phase 6: Judge Optimization

The optimizer uses SME feedback to update:

- Judge prompts
- Judge calibration
- Dimension definitions
- Episodic memories
- Semantic memories
- Priority rules
- Counterexamples
- Rubric coverage model
- SME reliability profiles

For each disagreement, the optimizer classifies the failure:

- Model output was bad; judge was right
- Judge score was wrong
- Judge rationale was wrong
- Judge applied wrong rubric dimension
- Judge retrieved wrong memory
- Semantic memory was too broad
- Semantic memory was too narrow
- Existing rubric missed a concept
- SMEs had real policy disagreement

The optimizer produces proposed memory diffs rather than silently rewriting judge behavior.

Example memory diff:

```text
Before:
"Recommending ER is appropriate when symptoms may indicate serious risk."

After:
"Recommending ER is appropriate when symptoms indicate plausible serious or time-sensitive risk. However, the response should avoid overstating certainty, explain the basis for urgency when possible, and avoid ER recommendations for low-risk symptoms without red flags."

Scope:
Medical triage responses.

Counterexample:
Mild symptoms without red flags should not trigger ER recommendation.

Reason for patch:
Physician SME corrected an overbroad ER recommendation.
```

---

## 7.7 Phase 7: Production Monitoring

After deployment, production logs are scored by the optimized judge.

For each production example, the system records:

- Model input
- Model output
- Model version
- Judge version
- Judge scores by dimension
- Judge confidence
- Judge rationale
- Judge memory trace
- Input/output embeddings
- Cluster assignment
- User feedback, if available
- Business outcome signals, if available
- Drift and uncertainty signals

The system monitors:

- Score distribution drift
- Input distribution drift
- Output distribution drift
- Judge uncertainty
- Judge entropy
- Repeated-run variance
- Judge disagreement
- Coverage-gap suspicion
- Novel production clusters
- User-feedback mismatch
- Business-metric mismatch
- Anchor-set regression

---

## 7.8 Phase 8: Production Sampling for SME Review

The system selects production examples using an acquisition score.

The unit of selection is:

```text
example + question + SME
```

Not merely:

```text
example to label
```

Candidate value is based on:

- Expected information gain
- Probability of model drift
- Probability of judge drift
- Probability of rubric coverage gap
- Severity or business importance
- Judge uncertainty
- Judge confident wrongness
- Cluster novelty
- Representativeness
- SME expertise match
- SME engagement likelihood
- Fatigue cost
- Redundancy penalty

High-value example types:

1. Judge is uncertain.
2. Judge is highly confident but likely wrong.
3. Multiple judges disagree.
4. Example is from a novel production cluster.
5. Existing rubric scores look fine, but holistic quality or user signal is bad.
6. Example has high severity or business impact.
7. Example represents a large production cluster.
8. Example triggers conflicting judge memories.

Sampling should include a small random or stratified audit stream to avoid bias.

Recommended sampling mix:

- 40% high decision-value active-learning examples
- 20% confident-wrongness examples
- 15% novel cluster representatives
- 10% rubric coverage-gap examples
- 10% random or stratified audit examples
- 5% calibration/anchor examples

---

## 7.9 Phase 9: Active SME Questioning

The judge optimizer chooses the best question to ask a specific SME.

Question types:

### Label Question

> What correctness score would you give this response?

### Judge Agreement Question

> The judge rated this as 5/5 correctness with high confidence. Do you agree?

### Memory Applicability Question

> The judge applied this precedent: “ER recommendation was correct in similar cases.” Does that precedent apply here?

### Semantic Memory Validation

> The judge used the rule: “Use calm tone in high-stress cases.” Should this rule apply here?

### Conflict Resolution

> Two memories conflict: direct emergency guidance may be necessary, but calm tone is preferred. Which should dominate here?

### Rubric Coverage Question

> Does this example contain an important quality issue not captured by the current rubric dimensions?

### Proposed Memory Diff Review

> The optimizer proposes this memory update. Should we accept, edit, narrow, broaden, or reject it?

The system prioritizes questions that are likely to change a decision.

---

## 7.10 Phase 10: Action Recommendation

After SME feedback, the system recommends one of the following actions:

- No action
- Retrain model
- Patch model prompt
- Improve retrieval
- Add guardrail
- Retrain judge
- Update judge memory
- Add judge counterexamples
- Add rubric dimension
- Split rubric dimension
- Preserve policy disagreement
- Escalate to policy owner
- Re-engage more SMEs

---

## 8. Decision Rules

## 8.1 How Do We Know Judges Are Good in Production?

Judges are considered production-valid when:

- They remain calibrated against fresh SME-reviewed production examples.
- They perform consistently on stable anchor examples.
- They maintain acceptable agreement by rubric dimension.
- They do not show growing blind spots in new production clusters.
- Their confidence correlates with correctness.
- Their rationales match SME reasoning.
- Their memory retrieval is appropriate.
- Their disagreement with user/business signals is explainable.

Workshop agreement indicates launch readiness. Production audit agreement indicates ongoing trust.

---

## 8.2 When Do We Retrain the Model?

Retrain or patch the model when:

- SMEs confirm the judge is correctly identifying bad outputs.
- Production failure rate increases.
- Failures cluster around a topic, workflow, user segment, or input type.
- The same failure appears repeatedly.
- Judge rationale is sound.
- Existing rubric captures the issue.
- The model is failing, not the measurement system.

Rule of thumb:

> If SMEs say “the judge is right; the model answer is bad,” retrain or patch the model.

Potential actions:

- Fine-tune model
- Add training examples
- Improve retrieval
- Patch prompt
- Add workflow-specific guardrails
- Add tool-use constraints
- Create targeted evals

---

## 8.3 When Do We Retrain the Judge?

Retrain or recalibrate the judge when:

- SMEs disagree with judge scores on production examples.
- Model output is acceptable, but judge scores it incorrectly.
- Judge applies the wrong rubric dimension.
- Judge gives right score for wrong reason.
- Judge over-penalizes or under-penalizes behavior.
- Judge is confidently wrong.
- Judge memory is wrong, stale, too broad, or too narrow.
- Judge performance regresses on anchor examples.

Rule of thumb:

> If SMEs say “the model answer is okay, but the judge misunderstood it,” retrain or patch the judge.

Potential actions:

- Add counterexamples
- Update semantic memory
- Add episodic precedents
- Rewrite rubric instructions
- Split judge into multiple judges
- Add new judge dimension
- Reweight dimensions
- Improve judge prompt

---

## 8.4 When Do We Revise the Rubric?

Revise the rubric when:

- SMEs repeatedly identify issues not captured by existing dimensions.
- Holistic scores disagree with all dimension scores.
- Comment threads repeatedly say “this is not really correctness/usefulness/tone.”
- Production examples reveal a recurring missing quality concept.
- Current dimensions are too broad or entangled.

Rule of thumb:

> If the judge is not exactly wrong but lacks the right concept, revise the rubric or add a judge.

Potential actions:

- Add new dimension
- Split existing dimension
- Add priority rule
- Add coverage-gap judge
- Backfill labels for representative examples
- Re-run judge alignment

---

## 8.5 When Do We Re-Engage SMEs?

Re-engage SMEs when their feedback is expected to change a decision.

Triggers:

- Production distribution shifts into new clusters.
- Judge uncertainty increases.
- Judge and user feedback disagree.
- Judge and business outcomes disagree.
- A model or judge retraining decision is being considered.
- There is suspected rubric coverage gap.
- A high-risk failure mode appears.
- SME disagreement itself appears meaningful.
- Anchor examples no longer represent production behavior.
- Proposed memory updates need approval.

Rule of thumb:

> Re-engage SMEs when automation cannot confidently determine whether the problem is model failure, judge failure, rubric gap, or policy ambiguity.

---

## 9. Functional Requirements

## 9.1 Baseline Judge Scoring

The system must:

- Run a baseline judge over selected workshop examples.
- Generate dimension scores, rationales, confidence, and memory traces.
- Store judge output separately from SME blind review.
- Version the baseline judge.

## 9.2 SME Blind Review

The system must:

- Hide judge output during initial SME review.
- Capture scores, rationales, confidence, and missing-dimension flags.
- Support multiple SMEs per example.
- Preserve timestamps and review order.

## 9.3 Judge Reveal and Reaction

The system must:

- Reveal judge output only after blind review.
- Let SMEs react to score, rationale, rubric dimension, and memory usage.
- Capture structured error types.
- Allow SMEs to suggest memory or rubric updates.

## 9.4 Discussion Layer

The system should:

- Support comments and replies.
- Support typed reactions instead of generic likes.
- Preserve pre-discussion and post-discussion judgments.
- Track changed-mind events.
- Capture unresolved disagreements.

## 9.5 Memory Management

The system must:

- Store episodic memories.
- Store semantic memories.
- Attach provenance to each memory.
- Support proposed memory diffs.
- Track memory scope, exceptions, counterexamples, and confidence.
- Version memory updates.
- Support rollback.

## 9.6 Judge Optimization

The system must:

- Classify judge/SME disagreement by failure type.
- Generate proposed judge patches.
- Generate proposed memory patches.
- Generate proposed rubric updates.
- Run regression tests on anchor examples before promotion.
- Version optimized judges.

## 9.7 Production Monitoring

The system must:

- Score production logs with versioned judges.
- Track judge scores, confidence, rationales, and memory traces.
- Detect distribution changes and uncertainty changes.
- Identify novel clusters.
- Maintain random audit streams.
- Track anchor-set performance.

## 9.8 Active Sampling

The system must:

- Rank production examples for SME review.
- Include uncertainty, novelty, severity, and coverage-gap signals.
- Penalize redundancy.
- Support stratified random sampling.
- Select representative examples from clusters.

## 9.9 Active Questioning

The system must:

- Generate question candidates for each example.
- Route questions to SMEs based on expertise and engagement profile.
- Score example/question/SME triples.
- Ask targeted questions rather than generic labeling requests.

## 9.10 Action Recommendation

The system must:

- Classify feedback into model failure, judge failure, rubric gap, policy ambiguity, or no issue.
- Recommend next action.
- Provide evidence for recommendation.
- Track resolution status.

---

## 10. Data Model

## 10.1 Example

Fields:

- example_id
- input
- output
- model_version
- production_context
- metadata
- embeddings
- cluster_id
- risk/severity score

## 10.2 Judge Output

Fields:

- judge_output_id
- example_id
- judge_version
- dimension_scores
- overall_score
- confidence
- rationale
- uncertainty
- applied_rubric_dimensions
- retrieved_memories
- proposed_memories
- timestamp

## 10.3 SME Review

Fields:

- review_id
- example_id
- sme_id
- blind_scores
- blind_rationale
- confidence
- primary_issue
- missing_dimension_flag
- timestamp

## 10.4 SME Judge Reaction

Fields:

- reaction_id
- review_id
- judge_output_id
- agreement_status
- score_reaction
- rationale_reaction
- error_type
- corrected_rationale
- proposed_memory_patch
- proposed_rubric_patch
- needs_escalation

## 10.5 Discussion Comment

Fields:

- comment_id
- example_id
- sme_id
- parent_comment_id
- comment_text
- claim_type
- stance
- typed_reactions
- changed_mind_marker
- timestamp

## 10.6 Memory Object

Fields:

- memory_id
- memory_type: episodic | semantic
- content
- scope
- exceptions
- counterexamples
- supporting_examples
- supporting_comments
- dissenting_comments
- confidence
- source
- version
- status: proposed | approved | rejected | deprecated

## 10.7 SME Profile

Fields:

- sme_id
- domain_expertise
- dimension_reliability
- historical_agreement_patterns
- engagement_preferences
- response_probability
- fatigue_state
- known_biases_or_tendencies

## 10.8 Action Recommendation

Fields:

- recommendation_id
- issue_cluster_id
- recommended_action
- evidence
- confidence
- affected_examples
- affected_judges
- affected_memories
- status
- owner

---

## 11. Ranking and Acquisition Logic

The system ranks candidate feedback opportunities using:

```text
A(example, question, sme) =
  DecisionValue
  × InformationGain
  × SMEExpertiseMatch
  × EngagementProbability
  × LabelReliability
  - FatigueCost
  - RedundancyPenalty
```

Where:

### DecisionValue

How likely this feedback is to affect a real action:

- retrain model
- retrain judge
- revise rubric
- add judge
- escalate policy issue

### InformationGain

How much the answer reduces uncertainty about:

- latent production quality
- judge calibration
- memory validity
- rubric coverage
- SME disagreement

### SMEExpertiseMatch

How well the SME matches the question type, domain, and rubric dimension.

### EngagementProbability

How likely the SME is to respond.

Signals:

- prior engagement
- topic interest
- confidently-wrong pattern
- question length
- personal relevance
- visible impact

### LabelReliability

Expected quality of the SME answer for this example/question.

### FatigueCost

Penalty based on recent load, repeated topics, and low expected motivation.

### RedundancyPenalty

Penalty for showing many examples from the same cluster.

---

## 12. UX Requirements

## 12.1 SME Feed

The SME feed should present high-value review cards, not generic labeling tasks.

Each card should answer:

1. Why am I seeing this?
2. What does the judge think?
3. What is the suspected issue?
4. What question am I being asked?
5. What happens if I respond?

Example card:

```text
Possible judge blind spot

The judge rated this response 5/5 correctness with high confidence.
Similar examples were previously corrected by physician SMEs.

Question:
Does the ER recommendation apply here?

Actions:
[Agree] [Too aggressive] [Needs red-flag caveat] [Missing triage justification] [Skip]
```

## 12.2 Judge Reaction UI

After blind review, the UI should reveal judge output and allow structured reactions:

- Agree
- Disagree
- Score too high
- Score too low
- Right score, wrong reason
- Wrong dimension
- Memory too broad
- Memory too narrow
- Missing exception
- Missing dimension

## 12.3 Memory Diff UI

The system should present proposed memory updates as reviewable diffs.

Actions:

- Accept
- Accept with edit
- Too broad
- Too narrow
- Wrong
- Needs another SME
- Needs policy owner

## 12.4 Discussion UI

Discussion should support comments and replies, but with structured typed reactions.

Generic likes should be avoided or de-emphasized.

Typed reactions:

- Agree
- Disagree
- Useful distinction
- Too broad
- Too narrow
- Changed my mind
- Missing dimension
- Needs policy owner

## 12.5 Impact Preview

SMEs should see how their feedback will affect the system.

Example:

```text
Your feedback will update the judge's emergency-care memory and test the change against 42 related production examples.
```

This improves motivation and helps SMEs see that they are not just labeling data.

---

## 13. Metrics

## 13.1 Judge Quality Metrics

- Judge-SME agreement by dimension
- Judge-SME agreement by production cluster
- Judge calibration by confidence bucket
- False positive rate by dimension
- False negative rate by dimension
- Right-score-wrong-reason rate
- Anchor-set stability
- Memory retrieval accuracy
- Coverage-gap detection rate

## 13.2 Production Monitoring Metrics

- Score distribution drift
- Severe-failure rate
- Input cluster drift
- Output cluster drift
- Novel cluster rate
- Judge uncertainty trend
- Judge disagreement trend
- User-feedback mismatch rate
- Business-outcome mismatch rate

## 13.3 SME Engagement Metrics

- Response rate
- Time to review
- Skip rate
- Comment rate
- Memory-diff approval rate
- Changed-mind events
- Repeat engagement
- Fatigue indicators

## 13.4 Active Learning Metrics

- Information gain per SME review
- Actionable feedback rate
- Model-retrain decisions supported
- Judge-retrain decisions supported
- Rubric revisions discovered
- Redundant sample rate
- Cluster coverage

## 13.5 System Outcome Metrics

- Reduction in production failure rate
- Reduction in judge errors
- Time from detection to action
- SME hours per resolved issue
- Number of validated judge updates
- Number of validated model updates
- Number of discovered rubric gaps

---

## 14. Workshop Outputs

At the end of the workshop, the customer receives:

1. Optimized judge version 1
2. Baseline agreement report
3. SME disagreement analysis
4. Judge failure taxonomy
5. Initial rubric and dimension definitions
6. Initial episodic memory set
7. Initial semantic memory set
8. Known blind spots
9. Anchor examples
10. Production monitoring plan
11. SME re-engagement plan
12. Decision framework for model vs judge retraining

---

## 15. Production Operating Cadence

## 15.1 Continuous

- Score production logs.
- Track drift and uncertainty metrics.
- Identify candidate examples for review.

## 15.2 Weekly or Per Release

- Review judge quality dashboard.
- Sample production examples.
- Route high-value examples to SMEs.
- Review action recommendations.

## 15.3 Monthly or Per Major Drift Event

- Recalibrate judge if needed.
- Update rubric if needed.
- Refresh anchor set.
- Review SME disagreement patterns.
- Promote approved memory updates.

## 15.4 Trigger-Based

Immediately re-engage SMEs when:

- high-severity production failure appears,
- judge confidence is high but external signals disagree,
- novel production cluster emerges,
- proposed retraining decision lacks enough evidence,
- new policy ambiguity appears.

---

## 16. Risks and Mitigations

## 16.1 Risk: Judge Anchors SME Review

Mitigation:

- Always require blind first-pass review before revealing judge output.

## 16.2 Risk: Mode Aggregation Erases Nuance

Mitigation:

- Store disagreement structure, rationales, minority views, and policy ambiguity.

## 16.3 Risk: Social Features Create Groupthink

Mitigation:

- Blind first pass.
- Typed reactions.
- Preserve pre/post discussion deltas.
- Avoid generic popularity-based likes as truth.

## 16.4 Risk: Active Sampling Biases Production Estimates

Mitigation:

- Maintain random or stratified audit sample.
- Separate active-learning samples from base-rate estimation samples.

## 16.5 Risk: Judge Overfits SME Corrections

Mitigation:

- Use memory diffs with scope, exceptions, and counterexamples.
- Regression-test judge patches against anchor examples.

## 16.6 Risk: SME Fatigue

Mitigation:

- Route only high-value questions.
- Personalize feed by expertise and engagement.
- Show impact previews.
- Limit redundant examples.

## 16.7 Risk: Wrong Action Recommendation

Mitigation:

- Classify evidence into model failure, judge failure, rubric gap, or policy ambiguity.
- Require SME confirmation for high-impact retraining decisions.
- Provide evidence traces.

---

## 17. MVP Scope

### MVP Must Include

- Baseline judge pre-scoring
- SME blind review
- Judge reveal and structured reaction
- Judge error taxonomy
- Episodic and semantic memory objects
- Proposed memory diffs
- Basic production scoring
- Active sampling based on uncertainty, novelty, severity, and disagreement
- SME feed with targeted questions
- Decision table for model retrain vs judge retrain vs rubric revision

### MVP Can Defer

- Full Bayesian posterior modeling
- Complex contextual bandit personalization
- Advanced argument mining
- Automated memory promotion
- Fully automated model retraining
- Multi-customer policy profile support

---

## 18. Future Enhancements

- Bayesian latent-rater modeling for SME and judge uncertainty
- Contextual bandit feed ranking
- Automated argument-map extraction from comments
- Coverage-gap judge
- Memory regression test generation
- Production cluster summarization
- SME-specific calibration models
- Customer-specific policy profiles
- Active generation of counterexamples
- Automated proposed rubric splits
- Shadow-mode judge comparison

---

## 19. Open Questions

1. What minimum SME agreement threshold is required before judge alignment starts?
2. How many blind reviews are needed per example by domain and risk level?
3. How should unresolved SME disagreement be represented in production judge behavior?
4. When should a memory patch require one SME versus multiple SMEs?
5. How should customer-specific preferences be separated from general judge memory?
6. What governance is required before model retraining or judge retraining?
7. What is the acceptable SME review burden per week?
8. Which dimensions should be scored by separate judges versus one composite judge?
9. How should the system prevent optimizer overfitting to highly engaged SMEs?
10. What evidence threshold should trigger production rollout of judge updates?

---

## 20. One-Line Positioning

A production system for maintaining LLM judges through blind SME review, judge-centered critique, active production sampling, and memory-based judge optimization.

---

## 21. Short Customer Explanation

The workshop creates the first calibrated judge, but production monitoring keeps it trustworthy. We score production logs, detect drift and uncertainty, and selectively re-engage SMEs when their feedback would change a decision. If the model is producing bad answers, we retrain the model. If the judge is measuring incorrectly, we retrain the judge. If the rubric is missing a concept, we revise the rubric or add a judge. If SMEs disagree for principled reasons, we preserve that disagreement instead of flattening it into a mode.

