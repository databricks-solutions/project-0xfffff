# Trace Assignment Specification (Discovery & Annotation Phases)

## Overview
This specification defines how MLflow traces are selected, organized, and assigned to participants across the discovery and annotation phases of a workshop. It establishes a unified model for trace management that works for both phases while accommodating phase-specific requirements like randomization for annotation.

**Note**: This spec leverages [MLflow's labeling datasets](https://mlflow.org/docs/latest/genai/datasets/sdk-guide/) for composable trace organization and future integration with MLflow's native labeling capabilities.

## Core Concepts

### Trace
- A reference/pointer to an MLflow trace (not stored directly in the workshop system)
- Can contain: inputs, outputs, context, execution metadata, and MLflow experiment/trace references
- Immutable at the MLflow level and never deleted
- Can be organized into datasets for management across phases
- Used in both discovery phase (for participant findings) and annotation phase (for SME/participant evaluation)

### Dataset (Labeling Dataset)
- A named, composable set/collection of traces
- Supports operations: merge (union), subtract, intersection
- Can span multiple phases or be phase-specific
- Aligns with [MLflow's labeling datasets](https://mlflow.org/docs/latest/genai/datasets/sdk-guide/) concept for native integration
- Replaces manual trace management with a structured, reusable model
- Examples:
  - `discovery_round1 = [T1, T2, T3]`
  - `annotation_all = discovery_round1 ∪ discovery_round2`
  - `annotation_subset = annotation_all - [problematic_traces]`

### Participant/Annotator
- A user (SME or participant) who receives and views assigned traces
- In **discovery phase**: collects findings/insights on assigned traces
- In **annotation phase**: evaluates assigned traces using rubric questions
- Can have traces assigned individually or as part of a group/cohort
- Should only see traces explicitly assigned to them (or their group) for their current phase
- In annotation phase, receives randomized trace order per user (different order per annotator to avoid bias)

### Facilitator
- User role with authority to assign traces (datasets) to participants
- Controls which traces are visible to which participants at each phase
- No annotation authority - facilitators do not annotate traces themselves

## Assignment Model

### Default Behavior
- **Default visibility**: All participants see all traces in the current dataset
- **Granular assignment**: Supports optional configuration to map subsets of participants to subsets of traces
- This provides flexibility: simple cases require no configuration, complex cases can be configured

### Assignment Tracking
Each trace assignment tracks:
- `trace_id`: Reference to the MLflow trace
- `participant_id`: Participant receiving the trace
- `assigned_at`: Timestamp of assignment
- `phase`: Discovery phase identifier
- `round`: Discovery round identifier within the phase
- `dataset_id`: Which dataset this assignment came from

### One-to-Many Assignment
- A single trace can be assigned to multiple participants simultaneously
- Each participant-trace pair has its own assignment record with metadata
- Participants share the same trace reference but maintain independent viewing state

## Phase-Specific Behavior

### Discovery Phase
- **Purpose**: Participants collect findings and insights on assigned traces
- **Assignment model**: All participants see same traces in same order (default behavior)
- **Visibility**: Facilitator can optionally configure subset assignments, or use default (all see all)
- **Trace order**: Non-randomized, consistent across all participants for that round
- **Trace persistence**: When new discovery round starts, old traces hidden (unless re-included in new dataset)

### Annotation Phase
- **Purpose**: SMEs/participants evaluate traces using predefined rubric questions
- **Assignment model**: All annotators work on same dataset (same traces), but see different randomized orders
- **Randomization requirement**: Different randomized order per annotator to minimize bias
  - Deterministic: same seed (user_id + trace set) produces same order for that user
  - Consistent: trace order doesn't change mid-annotation unless trace set changes
  - Different per user: each annotator sees different order (seed includes user_id)
- **Trace persistence**: When new annotation round starts, old traces hidden, new dataset becomes active
- **Trace reuse**: Can annotate same trace with different rubrics across different annotation rounds

## Implementation: Trace Randomization for Annotation

The annotation phase uses deterministic per-user randomization:

```
Randomization Algorithm:
1. For each annotator user_id and active_trace_set:
   - seed = SHA256(user_id + sorted(trace_ids))
   - random.Random(seed).shuffle(trace_ids)
   - Result: Deterministic, unique order per user

2. When trace set changes:
   - Preserve existing order for traces already seen by user
   - Randomize only new traces added
   - Append new traces to user's existing trace list

3. When annotation round changes:
   - Clear trace order for user (start fresh)
   - Generate new randomized order from new dataset
```

**Benefits**:
- Eliminates annotation bias from trace ordering
- Allows inter-rater reliability (IRR) measurement between annotators
- Ensures reproducibility if user returns to annotation
- Handles incremental trace additions without disrupting existing progress

## Lifecycle & Reset Behavior

### Starting a New Discovery Round
1. Facilitator optionally creates or selects a new dataset of traces
2. New dataset becomes the active trace set for the current round
3. **Effect**: Replaces the previous round's trace set
   - Participants stop seeing traces from the previous round (unless they're in the new dataset)
   - Participants only see traces assigned in the current round
4. Previous assignments remain in the system as historical records

### Reset Functionality
- Clearing/resetting traces should operate at the dataset level
- Datasets can be composed from other datasets (merge, union, subtract operations)
- Example: `new_dataset = current_dataset - old_traces + new_traces`
- This preserves audit trail and allows rollback if needed

### Trace Visibility Rules
A participant sees a trace if and only if:
1. The trace is in the current dataset/round, AND
2. Either:
   - Default visibility is enabled (all participants see all traces), OR
   - The facilitator has explicitly assigned that trace to the participant or their cohort

## Example Scenarios

### Scenario 1: Simple Sequential Discovery & Annotation

**Discovery Phase**:
```
Discovery Round 1:
  - Facilitator creates discovery_dataset_1 = [T1, T2, T3]
  - All participants see traces in order: T1, T2, T3
  - Participants submit findings on each trace

Discovery Round 2 (New Traces Added):
  - Facilitator creates discovery_dataset_2 = [T4, T5]
  - All participants now see only T4, T5
  - T1, T2, T3 no longer visible (old round traces hidden)
  - Findings from Round 1 preserved in history
```

**Annotation Phase** (using traces from discovery):
```
Annotation Round 1:
  - Facilitator creates annotation_dataset_1 = discovery_dataset_1 ∪ discovery_dataset_2
  - annotation_dataset_1 = [T1, T2, T3, T4, T5]

  Annotator A sees: T3, T1, T4, T2, T5 (randomized with seed: SHA256(userA + [T1,T2,T3,T4,T5]))
  Annotator B sees: T5, T2, T1, T4, T3 (different randomization with seed: SHA256(userB + [T1,T2,T3,T4,T5]))
  Annotator C sees: T4, T1, T3, T5, T2 (different again)

  All evaluate same 5 traces but in different order, enabling IRR measurement

Annotation Round 2 (Refined Set):
  - Facilitator creates annotation_dataset_2 = annotation_dataset_1 - [T2, T5]
  - annotation_dataset_2 = [T1, T3, T4]
  - Fresh randomization for all annotators for new dataset
```

### Scenario 2: Selective Assignment (With Configuration)

**Discovery Phase**:
```
Discovery Round 1 (Configured):
  - Facilitator creates discovery_dataset_1 = [T1, T2, T3, T4]
  - Custom configuration:
    - Group A (users U1, U2) → see traces [T1, T2]
    - Group B (users U3, U4) → see traces [T3, T4]

  User U1 sees: T1, T2 (in that order)
  User U3 sees: T3, T4 (in that order)
```

### Scenario 3: Dataset Composition for Annotation

```
State After Discovery:
  - discovery_round_1 = [T1, T2, T3]
  - discovery_round_2 = [T4, T5]
  - problematic_traces = [T2, T5]  (identified by facilitator for exclusion)

Annotation Composition:
  - all_discovery = discovery_round_1 ∪ discovery_round_2 = [T1, T2, T3, T4, T5]
  - annotation_dataset = all_discovery - problematic_traces = [T1, T3, T4]

  Facilitator sets annotation_dataset as active for annotation phase
  - All annotators work on same traces: T1, T3, T4
  - Each gets different randomized order
  - Can measure inter-rater reliability
```

## Current Bugs & Fixes

### Bug 1: Old Discovery Traces Persist After Reset

**Current Behavior (Buggy)**:
- When facilitator adds new discovery traces or resets discovery dataset, old traces continue to appear
- Participants see traces from all historical discovery rounds mixed together
- No clear round/phase separation - users confused about which traces are current

**Expected Behavior (Fixed)**:
- Each discovery round has its own active dataset
- Participants only see traces in the current active discovery dataset
- Previous round traces hidden (not deleted, but not visible) unless explicitly re-included
- When switching discovery rounds, trace order resets for that round
- Assignment metadata properly scopes traces to phase/round

**Root Cause**:
- `active_discovery_trace_ids` and `active_annotation_trace_ids` not being properly cleared on phase transition
- No round/phase context in trace assignment tracking
- Missing logic to filter out old traces when a new dataset becomes active

### Bug 2: Annotation Randomization Not Working Properly

**Current Behavior (Buggy)**:
- When facilitator resets annotation traces or changes annotation dataset, randomization breaks
- Users may see repeated traces or traces in wrong order
- Trace randomization doesn't persist correctly across page reloads

**Expected Behavior (Fixed)**:
- Randomization deterministic per (user_id, trace_set) pair
- Order consistent across page reloads for same trace set
- When trace set changes, new traces appended (not full re-randomization)
- When annotation round changes, full re-randomization from new dataset
- Randomization context includes phase and round info

**Root Cause**:
- Randomization seed not including full context (phase/round)
- No distinction between "change within round" vs "new round"
- User trace order not being cleared when annotation dataset changes

## Implementation: Data Model Changes

### Phase/Round Context
Tracks where each assignment lives in the workshop timeline:

```
PhaseRoundContext:
  - phase: WorkshopPhase (discovery, annotation, rubric, etc.)
  - round: int (1-indexed, increments with each dataset change in phase)
```

### Dataset Model
```
Dataset (aligns with MLflow labeling dataset):
  - id: UUID
  - workspace/project_id: Optional[str]  (for MLflow integration)
  - name: string (human-readable, e.g., "discovery_round_1", "annotation_all")
  - phase_round_context: PhaseRoundContext
  - trace_ids: List[str]  (MLflow trace references)
  - source_datasets: List[Dataset]  (for composition tracking)
  - operations: List[str]  (audit trail: ["union", "subtract", ...])
  - created_at: timestamp
  - created_by: UUID (facilitator)

Operations Log Example:
  [
    "created with traces [T1, T2, T3]",
    "union with discovery_round_2",
    "subtract [T2, T5]"
  ]
```

### Trace Assignment Model
```
TraceAssignment:
  - id: UUID
  - trace_id: string (MLflow trace reference)
  - participant_id: UUID
  - phase_round_context: PhaseRoundContext
  - dataset_id: UUID  (which dataset this assignment came from)
  - assigned_at: timestamp
  - created_by: UUID (facilitator)

  # Annotation-specific (optional)
  - randomization_seed: Optional[str]  (SHA256(participant_id + sorted(trace_ids)))
  - trace_order_index: Optional[int]  (position in participant's randomized order)
```

### User Trace Order Model (Already Exists)
```
UserTraceOrder:
  - id: UUID
  - user_id: UUID
  - workshop_id: UUID
  - phase_round_context: PhaseRoundContext  (NEW - add this)
  - discovery_traces: List[str]  (ordered trace IDs for discovery)
  - annotation_traces: List[str]  (ordered trace IDs for annotation)
  - updated_at: timestamp
```

### Phase State Model
```
PhaseState:
  - phase: WorkshopPhase
  - workshop_id: UUID
  - current_round: int
  - active_dataset_id: UUID  (current dataset for this phase/round)
  - visibility_config: {
      default_visibility: bool,
      custom_mappings: [
        {
          participant_group: List[UUID],
          dataset_id: UUID
        }
      ]
    }
  - updated_at: timestamp
```

## Implementation: Query Patterns

### Get Visible Traces for Participant in Current Phase/Round
```python
# Get active dataset for current phase
active_dataset = db.query(PhaseState)\
  .filter(
    PhaseState.phase == current_phase,
    PhaseState.workshop_id == workshop_id
  ).first()

# Get traces assigned to this participant in this context
traces = db.query(Trace)\
  .join(TraceAssignment)\
  .filter(
    TraceAssignment.participant_id == participant_id,
    TraceAssignment.phase_round_context.phase == current_phase,
    TraceAssignment.phase_round_context.round == active_dataset.current_round,
    TraceAssignment.dataset_id == active_dataset.active_dataset_id
  ).all()
```

### Handle Phase/Round Transition
```python
def activate_new_dataset(workshop_id, phase, dataset_id):
    """Transition to a new dataset in a phase."""
    phase_state = db.query(PhaseState)\
      .filter(PhaseState.workshop_id == workshop_id, PhaseState.phase == phase)\
      .first()

    # Increment round
    new_round = (phase_state.current_round or 0) + 1
    phase_state.active_dataset_id = dataset_id
    phase_state.current_round = new_round
    db.commit()

    # Clear user trace orders for this phase (force re-randomization for annotation)
    db.query(UserTraceOrder)\
      .filter(
        UserTraceOrder.workshop_id == workshop_id,
        UserTraceOrder.phase_round_context.phase == phase,
        UserTraceOrder.phase_round_context.round == new_round - 1  # old round
      ).delete()
    db.commit()
```

## Success Criteria

**Bug Fix 1 - Discovery Traces**:
- [ ] Participants only see traces in current active discovery dataset
- [ ] When new discovery round starts, old traces hidden (not deleted)
- [ ] Switching between discovery rounds hides/shows appropriate traces
- [ ] Phase/round context properly scoped in database

**Bug Fix 2 - Annotation Randomization**:
- [ ] Annotation traces randomized per (user_id, trace_set) pair
- [ ] Randomization persistent across page reloads for same trace set
- [ ] When annotation dataset changes mid-round, new traces appended
- [ ] When annotation round changes, full re-randomization applied
- [ ] Randomization context includes phase and round info

**General**:
- [ ] Dataset operations (union, subtract) work correctly and maintain audit trail
- [ ] Multiple participants can see same trace with different orders
- [ ] Assignment metadata properly tracks all context
- [ ] Inter-rater reliability (IRR) can be measured (same traces, different orders)

## Future Work (Out of Scope for Current Bug Fix)

1. **MLflow Native Integration**: Leverage MLflow's labeling datasets API directly instead of custom implementation
2. **Per-participant trace assignment**: Move beyond default + cohort model to true individual assignments
3. **Topic-based automatic assignment**: Automatic assignment based on trace content/category
4. **SME specialty mapping**: System-aware assignment based on expertise areas
5. **Trace completion tracking**: Mark traces as "reviewed/annotated" with granular status
