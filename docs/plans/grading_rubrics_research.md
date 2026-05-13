# Grading Rubrics for AI Model Calibration: From Expert Human Feedback to LLM-as-a-Judge

## Executive Summary

Rubric-based evaluation has emerged as the dominant paradigm for aligning AI model judges with expert human judgment. Rather than asking humans to deliver holistic quality scores — which are inconsistent and hard to automate — rubrics decompose a desired response into a set of discrete, binary, verifiable criteria that any judge (human or LLM) can apply consistently. The landmark examples of this methodology at scale are OpenAI's **HealthBench** and Mercor's **AI Consumer Index (ACE)**, both of which demonstrate that fine-grained, expert-authored rubrics, when properly structured, enable automated grading to match or exceed the reliability of individual human raters. Research throughout 2025–2026 has also begun to quantify the *Rubric Gap* — the persistent deficit when model-generated rubrics substitute for human-authored ones — and has produced new frameworks for failure-mode diagnosis, budget-constrained annotation, and hybrid human-AI calibration workflows.

***

## 1. Foundations: What Is a Rubric and Why It Matters

A **rubric** (also called an "auto-grader" or evaluation schema) is a structured set of criteria against which a model response is assessed. Each **criterion** is a self-contained, verifiable statement about the response — phrased as a declarative claim that can be assigned a binary Pass/Fail determination. The critical properties of a well-formed criterion are:[^1]

- **Verifiable**: Answerable with a simple yes/no without external hidden knowledge[^1]
- **Clear**: Uses unambiguous language, consistently interpretable by different raters[^1]
- **Measurable**: Describes observable behavior, not vague qualities like "be good"[^1]
- **Self-contained**: Can be evaluated in isolation without requiring extra context[^1]
- **Atomic**: Covers one and only one dimension of quality, avoiding compound judgments[^2]

Without rubrics, evaluation degenerates into holistic rating — a process prone to annotator inconsistency, position bias, and cognitive fatigue. Studies in educational settings consistently find that replacing holistic judgments with analytic rubrics sharpens inter-rater agreement and reduces cognitive load. The same effect carries into AI evaluation: one study found that LLMAJ alignment improved from 37.3% to 93.95% when rubric access was provided versus zero-shot evaluation.[^3][^4]

Rubrics serve a dual purpose: they enforce labeling consistency among human annotators during the *annotation phase*, and they transfer that codified judgment to an automated judge during the *inference phase*. This "codification of tacit knowledge" is what makes rubric-based evaluation (RBE) genuinely scalable — a rubric written once by a domain expert can be applied to future model outputs in perpetuity.[^4][^1]

***

## 2. HealthBench: Large-Scale Physician Rubric Construction

### 2.1 Overview and Scale

HealthBench, released by OpenAI in May 2025, is the most comprehensive example of expert-rubric-based AI evaluation to date. It comprises:[^5]

- **5,000** realistic multi-turn health conversations
- **48,562** unique physician-written rubric criteria
- **262** physicians across 26 specialties and 60 countries[^6]
- **11 months** of development over the full campaign[^7]

The benchmark was designed to be **meaningful** (scores reflect real-world clinical impact), **trustworthy** (criteria reflect physician judgment), and **unsaturated** (top models score only ~60%, leaving room for progress).[^8]

### 2.2 Physician Cohort and Vetting Process

Recruiting expert annotators with suitable domain knowledge was central to HealthBench's validity. The cohort was assembled through a multi-step vetting process:[^9][^7]

1. **1,021 physicians** expressed initial interest
2. **26% (262)** were selected based on response quality on interest forms and **paid introductory rubric-writing tasks**
3. A further **31 physicians** were removed during the campaign due to quality review failures; their annotations were deleted
4. Physician **advisors** shaped domain choices, wrote prompt seeds, and held **live training sessions** for the cohort
5. **Automated quality metrics** and manual reviews of rubrics ran continuously throughout the 11-month campaign

The cohort spoke **49 languages** and spanned independent practitioners, fellows, and residents (year 3+), ensuring breadth of clinical experience.[^9]

### 2.3 Rubric Creation Methodology

Physicians wrote rubrics **one theme at a time**, receiving batches of conversations relevant to each theme. The creation process for each example involved two layers:[^9]

**Layer 1 — Example-Specific Criteria**
Each physician wrote bespoke criteria tailored to the specific conversation. The vast majority of the 48,562 criteria are unique, written specifically for a single example. Criteria could be positive (rewarded if met) or negative (penalized if met, e.g., "fabricates additional clinical information").[^7]

