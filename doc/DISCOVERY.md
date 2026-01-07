# The Discovery Stage

Why doesn't the workshop start with directly creating a judge or rubric question? Prior to this experience, 
it's likely that a group of informed stakeholders hasn't explored this topic of AI quality in a structured,
systematic way. Generic measurements like correctness, groundedness, etc. need to be defined in terms of specific business knowledge to make them into a truly useful measurement system.

## Goals of the discovery process

The discovery process helps elicit the raw material that can be refined into rubric questions. Participants will investigate individual examples to identify what constitutes high or low quality independently. The findings from each examples are then synthesized across examples and participants to come up with global definitions of quality.

During the annotation process, we test empirically whether all participants can agree on these global definitions. 


## Facilitating Discovery: Challenges + Solutions

The process can be more art than science. It's often messy, and can suffer from sparse responses, unclear expectations and cognitive overload. The facilitation experience in the application is designed to solve these problems: 

    - The application generates follow up questions specific to participants / examples. Observations from other participants may be included to specifically probe for interesting disagreements.
    - The findings aggregated by participant/example are presented to the facilitator to _inform_ discussion (not to replace it). Since facilitators often don't know about the domain, this helps reduce cognitive load.
    - Participants autonomously own the process with the faciliator and workshop just providing the framework. They will organically identify common clusters of findings and themes. 

## How assisted facilitation works (high level)

Assisted facilitation helps participants go deeper on each example and helps facilitators guide discussion without needing to be a domain expert.

### During participant review (per example)

- **Start simple, then go deeper**: each example begins with a baseline prompt (“what makes this effective or ineffective?”). As a participant responds, the application can propose a small number of follow-up questions that encourage deeper thinking (edge cases, missing info, boundary conditions, failure modes).
- **Probe disagreements intentionally**: when different participants notice different things about the same example, follow-up questions can be tailored to surface the disagreement and clarify the underlying definition of “good” vs “bad”.
- **Stop when coverage is good**: follow-up questions aren’t infinite; once the key angles have been explored (or a sensible limit is reached), the application stops proposing more so the group can move on.

### For the facilitator (across participants and examples)

- **Theme extraction and synthesis**: participant observations are summarized into a small set of themes and recurring patterns, both overall and broken down by participant and by example.
- **Discussion-ready outputs**: the app surfaces key disagreements and provides short discussion prompts that help the facilitator run a productive conversation.
- **Bridge to rubric creation**: the system can suggest candidate rubric questions (concrete “quality dimensions”) derived from the themes so the group can turn discovery insights into a rubric more quickly.
- **Progress signals**: simple convergence indicators (how consistently themes appear across participants) help the facilitator judge when the group has enough shared understanding to move into rubric definition and annotation.
