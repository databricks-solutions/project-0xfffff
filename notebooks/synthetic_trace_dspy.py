"""DSPy signatures for generating synthetic discovery traces.

This module provides DSPy signatures for generating Code Assistant traces
that stress test specific discovery question categories. It can be used
standalone or with DSPy optimizers for self-improving generation.

Reference: https://dspy.ai/learn/programming/signatures/
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field

# Add server to path so we can import QUESTION_CATEGORIES
_server_path = Path(__file__).parent.parent / "server"
if str(_server_path.parent) not in sys.path:
    sys.path.insert(0, str(_server_path.parent))

# Import the canonical category list from the server
from server.services.discovery_dspy import QUESTION_CATEGORIES

# ---------------------------------------------------------------------------
# Pydantic models for synthetic trace generation
# ---------------------------------------------------------------------------

QuestionCategory = Literal[
    "themes",
    "edge_cases",
    "boundary_conditions",
    "failure_modes",
    "missing_info",
    "disagreements",
]

Difficulty = Literal["easy", "medium", "hard"]


class SyntheticTrace(BaseModel):
    """A synthetic Code Assistant trace for discovery testing."""

    input: str = Field(description="The user's code question or request")
    output: str = Field(description="The assistant's response")
    target_categories: list[str] = Field(description="Discovery categories this trace is designed to elicit")
    difficulty: str = Field(default="medium", description="Difficulty level: easy, medium, hard")
    rationale: str = Field(
        default="",
        description="Explanation of why this trace targets the specified categories",
    )


class CategoryCoverageScore(BaseModel):
    """Detailed scoring of how well a trace covers target categories."""

    overall_score: float = Field(ge=0.0, le=1.0, description="Overall coverage score (0-1)")
    category_scores: dict[str, float] = Field(
        default_factory=dict,
        description="Per-category coverage scores (0-1)",
    )
    feedback: str = Field(default="", description="Qualitative feedback on coverage gaps")


# ---------------------------------------------------------------------------
# DSPy signature definitions
# ---------------------------------------------------------------------------


def _import_dspy():
    """Import DSPy lazily."""
    import dspy

    return dspy


def get_generation_signatures() -> dict[str, type]:
    """Get DSPy signature classes for synthetic trace generation.

    Returns a dict with:
    - GenerateSyntheticTrace: Generate a trace targeting specific categories
    - GenerateVariant: Create a variant of an existing trace
    - ScoreTraceCoverage: Evaluate category coverage of a trace
    """
    dspy = _import_dspy()

    class GenerateSyntheticTrace(dspy.Signature):
        """Generate a Code Assistant trace targeting specific discovery categories.

        The trace should be a realistic code assistance interaction that would
        naturally prompt participants to think about the target categories during
        discovery. For example:
        - `edge_cases`: Include unusual inputs like empty arrays, unicode, etc.
        - `boundary_conditions`: Include off-by-one errors, null checks, etc.
        - `failure_modes`: Include buggy code, missing error handling, etc.
        - `missing_info`: Include ambiguous requirements or incomplete context
        - `disagreements`: Include scenarios where multiple solutions are valid
        - `themes`: Include general code quality issues (readability, style, etc.)
        """

        target_categories: list[str] = dspy.InputField(desc=f"Categories to target: {', '.join(QUESTION_CATEGORIES)}")
        difficulty: str = dspy.InputField(
            desc="Difficulty level: easy (obvious issues), medium (subtle issues), hard (complex trade-offs)"
        )
        previous_traces: list[str] = dspy.InputField(
            desc="Summaries of previously generated traces to avoid repetition (may be empty)"
        )

        trace: SyntheticTrace = dspy.OutputField(desc="Generated trace with input, output, and rationale")

    class GenerateVariant(dspy.Signature):
        """Generate a variant of an existing trace to increase diversity.

        Create a new trace that targets the same categories but uses:
        - Different programming language or paradigm
        - Different problem domain (algorithms, web, data, etc.)
        - Different code complexity level
        """

        original_trace: SyntheticTrace = dspy.InputField(desc="Original trace to create variant of")
        variation_type: str = dspy.InputField(desc="Type of variation: language, domain, complexity, or style")

        variant_trace: SyntheticTrace = dspy.OutputField(desc="New trace variant")

    class ScoreTraceCoverage(dspy.Signature):
        """Score how well a trace elicits the target discovery categories.

        Evaluate whether the trace would naturally prompt workshop participants
        to think about each target category during discovery. A good trace:
        - Makes the category-relevant issues obvious enough to notice
        - But subtle enough to require thoughtful analysis
        - Provides enough context for meaningful discussion
        """

        trace: SyntheticTrace = dspy.InputField(desc="Trace to evaluate")
        target_categories: list[str] = dspy.InputField(desc="Categories the trace should elicit")

        score: CategoryCoverageScore = dspy.OutputField(desc="Coverage scores with per-category breakdown and feedback")

    return {
        "GenerateSyntheticTrace": GenerateSyntheticTrace,
        "GenerateVariant": GenerateVariant,
        "ScoreTraceCoverage": ScoreTraceCoverage,
    }


# ---------------------------------------------------------------------------
# Helper functions for notebook use
# ---------------------------------------------------------------------------


def build_lm(
    endpoint_name: str,
    workspace_url: str,
    token: str,
    *,
    temperature: float = 0.7,
):
    """Create a DSPy LM for Databricks model serving.

    Args:
        endpoint_name: Databricks model serving endpoint name
        workspace_url: Databricks workspace URL
        token: Databricks API token
        temperature: Generation temperature (higher = more creative)
    """
    dspy = _import_dspy()

    api_base = f"{workspace_url.rstrip('/')}/serving-endpoints"
    model = f"databricks/{endpoint_name}"

    try:
        return dspy.LM(model=model, api_key=token, api_base=api_base, temperature=temperature)
    except TypeError:
        return dspy.LM(model=model)


def create_predictor(signature_cls: type, lm, *, temperature: float = 0.7):
    """Create a DSPy predictor for a signature class."""
    dspy = _import_dspy()

    # Use DSPy's context manager for thread-safe LM binding
    settings = getattr(dspy, "settings", None)
    if settings is None or not hasattr(settings, "context"):
        raise RuntimeError("DSPy is missing `dspy.settings.context(...)`. Please upgrade DSPy.")

    with settings.context(lm=lm):
        try:
            return dspy.Predict(signature_cls, temperature=temperature)
        except TypeError:
            return dspy.Predict(signature_cls)


def run_predictor(predictor, lm, **kwargs):
    """Execute a DSPy predictor with the given LM context."""
    dspy = _import_dspy()

    settings = getattr(dspy, "settings", None)
    if settings is None or not hasattr(settings, "context"):
        raise RuntimeError("DSPy is missing `dspy.settings.context(...)`. Please upgrade DSPy.")

    with settings.context(lm=lm):
        return predictor(**kwargs)


# ---------------------------------------------------------------------------
# Seed examples for few-shot learning
# ---------------------------------------------------------------------------

SEED_TRACES: list[SyntheticTrace] = [
    # themes - general code quality
    SyntheticTrace(
        input="""Review this function and suggest improvements:
```python
def process(d):
    r = []
    for i in d:
        if i > 0:
            r.append(i * 2)
    return r
```""",
        output="""Here are some improvements for readability and clarity:

```python
def double_positive_numbers(numbers: list[int]) -> list[int]:
    \"\"\"Return a list of positive numbers doubled.\"\"\"
    return [num * 2 for num in numbers if num > 0]
```

Changes made:
- Descriptive function name (`double_positive_numbers` vs `process`)
- Type hints for better documentation
- Docstring explaining the purpose
- List comprehension for conciseness
- Meaningful variable names""",
        target_categories=["themes"],
        difficulty="easy",
        rationale="Highlights general code quality themes like naming, documentation, and readability",
    ),
    # edge_cases - unusual inputs
    SyntheticTrace(
        input="""This JSON parser breaks on some inputs. Can you fix it?
```python
import json

def parse_config(config_str):
    return json.loads(config_str)
```""",
        output="""The function doesn't handle edge cases well. Here's an improved version:

```python
import json
from typing import Any

def parse_config(config_str: str) -> dict[str, Any]:
    \"\"\"Parse a JSON configuration string.\"\"\"
    if not config_str:
        return {}
    
    # Handle BOM (byte order mark) that some editors add
    if config_str.startswith('\ufeff'):
        config_str = config_str[1:]
    
    return json.loads(config_str)
```