**Layer 2 — Consensus Criteria**
A set of 34 pre-written consensus criteria (appearing 8,053 times across the dataset) were assigned to examples only when **majority agreement** (>50% of raters, minimum 2 raters) deemed them applicable. These covered universal behavioral standards applicable across theme categories (e.g., "provides a direct emergency referral in the first few sentences"). Consensus criteria serve as a physician-validated, high-precision evaluation layer independent of individual rubric quality.[^7]

### 2.4 Criterion Scoring Schema

Each rubric criterion is encoded as:

```json
{
  "criterion": "Explains indication for insulin therapy",
  "points": 5,
  "tags": ["axis:accuracy", "theme:diabetes"]
}
```

Point values range from **-10 to +10**, with negative values used for undesirable behaviors. The normalized score per example is:[^10][^11]

\[ s_i = \frac{\sum_{j=1}^{M_i} \mathbf{1}\{r_{ij}\} \cdot p_{ij}}{\sum_{j=1}^{M_i} \max(0, p_{ij})} \]

where \( r_{ij} = 1 \) if criterion \( j \) is met for example \( i \), and \( p_{ij} \) is the point value. The final benchmark score is the clipped mean of all per-example scores across 5,000 conversations.[^12]

### 2.5 Five Behavioral Axes

Every criterion in HealthBench is tagged with one of five behavioral axes that describe *what dimension of model behavior* is being assessed:[^11][^13]

| Axis | % of Criteria | What It Measures |
|------|---------------|------------------|
| Completeness | 39% | Whether all important information is included |
| Accuracy | 33% | Factual correctness aligned with clinical consensus |
| Context Awareness | 16% | Responsiveness to situational cues; information-seeking |
| Communication Quality | 8% | Clarity, structure, and audience-appropriateness |
| Instruction Following | 4% | Adherence to explicit user/task instructions |

### 2.6 Seven Evaluation Themes

HealthBench also partitions examples into seven real-world clinical themes:[^14][^9]

| Theme | Count | % |
|-------|-------|---|
| Global Health | 1,097 | 21.9% |
| Responding Under Uncertainty | 1,071 | 21.4% |
| Expertise-Tailored Communication | 919 | 18.4% |
| Context Seeking | 594 | 11.9% |
| Emergency Referrals | 482 | 9.6% |
| Health Data Tasks | 477 | 9.5% |
| Response Depth | 360 | 7.2% |

### 2.7 Judge Calibration and Trustworthiness

The model-based grader (GPT-4.1, later GPT-5.4 for HealthBench Professional) evaluates each criterion independently for each response. Grader trustworthiness was validated through **meta-evaluation** on the 34 consensus criteria, where both the model grader and individual physicians scored the same (conversation, response, criterion) tuples. The results showed that the model grader **matches or exceeds individual physician agreement** across 6/7 HealthBench themes (weighted average Macro F1 of 0.709 for GPT-4.1 versus ~0.64 for the average physician). This finding — that a calibrated model-based grader can reach physician-level reliability — is the central justification for automated rubric-based evaluation at scale.[^10][^7]

***

## 3. Mercor ACE: Criterion Schema and Hierarchical Grading

### 3.1 Overview

The **AI Consumer Index (ACE)**, released by Mercor in December 2025, applies a rubric-based evaluation methodology to everyday consumer tasks across four domains: Shopping, Food, Gaming, and DIY. ACE-v1-heldout contains 400 test cases; 80 are open-sourced. It was built by **47 domain experts** including personal shoppers, chefs, game developers, and tradespeople.[^15][^16][^17]

### 3.2 Criterion Structure in ACE

ACE criteria are phrased as **objective, self-contained, descriptive claims** about the response, assessable as Pass or Fail by either a human or LM judge. The mean number of criteria per task domain is:[^17]

| Domain | Avg Criteria/Task | Avg Hurdles | % Grounding Criteria |
|--------|-------------------|-------------|----------------------|
| DIY | 10.71 | 1.01 | 0% |
| Food | 7.65 | 1.67 | 0% |
| Gaming | 5.41 | 1.35 | 42% |
| Shopping | 5.21 | 1.25 | 74% |

Each criterion carries two metadata tags: (1) whether it requires **grounding** (factual claims the model must support from retrieved web sources) and (2) whether it is a **hurdle criterion**.[^17]

### 3.3 The Hurdle-Criterion Innovation

A central architectural feature of ACE is the **hurdle criterion** — a mandatory gate that must be passed before any other criteria are scored. Hurdles capture the core objective of a task (e.g., "the response returns the requested type of product"), preventing reward hacking where a model satisfies peripheral criteria without meeting the user's primary goal. On average, there is **1.32 hurdles per case** in ACE-v1-heldout; failing the hurdle results in a score of zero for that task regardless of other criteria performance. This mechanism reduces overall model scores by ~21 percentage points on average.[^18][^17]

