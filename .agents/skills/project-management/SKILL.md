---
name: project-management
description: Guide for managing GitHub projects, issues, epics, and milestones using the "Conveyor Belt" model. Use when organizing work, creating issues, or planning sprints.
disable-model-invocation: true
---

# Project Management & Issue Tracking

This repository uses a "Conveyor Belt" model for project management. We deliver large initiatives (like V2) in vertical slices, but **defer later design decisions** until we are ready to build them.

**Crucial Division of Labor:** Humans spend most of their time writing specs (Spec & Design Desk). Agents write most of the code based on those specs (Current Release).

## The 3 Pillars of the Conveyor Belt

### 1. Epic Hierarchy & Native Sub-issues
- **North-Star Epic:** The overarching tracker for the initiative.
- **Sub-Epics (Vertical Slices):** The initiative is broken into sequential slices.
- **Native Sub-issues:** We use GitHub's native Sub-issues feature (NOT markdown task lists) to link work. Every `type: spec` and `type: implementation` issue must be added as a native sub-issue to its corresponding Sub-Epic.

### 2. State: Just-in-Time Specs & Project Statuses
Code is never written until the spec is merged. We track this state using **Type Labels** and the native **GitHub Project Status** field.

**Type Labels (What kind of work is this?):**
- `type: spec`: Human-led discovery, design, and specification work.
- `type: implementation`: Agent-led coding work, strictly bound to a merged spec.

**GitHub Project Statuses (Where is it in the pipeline?):**
Instead of generic "Todo/In Progress/Done", our project board uses a customized Status field to track the conveyor belt:
1. `Todo`: Work is planned but not started.
2. `Designing`: A human is actively writing the spec or design document.
3. `Architecture Review`: The spec is drafted and needs human review/approval.
4. `Ready for Dev`: The spec is merged. The implementation issue is ready for an agent to pick up.
5. `In Progress`: An agent (or human) is actively coding the implementation.
6. `Code Review`: The implementation PR is open and needs human review.
7. `Done`: Merged and complete.

### 3. Time: Milestones = Major Releases
Milestones represent the timeline for shipping a major version to users.
- If a release (like V2.0) requires multiple vertical slices, **all epics and issues for those slices belong in that single milestone**.
- The milestone contains **both** the `type: spec` issues and `type: implementation` issues for the release.

---

## Current Initiative: JBW V2 Architecture Flow

V2 is divided into 5 vertical slices. **We will not ship V2.0 until all 5 slices are complete.** Therefore, all 5 Slice Epics belong in the V2.0 milestone.

1. **Slice 1: Workshop Setup** (`v2: 1-setup`)
2. **Slice 2: Sprint Orchestration** (`v2: 2-sprint`)
3. **Slice 3: Facilitator Dashboard** (`v2: 3-dashboard`)
4. **Slice 4: Reviewer Feed** (`v2: 4-feed`)
5. **Slice 5: Rubric / Judge Edit** (`v2: 5-tuning`)

## GitHub Project Board Views

The project board should be organized into three specific views to support this model:
1. **Current Release (Kanban):** Filtered by the active milestone (e.g., `V2.0`). Where agents pick up `type: implementation` issues.
2. **V2 Roadmap (Table/Roadmap):** Filtered by `label:epic`. The 10,000-foot view of the 5 slices.
3. **Spec & Design Desk (Kanban):** Filtered by `label:"type: spec"`. Where humans live, writing the deferred designs for upcoming slices.

## Workflow for Creating Work
1. **Starting a new slice:** Create `type: spec` issues for the slice, assign them to the target Milestone, and add them as **native sub-issues** to the slice's Epic. Set the Project Status to `Todo` or `Designing`.
2. **Reviewing specs:** When a spec is ready for review, move its Project Status to `Architecture Review`.
3. **After specs merge:** Create `type: implementation` issues, add them as **native sub-issues** to the slice's Epic, assign them to the same Milestone, and set their Project Status to `Ready for Dev`.
4. **Reviewing code:** When an agent opens a PR, move the implementation issue's Project Status to `Code Review`.