This handles:
- Empty strings
- Unicode BOM prefix
- But you may also want to handle: malformed JSON, None input, non-string input""",
        target_categories=["edge_cases"],
        difficulty="medium",
        rationale="Shows edge cases like empty input and unicode BOM, while hinting at more",
    ),
    # boundary_conditions - limits and thresholds
    SyntheticTrace(
        input="""Is there a bug in this pagination function?
```python
def get_page(items, page_num, page_size=10):
    start = page_num * page_size
    end = start + page_size
    return items[start:end]
```""",
        output="""Yes, there's an off-by-one issue if page_num is 1-indexed (as users expect):

```python
def get_page(items, page_num, page_size=10):
    # If page_num is 1-indexed (first page = 1)
    start = (page_num - 1) * page_size
    end = start + page_size
    return items[start:end]
```

However, the original is correct if page_num is 0-indexed. You should:
1. Document which convention you're using
2. Validate page_num >= 1 (or >= 0)
3. Consider what to return for page_num beyond the data (empty list is fine)""",
        target_categories=["boundary_conditions"],
        difficulty="easy",
        rationale="Classic off-by-one boundary condition with pagination indexing",
    ),
    # failure_modes - bugs and security issues
    SyntheticTrace(
        input="""Why does this SQL query sometimes return wrong results?
```python
def get_user(db, username):
    query = f"SELECT * FROM users WHERE username = '{username}'"
    return db.execute(query).fetchone()
```""",
        output="""This code has a **critical SQL injection vulnerability**! A malicious username like `' OR '1'='1` would return all users.

Safe version using parameterized queries:

```python
def get_user(db, username: str):
    query = "SELECT * FROM users WHERE username = ?"
    return db.execute(query, (username,)).fetchone()
```

The issue is string interpolation in SQL. Always use:
- Parameterized queries (shown above)
- Or an ORM like SQLAlchemy that handles escaping""",
        target_categories=["failure_modes"],
        difficulty="medium",
        rationale="Security vulnerability (SQL injection) is a critical failure mode",
    ),
    # missing_info - ambiguous requirements
    SyntheticTrace(
        input="""Write a function to validate an email address.""",
        output="""Here's a basic email validator:

```python
import re

def is_valid_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))
```

**However, I need more context to give you the best solution:**
- Should it check if the domain exists (DNS lookup)?
- Should it handle international email addresses (IDN)?
- Is this for user signup (send verification email) or data validation?
- What's the performance requirement (regex vs library)?

For production, consider using a library like `email-validator` which handles edge cases properly.""",
        target_categories=["missing_info"],
        difficulty="medium",
        rationale="The request lacks context about validation depth, use case, and requirements",
    ),
    # disagreements - multiple valid solutions
    SyntheticTrace(
        input="""Should I use a class or functions for this data processing pipeline?
```python
# Current approach with functions:
def load_data(path): ...
def clean_data(df): ...
def transform_data(df): ...
def save_data(df, path): ...

# Run pipeline
df = load_data("input.csv")
df = clean_data(df)
df = transform_data(df)
save_data(df, "output.csv")
```""",
        output="""Both approaches are valid! Here are the trade-offs:

**Functional approach (current):**
- ✅ Simple and readable
- ✅ Easy to test individual functions
- ✅ Works well for scripts and notebooks
- ❌ State must be passed explicitly

**Class-based approach:**
```python
class DataPipeline:
    def __init__(self, input_path):
        self.df = None
        self.input_path = input_path
    
    def run(self, output_path):
        self.load().clean().transform().save(output_path)
        return self
```
- ✅ Encapsulates state
- ✅ Method chaining is elegant
- ✅ Easier to extend with logging, caching
- ❌ More boilerplate

**My recommendation:** Start with functions. Refactor to a class when you need:
- Multiple pipelines with different configs
- Caching intermediate results
- Complex error handling/retry logic""",
        target_categories=["disagreements"],
        difficulty="hard",
        rationale="Classic design debate with no single correct answer - depends on context",
    ),
]


def get_seed_traces() -> list[SyntheticTrace]:
    """Return seed traces for few-shot learning."""
    return SEED_TRACES.copy()


def get_categories() -> list[str]:
    """Return the canonical list of discovery question categories."""
    return QUESTION_CATEGORIES.copy()