### 3.4 Grounding Criteria and Hallucination Penalization

ACE introduces **grounding criteria** — a class of criterion that penalizes models for making claims not supported by retrieved web sources. The grading logic is hierarchical:[^18]

1. **Hurdle check**: If failed → score 0
2. **Criterion check**: If response content fails criterion → score 0
3. **Grounding check**: If required and content passes but is ungrounded → score **-1**; if grounded → score **+1**

This three-step process means a model that hallucinates to appear helpful is explicitly penalized, not just unrewarded. Grounding criteria account for 42% of Gaming criteria and 74% of Shopping criteria.[^18][^17]

### 3.5 Criteria Taxonomy in ACE

ACE provides a fine-grained **criteria type taxonomy** covering 6–10 types per domain (e.g., "Meets pricing requirements," "Provides safety warnings," "Set list/specific recommendation," "Provides link(s)"). This taxonomy enables high-fidelity loss analysis — revealing exactly which *kinds* of requirements models fail at, not just their aggregate score. For example, models perform near-perfectly on "Provides step-by-step instructions" in DIY (88–100%) but dramatically poorly on "Recommends consulting a professional" (18–51%), exposing a systematic safety underperformance.[^17]

### 3.6 LM Judge Selection

ACE uses **Gemini 2.5 Pro (Thinking = High, Temperature = 0.0)** as the grading judge. Model responses are collected **8 times per prompt** and the mean score is used for the leaderboard, reducing variance from a mean standard deviation of ~16.4% per run. GPT 5 (Thinking = High) is the top-performing model on ACE-v1-heldout at **56.1%**, followed by o3 Pro at 55.2%.[^15][^17]

***

## 4. Mercor's Rubric Creation Framework

Beyond ACE, Mercor has developed a rubric creation protocol used across its broader AI data labeling platform that represents industry best practice for structuring expert-generated criteria.[^1]

### 4.1 Criterion Design Principles

Mercor's rubric guide defines a criterion as a **verifiable, clear, measurable, self-contained, and high-confidence** statement. Good criteria are phrased positively as declarative claims, not questions, and must be assessable in isolation. Vague statements like "be good" are explicitly prohibited.[^1]

### 4.2 Scoring Scale Options

Mercor's platform supports several scoring modalities calibrated to task type:[^19]

| Scale Type | Options | Best For |
|------------|---------|----------|
| Binary | Accept / Reject | Clear pass/fail tasks |
| Error-based categorical | Major error / Minor error / Perfect | Tasks with graded severity |
| Numeric | 1-3, 1-4, 1-7, 1-10 | Continuous quality gradients |
| Error tagging | Category + severity per span | Highly granular multi-error feedback |

Binary scoring (Pass/Fail per criterion) is standard in HealthBench and ACE because it produces the most auditable and consistent inter-rater agreement.[^17][^1]

### 4.3 Standard Criterion Categories

For general non-coding tasks, Mercor specifies the following standard quality dimensions:[^19]

- **Content Quality**: Factuality/accuracy, relevance, completeness
- **Linguistic Quality**: Spelling, grammar, punctuation
- **Presentation**: Clarity, conciseness, formatting adherence
- **Behavioral Compliance**: Tone, content boundaries (bias, sensitive content)

These map closely to HealthBench's five axes and reflect a broadly shared industry taxonomy for rubric design.

***

## 5. The LLM-as-a-Judge Calibration Pipeline

### 5.1 The Core Calibration Problem

A rubric's value is only realized if the judge applying it is consistent with human intent. Uncalibrated judges can score against criteria the designers don't care about (e.g., polishing over factual accuracy) or exhibit systematic biases including prompt sensitivity, verbosity preference, and self-preferential bias. The primary calibration problem is achieving high **inter-rater reliability (IRR)** between the automated LLM judge and the human expert consensus.[^20][^21]

### 5.2 Key Biases and Mitigations

| Bias Type | Description | Mitigation |
|-----------|-------------|------------|
| Prompt sensitivity | Minor phrasing changes dramatically alter scores | Normalize scores against a human-labeled gold set[^20] |
| Self-preferential bias | Judge favors its own model family's outputs | Use diverse cross-model judge panels[^20] |
| Verbosity bias | Longer responses get higher scores regardless of content | Length-controlled evaluation protocols[^7] |
| Position bias | First response in pairwise comparisons preferred | Swap-and-average; use rubric decomposition[^22] |

### 5.3 Calibration Workflow

The standard calibration workflow — followed by systems like LangSmith, GoDaddy, and described in HealthBench's meta-evaluation — proceeds in four stages:[^23][^20]

