# Datasets Specification

## Overview

This specification defines the dataset model for organizing MLflow traces across all workshop phases. Datasets are composable collections of trace references that enable flexible trace management, per-user randomization, and integration with [MLflow's labeling datasets](https://mlflow.org/docs/latest/genai/datasets/sdk-guide/).

## MLflow Integration Context

### Alignment with MLflow Labeling Datasets

Workshop datasets align with MLflow's native labeling dataset concept:

```
┌─────────────────────────────────────────────────────────────┐
│                    MLflow Tracking Server                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              MLflow Traces                           │    │
│  │    (inputs, outputs, spans, execution metadata)      │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         MLflow Labeling Datasets (future)            │    │
│  │      (native trace collections for labeling)         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Workshop Application                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Workshop Datasets (this spec)             │    │
│  │   (composable trace sets for discovery/annotation)   │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Future migration**: When MLflow's labeling datasets API matures, workshop datasets will delegate to MLflow directly rather than maintaining a parallel implementation.

## Core Concepts

### Dataset
- A named, composable set/collection of trace references
- Does NOT store trace data (only references to MLflow traces)
- Supports set operations: union, subtract, intersection
- Can be phase-specific or span multiple phases
- Immutable once created (create new dataset for modifications)

### Trace Reference
- Pointer to an MLflow trace (not stored in workshop system)
- Identified by `trace_id` (MLflow trace ID)
- Can belong to multiple datasets simultaneously
- Never deleted from MLflow (only removed from dataset membership)

### Active Dataset
- The currently selected dataset for a given phase
- Determines which traces are visible to participants
- Can change as facilitator progresses through rounds

## Dataset Operations

### Union (Merge)

Combine traces from multiple datasets:

```
dataset_A = [T1, T2, T3]
dataset_B = [T3, T4, T5]

dataset_C = dataset_A ∪ dataset_B = [T1, T2, T3, T4, T5]
```

### Subtract (Exclude)

Remove traces from a dataset:

```
all_traces = [T1, T2, T3, T4, T5]
problematic = [T2, T5]

clean_dataset = all_traces - problematic = [T1, T3, T4]
```

### Intersection

Find common traces:

```
dataset_A = [T1, T2, T3, T4]
dataset_B = [T3, T4, T5, T6]

overlap = dataset_A ∩ dataset_B = [T3, T4]
```

## Per-User Randomization

Datasets support per-user randomized ordering to reduce annotation bias.

### Randomization Algorithm

```python
def generate_randomized_order(trace_ids: List[str], user_id: str) -> List[str]:
    """Generate deterministic random order for user."""
    # Seed includes both user and trace set for true per-user randomization
    sorted_ids = sorted(trace_ids)
    seed_string = user_id + ''.join(sorted_ids)
    seed = int(hashlib.md5(seed_string.encode()).hexdigest()[:8], 16)

    rng = random.Random(seed)
    shuffled = trace_ids.copy()
    rng.shuffle(shuffled)
    return shuffled
```

### Key Properties

| Property | Behavior |
|----------|----------|
| **Deterministic** | Same user + same trace set = same order |
| **Unique per user** | Different users see different orders |
| **Stable across sessions** | Page reload preserves order |
| **Incremental** | Adding traces appends (doesn't reshuffle existing) |

### Incremental Updates

When traces are added to a dataset, existing order is preserved:

```python
def update_order_with_new_traces(
    existing_order: List[str],
    new_trace_set: List[str],
    user_id: str
) -> List[str]:
    """Add new traces without disrupting existing order."""
    existing_set = set(existing_order)
    new_traces = [t for t in new_trace_set if t not in existing_set]

    if not new_traces:
        return existing_order

    # Randomize only the new traces
    randomized_new = generate_randomized_order(new_traces, user_id)

    return existing_order + randomized_new
```

### Round Transitions

When a new round starts (new active dataset), full re-randomization occurs:

```python
def start_new_round(new_dataset: Dataset, user_id: str) -> List[str]:
    """Fresh randomization for new round."""
    # Clear existing order
    # Generate completely new randomized order
    return generate_randomized_order(new_dataset.trace_ids, user_id)
```

## Data Model

### Dataset

```
Dataset:
  - id: UUID
  - name: string                    # Human-readable, e.g., "discovery_round_1"
  - workspace_id: Optional[str]     # For MLflow integration
  - trace_ids: List[str]            # MLflow trace references
  - source_datasets: List[UUID]     # Parent datasets (for composition tracking)
  - operation: Optional[str]        # How this dataset was created
  - created_at: timestamp
  - created_by: UUID                # Facilitator who created it
```

### UserTraceOrder

```
UserTraceOrder:
  - id: UUID
  - user_id: UUID
  - workshop_id: UUID
  - dataset_id: UUID                # Which dataset this order is for
  - ordered_trace_ids: List[str]    # User's randomized order
  - created_at: timestamp
  - updated_at: timestamp

  UNIQUE(user_id, workshop_id, dataset_id)
```

### Operations Log

Each dataset tracks how it was created:

```json
{
  "operation": "subtract",
  "sources": ["dataset_uuid_1"],
  "removed": ["T2", "T5"],
  "timestamp": "2026-01-15T10:30:00Z",
  "created_by": "facilitator_uuid"
}
```

## Phase Usage

### Discovery Phase

```
Discovery Dataset Usage:
- Facilitator creates/selects dataset for each round
- All participants see same traces
- Order: chronological (not randomized)
- Round change: new dataset becomes active, old hidden
```

### Annotation Phase

```
Annotation Dataset Usage:
- Facilitator creates/selects dataset (often composed from discovery)
- All annotators see same traces
- Order: randomized per user (for bias reduction)
- Enables IRR measurement (same traces, different orders)
- Round change: new dataset, fresh randomization
```

### Example Workflow

```
1. Discovery Round 1
   - Create dataset: discovery_r1 = [T1, T2, T3]
   - Participants review traces

2. Discovery Round 2
   - Create dataset: discovery_r2 = [T4, T5]
   - Old traces hidden, new traces visible

3. Annotation Round 1
   - Compose dataset: annotation_r1 = discovery_r1 ∪ discovery_r2
   - annotation_r1 = [T1, T2, T3, T4, T5]
   - Each annotator sees randomized order

   User A: [T3, T1, T4, T2, T5]
   User B: [T5, T2, T1, T4, T3]
   User C: [T4, T1, T3, T5, T2]

4. Annotation Round 2 (refined)
   - Create dataset: annotation_r2 = annotation_r1 - [T2, T5]
   - annotation_r2 = [T1, T3, T4]
   - Fresh randomization for all users
```

## API Patterns

### Create Dataset

```
POST /workshops/{workshop_id}/datasets
{
  "name": "discovery_round_1",
  "trace_ids": ["trace_1", "trace_2", "trace_3"]
}
```

### Compose Dataset

```
POST /workshops/{workshop_id}/datasets/compose
{
  "name": "annotation_all",
  "operation": "union",
  "source_dataset_ids": ["uuid_1", "uuid_2"]
}
```

### Get Traces (with user ordering)

```
GET /workshops/{workshop_id}/datasets/{dataset_id}/traces?user_id={user_id}

Response: Traces in user's randomized order (or chronological if no user_id)
```

## Success Criteria

- [ ] Datasets can be created with arbitrary trace lists
- [ ] Union operation combines traces from multiple datasets
- [ ] Subtract operation removes specified traces
- [ ] Same user sees same order for same dataset (deterministic)
- [ ] Different users see different orders (per-user randomization)
- [ ] Adding traces preserves existing order (incremental)
- [ ] New round triggers fresh randomization
- [ ] Dataset lineage tracked (source datasets, operations)
- [ ] Facilitators see chronological order (no randomization)

## Future Work

1. **MLflow Native Integration**: Delegate to MLflow labeling datasets API when available
2. **Intersection Operation**: Find common traces between datasets
3. **Smart Composition**: Auto-suggest dataset compositions based on phase transitions
4. **Version History**: Track dataset changes over time with rollback capability
5. **Export to MLflow**: Push workshop dataset definitions to MLflow
