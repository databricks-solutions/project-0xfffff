---
name: brainstorming
description: "You MUST use this before any creative work — creating features, building components, adding functionality, or modifying behavior. Starts from existing specs rather than scratch. Use when the user asks to build, add, change, or design anything, even if it seems simple. Covers the full loop: find governing spec -> explore intent -> design within spec constraints -> transition to planning."
user_invocable: true
---

# Spec-Aware Brainstorming

Turn ideas into designs grounded in the project's specification system. Every feature in this codebase has (or should have) a governing spec. Brainstorming starts by finding that spec — not by reinventing requirements from scratch.

<HARD-GATE>
Do NOT invoke any implementation skill, write any code, scaffold any project, or take any implementation action until you have presented a design and the user has approved it. This applies to EVERY project regardless of perceived simplicity.
</HARD-GATE>

## Why Spec-First Matters

This project uses declarative specifications (`/specs/*.md`) as the source of truth. Each spec defines success criteria, data models, and behavior rules. When you brainstorm without reading the spec first, you end up designing against assumptions rather than requirements — and the implementation drifts from what's actually specified. The spec might already answer half your questions.

## Red Flags — You Are Rationalizing If You Think:

| Thought | Reality |
|---------|---------|
| "This is too simple to need brainstorming" | Simple changes still have governing specs with constraints you'll miss. |
| "I already know how this system works" | The spec defines how it works, not your intuition. Read it. |
| "Let me just start coding and figure it out" | You'll build assumptions, not requirements. Design first. |
| "The user seems to want this done quickly" | A 5-minute spec check prevents a 2-hour rework. |
| "There's no spec for this" | Then brainstorming produces one. That's the process. |
| "I'll read the spec after I design it" | You'll anchor on your design and dismiss spec constraints. |

## Checklist

Complete these steps in order:

1. **Find the governing spec** — search `/specs/README.md` keyword index for the domain
2. **Read the spec** — focus on Success Criteria, Behavior, and Data Model sections
3. **Assess the situation** — does a spec exist? Does it cover this work? (→ see Decision Tree)
4. **Ask clarifying questions** — one at a time, informed by what the spec already defines
5. **Propose 2-3 approaches** — with trade-offs, constrained by spec requirements
6. **Present design** — in sections scaled to complexity, get user approval
7. **Update spec index** — add lookup keywords to `/specs/README.md` for any new or expanded spec
8. **Transition** — invoke the `writing-plans` skill to create an implementation plan

## Decision Tree

After searching for a governing spec, you'll land in one of three situations:

### Spec Exists and Covers This Work

The spec's success criteria already define the expected behavior. Your job is to brainstorm the *approach* within those constraints, not redefine the requirements.

1. Read the spec's Success Criteria — these are your acceptance criteria
2. Check `specs/SPEC_COVERAGE_MAP.md` — what's already tested?
3. Ask clarifying questions about *how* to implement, not *what* to implement
4. Design the approach, referencing specific success criteria items
5. → Update spec index if new keywords apply, then invoke `writing-plans` skill

### Spec Exists but Doesn't Cover This Work

The domain has a spec, but the feature you're brainstorming isn't in its success criteria. This means the spec needs updating — which is a **protected operation**.

1. Read the existing spec to understand the current scope and patterns
2. Brainstorm the feature through Socratic exploration (see below)
3. Draft new success criteria as `- [ ]` items grouped by category
4. Draft new keyword entries for `/specs/README.md` that would help future searches find this work
5. **STOP and present proposed spec additions AND keyword additions to the user** — do not edit `/specs/` files without approval
6. After approval, the additions become the governing requirements
7. → Invoke `writing-plans` skill

### No Spec Exists

This is genuinely new territory. Brainstorming produces a spec.

1. Socratic exploration to understand purpose, constraints, and success criteria
2. Draft a new spec following the project format (see Spec Format below)
3. Draft keyword entries for `/specs/README.md` — include the spec in the Quick Reference table and add all relevant lookup keywords to the Keyword Search Index
4. **STOP and present the draft spec AND keyword additions to the user** — do not create files in `/specs/` without approval
5. After approval, save to `/specs/NEW_SPEC_NAME.md` and update `/specs/README.md`
6. → Invoke `writing-plans` skill

## Updating the Spec Index

`/specs/README.md` has two sections that must stay current:

1. **Quick Reference table** — add a row for any new spec: `| [SPEC_NAME](./SPEC_NAME.md) | Domain | Key Concepts |`
2. **Keyword Search Index** — add lookup terms under an appropriate heading. Include:
   - Core domain nouns (e.g., "rubric", "annotation")
   - Key model/class names (e.g., "ClassifiedFinding", "UserTraceOrder")
   - User-facing concepts (e.g., "dark mode", "keyboard shortcuts")
   - Action verbs that someone might search for (e.g., "promote", "shuffle")

The goal: a future agent searching for "how does X work?" should land on the right spec from the keyword index. Think about what terms someone would search for when they encounter this feature for the first time.

## Socratic Exploration

When brainstorming genuinely new features (no spec or spec gaps):

- **One question at a time** — don't overwhelm with multiple questions
- **Multiple choice preferred** — easier to answer than open-ended
- **Build on what exists** — reference existing specs, patterns, and data models
- **Focus on boundaries** — what does this feature touch? What's out of scope?
- **Extract success criteria** — every answer should refine a testable requirement
- **YAGNI ruthlessly** — remove unnecessary features from all designs

Questions to converge on:
1. What problem does this solve? (purpose)
2. Who interacts with it? (roles — facilitator, participant, SME)
3. What existing features does it touch? (integration surface)
4. What does success look like? (testable criteria)
5. What's explicitly out of scope? (boundaries)

## Presenting the Design

- Scale each section to its complexity: a few sentences if straightforward, up to 200-300 words if nuanced
- Ask after each section whether it looks right so far
- Reference specific spec success criteria where they exist
- Cover: architecture, components, data flow, error handling, testing approach
- Be ready to go back and clarify when something doesn't make sense

**Design for isolation and clarity:**
- Break the system into units with one clear purpose and well-defined interfaces
- For each unit: what does it do, how do you use it, what does it depend on?
- Smaller units are easier for agents to implement reliably

**Working in the existing codebase:**
- Explore current structure before proposing changes. Follow existing patterns.
- Where existing code has problems that affect the work, include targeted improvements in the design
- Don't propose unrelated refactoring. Stay focused on what serves the current goal.

## Spec Format

When drafting a new spec, follow the project convention:

```markdown
# SPEC_NAME

## Overview
High-level description and purpose.

## Core Concepts
Key terminology and definitions.

## Behavior
Expected system behavior and rules.

## Data Model
Schema definitions and relationships.

## Implementation
Technical implementation details.

## Success Criteria

### Category Name
- [ ] Testable requirement one
- [ ] Testable requirement two

### Another Category
- [ ] Testable requirement three

## Future Work
Out-of-scope items and roadmap.
```

Success criteria items must be concrete and testable — they become `@pytest.mark.req()` and `@req` tags in tests.

## Terminal State

**The ONLY next step after brainstorming is invoking `writing-plans`.** Do not invoke verification-testing, spec-audit, or any implementation skill directly. The pipeline is:

brainstorming → writing-plans → implementation

## Reference

- Spec index: `/specs/README.md`
- Spec coverage: `just spec-coverage`
- Coverage map: `/specs/SPEC_COVERAGE_MAP.md`
- Existing skills: `.claude/skills/`