1. **Rubric design**: Domain experts write criteria with explicit point values, axes, and Pass/Fail thresholds
2. **Gold-set annotation**: Human experts score a representative calibration set of (prompt, response, criterion) tuples
3. **Alignment measurement**: Cohen's Kappa or Macro F1 is computed between judge and human consensus; target is typically κ ≥ 0.67–0.80[^24]
4. **Few-shot seeding**: Disagreement examples are used as calibrating few-shot examples injected into the judge prompt, improving alignment without retraining[^23]

Studies report that strong LLM judges reach approximately **80% agreement** with human evaluators — roughly the level of agreement humans reach with each other. Elite hybrid approaches using multi-judge consensus achieve Macro F1 of **97.6–98.4%** with Cohen's Kappa of ~0.95.[^25][^23]

### 5.4 Three Failure Modes in Rubric Alignment

The 2026 paper "Locked Rubrics and Evidence-Anchored Scoring" identified three recurrent failure modes when aligning frozen models with rubric standards:[^22]

1. **Rubric instability**: Prompt sensitivity causes scoring changes from minor phrasing differences
2. **Unverifiable reasoning**: Lack of auditable evidence trails for why criteria are passed or failed
3. **Scale misalignment**: Judge scores don't map to the same human grading boundaries

***

## 6. The Rubric Gap: Why Human Experts Remain Essential

### 6.1 RubricBench and the 27% Gap

The March 2026 paper introducing **RubricBench** — a benchmark of 1,147 pairwise comparisons with expert-annotated atomic rubrics — demonstrated what has since been called the **Rubric Gap**: a persistent ~27 percentage point accuracy deficit when models use self-generated rubrics instead of human-authored ones.[^26][^27][^2]

Key findings from RubricBench:
- Models with human rubrics achieved **~85% accuracy**; models with self-generated rubrics achieved **~58%**[^27][^2]
- Humans using human rubrics hit **92% accuracy**; humans forced to use model-generated rubrics dropped to **61%** — proving the bottleneck is rubric quality, not judge capability[^28]
- Scaling compute ("test-time scaling") improves performance with human rubrics but **has no positive effect** with model-generated rubrics[^29][^2]
- Models generate rubrics with **>70% hallucination rates** — they produce overly strict or tangential criteria ("Attention Displacement") and exhibit "Value Inversion," penalizing correct refusals while rewarding hallucinatory solutions on safety-critical tasks[^2]

The fundamental bottleneck is **cognitive misalignment**: models fail to infer the *implicit rules* that human experts prioritize, even when they have sufficient reasoning capacity to apply those rules once specified.[^27]

### 6.2 XpertBench and ShotJudge

The April 2026 **XpertBench** benchmark applied expert rubrics to 1,346 professional tasks across 80 categories (finance, healthcare, legal, STEM). Each task uses **15–40 weighted checkpoints** — a substantially more granular structure than HealthBench's median of 11 criteria per example.[^30][^31][^32]

To bridge the calibration gap, XpertBench introduced **ShotJudge**: an evaluation paradigm that grounds LLM judges in human-expert standards by using expert-annotated exemplars as few-shot calibration anchors. The ShotJudge approach:[^31][^32]
- Uses LLMs (Claude Opus or Gemini 2.5 Pro) to generate initial rubric drafts
- Has the original expert contributor refine and validate each checkpoint
- Injects expert-scored exemplars into the judge prompt for calibration
- Explicitly enforces atomicity and objectivity across all checkpoints[^30]

Even with this calibration, the best models achieve only **~66% peak success rate** on XpertBench, with a mean of ~55% — confirming that fine-grained expert rubrics remain a genuinely difficult target.[^31]

### 6.3 RIFT: A Rubric Failure Mode Taxonomy

The April 2026 **RIFT** framework (RubrIc Failure mode Taxonomy) provides the first principled diagnostic vocabulary for rubric quality. Developed using grounded theory from iterative expert annotation of rubrics from five diverse benchmarks, RIFT identifies **eight failure modes** in three categories:[^33][^34][^35]

**Reliability Failures**
- *Ambiguity*: Criterion wording is unclear or has multiple valid interpretations
- *Redundancy*: Multiple criteria test the same aspect, inflating aggregate scores

**Content Validity Failures**
- *Missing coverage*: Important requirements from the task are absent from the rubric
- *Tangential content*: Criteria test aspects irrelevant to the actual task requirements
- *Over-specification*: Criteria are too strict, penalizing valid alternative correct responses

**Consequential Validity Failures**
- *Reward hacking susceptibility*: Criteria can be satisfied without achieving genuine quality
- *Difficulty miscalibration*: Criteria difficulty is misaligned with the target behavior's importance
- *Construct underrepresentation*: Critical dimensions of quality are systematically absent

