# User-Specific Trace Randomization Implementation

## Overview
This implementation adds randomization to the discovery and annotation phases where traces are shown to users. Each user sees the same set of traces, but in a different randomized order that is unique and consistent for that user.

## Key Features

### 1. **User-Specific Randomization**
- Each user gets a unique randomized order based on their `user_id`
- Uses MD5 hash of `user_id` as a deterministic seed
- Ensures consistent ordering across multiple requests for the same user

### 2. **Persistent Storage**
- User-specific trace orders are stored in the `user_trace_orders` database table
- Contains separate fields for `discovery_traces` and `annotation_traces`
- Automatically created when a user first requests traces

### 3. **Dynamic Updates**
- When new traces are added to a phase, the system:
  - Preserves the order of traces the user has already seen
  - Randomizes only the new traces being added
  - Appends randomized new traces to the end of the existing order

## Modified Files

### 1. `server/services/database_service.py`

#### New Method: `_generate_randomized_trace_order()`
```python
def _generate_randomized_trace_order(self, trace_ids: List[str], user_id: str) -> List[str]:
```
- Generates a deterministic random order based on user_id AND the trace IDs themselves
- Uses MD5 hash of `user_id + sorted_trace_ids` to create a consistent seed
- This ensures that:
  - Same user sees same order for same set of traces (deterministic)
  - Different users see different orders for the same set of traces
  - When new traces are added, they get truly randomized per user (not predictable)
- Returns shuffled list of trace IDs

#### Modified: `get_active_discovery_traces()`
- Now checks for existing user trace order
- Creates new order if not found
- Updates order if trace set has changed
- Returns traces in user-specific order

#### Modified: `get_active_annotation_traces()`
- Same logic as discovery traces
- Uses `annotation_traces` field instead

### 2. `server/routers/workshops.py`

#### Modified: `begin_discovery_phase()`
- Updated documentation to mention per-user randomization
- Updated success message to reflect randomization
- Traces are still selected chronologically, but displayed randomly per user

#### Modified: `begin_annotation_phase()`
- Same updates as discovery phase
- Maintains existing random sampling of initial trace set
- Each user sees sampled traces in their own order

#### Modified: `add_traces()`
- Updated comments to clarify user-specific randomization happens automatically
- No logic changes needed - handled by trace fetching methods

## How It Works

### Discovery Phase Flow

1. **Facilitator starts discovery phase**
   ```
   POST /workshops/{workshop_id}/begin-discovery?trace_limit=10
   ```
   - Selects first 10 traces (chronological)
   - Stores them in `workshop.active_discovery_trace_ids`

2. **User requests traces**
   ```
   GET /workshops/{workshop_id}/traces?user_id={user_id}
   ```
   - System checks for existing `UserTraceOrder` for this user
   - If not found, creates one with randomized order
   - Returns traces in user's randomized order

3. **Adding more traces**
   ```
   POST /workshops/{workshop_id}/add-traces
   {"additional_count": 3}
   ```
   - New traces added to `active_discovery_trace_ids`
   - When user requests traces again:
     - Existing traces remain in same order
     - New traces are randomized and appended

### Example Scenarios

#### Scenario 1: Initial Discovery (10 traces)
```
Workshop has 10 traces selected: [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10]

User A sees: [T5, T2, T9, T1, T7, T3, T10, T4, T8, T6]
User B sees: [T3, T7, T1, T5, T9, T2, T6, T10, T4, T8]
User C sees: [T8, T1, T4, T9, T2, T5, T7, T3, T6, T10]
```

#### Scenario 2: Adding 3 More Traces
```
Workshop now has: [T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13]

User A sees: [T5, T2, T9, T1, T7, T3, T10, T4, T8, T6, T13, T11, T12]
                                                      ↑ new traces randomized differently per user
User B sees: [T3, T7, T1, T5, T9, T2, T6, T10, T4, T8, T11, T13, T12]
User C sees: [T8, T1, T4, T9, T2, T5, T7, T3, T6, T10, T12, T11, T13]
```

**Key Point**: The 3 new traces (T11, T12, T13) appear in DIFFERENT orders for each user!

## Testing Results

All verification tests passed:
- ✅ Each user sees all traces (same set, different order)
- ✅ Orders are different for different users
- ✅ Order is consistent for the same user (deterministic)
- ✅ Works with different trace set sizes (3 and 10 traces)
- ✅ New traces are properly appended while preserving existing order

## Benefits

1. **Reduces Bias**: Different users see traces in different orders, reducing order effects
2. **Consistency**: Same user always sees the same order across sessions
3. **Scalability**: Works efficiently with any number of users and traces
4. **Backward Compatible**: Existing workshops continue to work
5. **Applies to Both Phases**: Works in both discovery and annotation phases

## Database Schema

The existing `user_trace_orders` table is used:
```sql
CREATE TABLE user_trace_orders (
    id VARCHAR PRIMARY KEY,
    user_id VARCHAR NOT NULL,
    workshop_id VARCHAR NOT NULL,
    discovery_traces JSON DEFAULT [],
    annotation_traces JSON DEFAULT [],
    created_at DATETIME,
    updated_at DATETIME
)
```

## Notes

- Randomization uses MD5 hash of `user_id + sorted_trace_ids` for deterministic seeding
- Including the trace IDs in the seed ensures new traces get truly randomized per user
- Same algorithm works for both discovery and annotation phases
- No changes needed to frontend - API remains the same
- Facilitators still see traces in chronological order (no user_id filtering)

## Bug Fix: Improved Randomization for Added Traces

**Issue**: When new traces were added, all users would see them in similar patterns because only `user_id` was used as the seed.

**Solution**: Now uses `user_id + sorted_trace_ids` as the seed, ensuring that:
1. Same user sees consistent order for the same set of traces
2. Different users see different orders for any set of traces
3. When new traces are added, they get truly randomized per user

**Example**:
- OLD: User A gets `[T5, T6, T7]`, User B gets `[T6, T7, T5]` (limited variation)
- NEW: User A gets `[T7, T5, T6]`, User B gets `[T7, T6, T5]`, User C gets `[T5, T6, T7]` (true randomization)