Inter-annotator agreement on RIFT labels reached **87% pairwise agreement** and **0.64 average Cohen's kappa** among three independent expert annotators. Automated RIFT evaluators — LLM-as-a-Judge classifiers trained on the taxonomy — achieve up to **0.86 F1** in detecting rubric failures, enabling scalable rubric quality auditing.[^34][^33]

The practical workflow RIFT envisions is: **diagnose → review → revise → validate**: automated flags guide expert attention to likely failure modes, the expert confirms using decision rules, targeted fixes are applied, and automated signals verify resolution.[^34]

***

## 7. Fine-Grained Feedback and Its Role in RLHF

### 7.1 The Case Against Holistic Feedback

Standard RLHF collects holistic preference judgments ("which response is better overall?"), which convey limited information about *why* one response is preferred and which specific attributes drove the decision. This is the annotation-level analog of the rubric gap problem: holistic feedback from humans is as ambiguous as holistic rubrics from models.[^36][^37]

### 7.2 Fine-Grained RLHF

The **Fine-Grained RLHF** framework (Wu et al., 2023, NeurIPS) addresses this by having annotators label specific *spans* within a response by error category (e.g., "sentence 2 is factually inaccurate," "sentence 4 is irrelevant") rather than rating the full response. This produces rewards that are fine-grained in two respects:[^38][^36]

- **Density**: A reward signal is provided after each segment (sentence or sub-sentence), rather than only at the end of the full response[^38]
- **Multiplicity**: Separate reward models are trained per error type (factual inaccuracy, irrelevance, information incompleteness), each operating at the granularity level of its category[^37][^38]

Human annotators reported that fine-grained feedback was **easier to provide** than holistic preferences because judgments are localized — reducing cognitive load and producing cleaner data with higher inter-annotator agreement. The training outcome was superior across all error types, with RLHF particularly effective at reducing factual errors.[^39][^37]

This fine-grained structure is conceptually equivalent to what rubrics achieve in evaluation: instead of a single holistic judgment, each criterion is a localized, typed, binary assessment. The key insight is that **fine-grained decomposition benefits both the annotator and the downstream model**.

***

## 8. Human Label Efficiency Under Time Constraints

### 8.1 The Core Tension

Expert human annotation is the gold standard for rubric creation and calibration — but domain experts are expensive, scarce, and time-constrained. Annotation costs for specialized domains (law, medicine) range from **$3–$60+ per annotator-hour** depending on expertise level. More critically, the *cost per unit of model improvement* — not cost per label — is the relevant metric: expert annotations that achieve target performance in one training cycle are consistently cheaper than cheap annotations requiring multiple retraining rounds.[^40][^41]

### 8.2 RLTHF: 6–7% Annotation Budget for Full Alignment

The 2025 **RLTHF** (Reinforcement Learning from Targeted Human Feedback) framework demonstrated that full-human-annotation-level alignment can be achieved with only **6–7% of the human annotation effort**. RLTHF works by:[^42][^43][^44]

1. Using an LLM to provide initial labels across the full dataset
2. Using a reward model's reward distribution to identify samples the LLM most likely mislabeled (high uncertainty, reward distribution tails)
3. Directing human annotation *exclusively* to those hard-to-label samples
4. Iteratively integrating human corrections with LLM-labeled data for reward model training[^44][^42]

Models trained on RLTHF-curated datasets outperformed models trained on *fully* human-annotated datasets, because the curated data consists disproportionately of the genuinely ambiguous cases that matter most for alignment.[^42]

### 8.3 Budget-Constrained Annotation: Labels vs. Preferences

A separate 2026 framework, **Preference-Calibrated Active Learning (PCAL)**, addresses the optimal allocation of a fixed annotation budget between collecting ground-truth labels (which require expert judgment but are costly) and pairwise preferences (which are cheaper but coarser). PCAL formulates this as a monotone missing data problem and derives an asymptotically optimal acquisition policy. The practical implication is that at small budgets, ground-truth labels are more efficient, while at larger budgets, preferences complement labels to fill coverage gaps.[^45][^46]

### 8.4 Inter-Rater Reliability Thresholds and Calibration Investment

Achieving acceptable rubric calibration requires careful upfront investment in expert alignment. Best practices for constrained expert groups include:[^24][^4]

- **Structured calibration phase**: Score a shared gold-standard set (typically 15–25 items) before collecting live data; achieve target IRR (Krippendorff's α ≥ 0.67) before proceeding[^24]
- **Live recalibration**: If IRR drops below threshold during ongoing annotation, hold synchronous adjudication meetings to re-examine divergent items[^24]
- **Task rotation**: Well-structured task rotation slows annotator fatigue and maintains quality over many hours of annotation[^4]
- **LLM-assisted rubric drafting**: Use LLMs to generate initial rubric drafts, reducing the blank-page burden on experts; have experts refine rather than author from scratch — this was the approach used in XpertBench and significantly reduces per-criterion authoring time[^30]

### 8.5 Implications for Fine-Grained Rubric Creation

When expert time is scarce, the evidence suggests several key design principles:

**Prioritize atomic criteria over holistic rubrics.** Atomic binary criteria are faster and cheaper to agree on than nuanced Likert-scale judgments. Localized judgments reduce cognitive load for the annotator and produce higher inter-rater agreement from fewer expert-hours.[^39]

**Front-load human judgment into rubric design; automate application.** The highest-value expert contribution is in defining *what matters* (rubric authoring) rather than applying that judgment to every response. Once a validated rubric exists, automated judges can apply it at scale with physician-equivalent reliability.[^20][^25]

**Use consensus thresholds to identify which criteria are truly universal.** HealthBench's consensus criteria mechanism — requiring ≥2 physicians to agree that a criterion applies — efficiently separates widely-agreed universal standards from idiosyncratic individual preferences. Investing expert time in consensus-validated criteria produces rubric elements with the highest downstream reliability.[^7]

**LLM-assisted draft review is superior to LLM-generated rubrics.** RubricBench proved that fully autonomous rubric generation by models fails catastrophically (~27% accuracy gap), but injecting even minimal human priors ("CheckEval" style, seeding generation with human-curated high-level criteria) substantially bridges the validity gap. The practical formula for time-constrained experts is: LLM draft → expert review and revision → consensus validation.[^29]

***

## 9. Summary: The Rubric Quality Stack

The body of research from 2023–2026 converges on a layered model of rubric quality:

| Layer | Description | Key Reference |
|-------|-------------|---------------|
| **Criterion Atomicity** | Each criterion tests exactly one verifiable dimension | Mercor[^1], RubricBench[^2] |
| **Expert Authorship** | Human experts write or heavily revise criteria; LLMs assist drafting | HealthBench[^7], XpertBench[^30] |
| **Consensus Validation** | Critical criteria validated by multi-expert agreement | HealthBench Consensus[^7] |
| **Axis/Type Tagging** | Criteria tagged by behavioral dimension and type for stratified analysis | HealthBench[^11], ACE[^17] |
| **Weighted Point Values** | Criteria assigned importance weights (e.g., -10 to +10) | HealthBench[^10] |
| **Hurdle Gating** | Core task requirements gate further scoring to prevent reward hacking | ACE[^18] |
| **Grounding Checks** | Factual claims verified against source documents; hallucination penalized | ACE[^17] |
| **Judge Calibration** | LM judge calibrated to human consensus via few-shot examples | ShotJudge[^32], LangChain[^23] |
| **Failure Mode Auditing** | Rubrics systematically diagnosed for 8 failure modes | RIFT[^34] |
| **Budget-Constrained Iteration** | Expert time directed to highest-uncertainty samples | RLTHF[^42], PCAL[^45] |

The central finding across all these systems is that **human expertise is irreplaceable at the rubric authorship layer**, but efficiently deployable everywhere else. With appropriate tools (LLM drafting, RLTHF-style active selection, consensus validation protocols), a small team of time-constrained domain experts can produce rubrics that enable automated evaluation at physician-grade reliability — and do so with far less total annotation effort than the naïve approach of having experts score every model response directly.

---

## References

1. [Mercor Rubric Creation Guide | PDF | Reason | Cognition - Scribd](https://www.scribd.com/document/935702061/Candidate-Instructions) - This document provides guidelines for creating rubrics to evaluate model responses in Mercor project...

2. [Aligning Model-Generated Rubrics with Human Standards](https://www.themoonlight.io/de/review/rubricbench-aligning-model-generated-rubrics-with-human-standards) - A substantial accuracy gap exists between model-generated and human-annotated rubrics. Human rubrics...

3. [The science of rubric design - Snorkel AI](https://snorkel.ai/blog/the-science-of-rubric-design/) - Below is a collection of tips and things to consider to improve the effectiveness of your rubric for...

4. [Data quality and rubrics: how to build trust in your models | Snorkel AI](https://snorkel.ai/blog/data-quality-and-rubrics-how-to-build-trust-in-your-models/) - The evaluation rubric is doubly useful, because it secures labeling consistency among human annotato...

5. [Evaluating Large Language Models Towards Improved Human Health](https://arxiv.org/abs/2505.08775) - We present HealthBench, an open-source benchmark measuring the performance and safety of large langu...

6. [HealthBench - Karan Singhal](https://www.karansinghal.com/notes/healthbench/) - Unlike previous narrow benchmarks, HealthBench enables meaningful open-ended evaluation through 48,5...

7. [https://huggingface.co/datasets/OnDeviceMedNotes/h...](https://huggingface.co/datasets/OnDeviceMedNotes/healthbench/raw/94c8954d4b6a6494232a0ade39a42f35ef33d895/healthbench-fullpaper.md) - The vast majority of the 48,562 unique rubric criteria in HealthBench were written specifically by a...

8. [Introducing HealthBench - OpenAI](https://openai.com/index/healthbench/) - HealthBench tests how well AI models perform in realistic health scenarios, based on what physician ...

9. [Evaluating Large Language Models Towards Improved Human Health](https://arxiv.org/html/2505.08775v1) - The vast majority of the 48,562 unique rubric criteria in HealthBench were written specifically by a...

10. [[PDF] HealthBench Professional: Evaluating Large Language Models on ...](https://cdn.openai.com/dd128428-0184-4e25-b155-3a7686c7d744/HealthBench-Professional.pdf) - We use GPT-5.4 to grade rubrics, even though substantially less capable models have been shown to ma...

11. [HealthBench: Evaluating Large Language Models Towards ...](https://ukgovernmentbeis.github.io/inspect_evals/evals/knowledge/healthbench/) - HealthBench uses tags to categorize rubric criteria across two dimensions for detailed analysis. Cli...

12. [HealthBench: Clinical LLM Benchmark - Emergent Mind](https://www.emergentmind.com/topics/healthbench) - HealthBench's rubric-based scoring structure, while rigorous, codifies physician expert opinion (GRA...

13. [HealthBench Does Not Evaluate Patient Safety - Glass Box Medicine](https://glassboxmedicine.com/2025/05/13/healthbench-does-not-evaluate-patient-safety/) - The rubric criteria are partitioned into five axes: accuracy, completeness, communication quality, c...

14. [HealthBench | EvalScope](https://evalscope.readthedocs.io/en/v1.5.2/benchmarks/health_bench.html) - HealthBench is a comprehensive benchmark designed to measure AI capabilities for health-related task...

15. [The AI Consumer Index (ACE) - arXiv](https://arxiv.org/html/2512.04921v3) - For each prompt, experts create a rubric of criteria to evaluate the quality of responses. Each crit...

16. [The AI Consumer Index (ACE) - arXiv](https://arxiv.org/html/2512.04921v1) - We introduce the first version of the AI Consumer Index (ACE), a benchmark for assessing whether fro...

17. [[PDF] The AI Consumer Index (ACE) - arXiv](https://arxiv.org/pdf/2512.04921.pdf) - Each criterion has two metadata tags that are used in the grading methodology: (1) whether it assess...

18. [Introducing the AI Consumer Index - Mercor](https://www.mercor.com/blog/introducing-the-ai-consumer-index/) - Grading approach. We introduce a novel rubric-based evaluation methodology with ACE. Each task has a...

19. [Writing great instructions | Mercor Documentation](https://www.mercor.com/docs/writing-great-instructions/) - I think about this in conjunction with your preferred QA process — if you want to just pass or fail ...

20. [Calibrating Scores of LLM-as-a-Judge - GoDaddy Blog](https://www.godaddy.com/resources/news/calibrating-scores-of-llm-as-a-judge) - By partnering with human experts to design rubrics and align LLMJ scores, we create a scalable evalu...

21. [The Effectiveness of Rubric-Based Evaluation for LLM ... - LinkedIn](https://www.linkedin.com/pulse/effectiveness-rubric-based-evaluation-llm-based-scarce-koduvely-tlxnc) - Instead, the goal is to achieve high alignment or Inter-Rater Reliability (IRR) between the automate...

22. [Locked Rubrics and Evidence-Anchored Scoring for Robust LLM ...](https://arxiv.org/html/2601.08654v1) - The “LLM-as-a-Judge” paradigm promises scalable rubric-based evaluation, yet aligning frozen, black-...

23. [LLM-as-Judge: How to Calibrate with Human Corrections - LangChain](https://www.langchain.com/articles/llm-as-a-judge) - Learn how to build reliable LLM-as-a-judge systems through alignment loops. Calibrate judges with hu...

24. [Human-anchored longitudinal comparison of generative AI with a ...](https://pmc.ncbi.nlm.nih.gov/articles/PMC12863567/) - Blinded human raters provided correctness judgments, and a bias-calibrated LLM-as-judge produced sec...

25. [LLM-as-a-Judge vs Human Evaluation - Galileo AI](https://galileo.ai/blog/llm-as-a-judge-vs-human-evaluation) - Eval engineering loops with subject-matter experts: Human experts establish criteria through golden ...

26. [Aligning Model-Generated Rubrics with Human Standards - arXiv](https://arxiv.org/abs/2603.01562) - To bridge this gap, we introduce RubricBench, a curated benchmark with 1,147 pairwise comparisons sp...

27. [Paper page - RubricBench: Aligning Model-Generated Rubrics with ...](https://huggingface.co/papers/2603.01562) - Comprehensive experiments reveal a substantial capability gap between human-annotated and model-gene...

28. [Aligning Model-Generated Rubrics with Human Standards (Mar 2026)](https://www.youtube.com/watch?v=mKtrcMyGiu0) - ... rubric-guided evaluation in reward models. The study reveals a significant 'Rubric Gap' between ...

29. [RubricBench: Aligning Model-Generated Rubrics with Human ...](https://arxiv.org/html/2603.01562v1) - To bridge this gap, we introduce RubricBench, a curated benchmark with 1,147 pairwise comparisons sp...

30. [Xpertbench: Expert Level Tasks with Rubrics-Based Evaluation - arXiv](https://arxiv.org/html/2604.02368v4) - To facilitate scalable yet human-aligned assessment, we introduce ShotJudge, a novel evaluation para...

31. [Xpertbench: Expert Level Tasks with Rubrics-Based Evaluation - arXiv](https://arxiv.org/abs/2604.02368) - Each task uses detailed rubrics with mostly 15-40 weighted checkpoints to assess professional rigor....

32. [Xpertbench: Expert Level Tasks with Rubrics-Based Evaluation](https://huggingface.co/papers/2604.02368) - ShotJudge, a novel evaluation paradigm that employs LLM judges calibrated with expert few-shot exemp...

33. [[SHORT] RIFT: A RUBRIC FAILURE MODE TAXONOMY AND ...](https://openreview.net/forum?id=tCxZYDLvuu) - Finally, to support scalable diagnosis, we propose automated rubric quality metrics and show that th...

34. [RIFT: A RubrIc Failure Mode Taxonomy and Automated Diagnostics](https://arxiv.org/html/2604.01375v2) - Abstract. Rubric-based evaluation is widely used in LLM benchmarks and training pipelines for open-e...

35. [RIFT: A RubrIc Failure Mode Taxonomy and Automated Diagnostics](https://arxiv.org/abs/2604.01375) - RIFT consists of eight failure modes organized into three high-level categories: Reliability Failure...

36. [Fine-Grained Human Feedback Gives Better Rewards for Language ...](https://openreview.net/forum?id=CSbGXyCswu) - We introduce Fine-Grained RLHF, a framework that enables training and learning from reward functions...

37. [Fine-Grained Human Feedback Gives Better Rewards for Language ...](https://montrealethics.ai/fine-grained-human-feedback-gives-better-rewards-for-language-model-training/) - The fine-grained RLHF framework can be applied to any text generation task to enhance LM performance...

38. [Fine-Grained RLHF](https://finegrainedrlhf.github.io) - We propose Fine-Grained RLHF, a framework that enables training and learning from reward functions t...

39. [Fine-Grained Human Feedback | Databricks Blog](https://www.databricks.com/blog/fine-grained-human-feedback) - In this blog post, we discuss Fine-Grained RLHF, a framework that enables training and learning from...

40. [How Much Do Data Annotation Services Cost? The Complete Guide ...](https://www.basic.ai/blog-post/how-much-do-data-annotation-services-cost-complete-guide-2025) - This guide breaks down the factors influencing data annotation services pricing, along with common p...

41. [Why AI Labs Are Hiring PhD-Level Annotators - Careerflow.ai](https://www.careerflow.ai/human-data/blogs/phd-level-annotators) - The objection to PhD-level annotation is always cost. Expert annotators charge significantly more pe...

42. [[2502.13417] RLTHF: Targeted Human Feedback for LLM Alignment](https://arxiv.org/abs/2502.13417) - We propose RLTHF, a human-AI hybrid framework that combines LLM-based initial alignment with selecti...

43. [ICML Poster RLTHF: Targeted Human Feedback for LLM Alignment](https://icml.cc/virtual/2025/poster/46173) - Evaluations on HH-RLHF and TL;DR datasets show that RLTHF reaches full-human annotation-level alignm...

44. [[PDF] RLTHF: Targeted Human Feedback for LLM Alignment - arXiv](https://arxiv.org/pdf/2502.13417.pdf) - HH-RLHF and TL;DR datasets show that RLTHF reaches full-human annotation-level alignment with only 6...

45. [Labels or Preferences? Budget-Constrained Learning with Human ...](https://arxiv.org/abs/2601.13458) - We address the crucial question of how to optimally allocate a fixed annotation budget between groun...

46. [[PDF] Labels or Preferences? Budget-Constrained Learning with Human ...](https://arxiv.org/pdf/2601.13458.pdf) - In this framework, efficiency is characterized through asymptotic variance, and the goal is to const...

