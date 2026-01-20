"""JSONPath utility functions for extracting values from trace data."""

import json
from typing import Optional, Tuple

from jsonpath_ng import parse
from jsonpath_ng.exceptions import JsonPathParserError


def apply_jsonpath(data_str: str, jsonpath_expr: Optional[str]) -> Tuple[Optional[str], bool]:
    """
    Apply JSONPath expression to a JSON string.

    Args:
        data_str: JSON string to query
        jsonpath_expr: JSONPath expression (e.g., "$.messages[0].content")

    Returns:
        Tuple of (extracted_value, success):
        - On success: (extracted_string, True)
        - On failure: (None, False)

    Fallback cases (returns (None, False)):
        - JSONPath expression is empty or None
        - data_str is not valid JSON
        - JSONPath syntax is invalid
        - JSONPath returns no matches
        - JSONPath returns null
        - JSONPath returns empty string
    """
    # Check if JSONPath is configured
    if not jsonpath_expr or not jsonpath_expr.strip():
        return None, False

    # Try to parse the data as JSON
    try:
        data = json.loads(data_str)
    except (json.JSONDecodeError, TypeError):
        return None, False

    # Try to parse and apply the JSONPath expression
    try:
        expr = parse(jsonpath_expr.strip())
        matches = [match.value for match in expr.find(data)]
    except (JsonPathParserError, Exception):
        return None, False

    # Check if we got any matches
    if not matches:
        return None, False

    # Convert matches to strings and join with newlines
    string_matches = []
    for match in matches:
        if match is None:
            continue
        if isinstance(match, str):
            if match:  # Skip empty strings
                string_matches.append(match)
        else:
            # Convert non-string values to string representation
            str_val = str(match)
            if str_val and str_val != "None" and str_val != "null":
                string_matches.append(str_val)

    # Check if we have any valid string results
    if not string_matches:
        return None, False

    # Join multiple matches with newlines
    result = "\n".join(string_matches)

    # Final validation - check for empty or null-like results
    if not result or result.strip() == "" or result == "None" or result == "null":
        return None, False

    return result, True


def validate_jsonpath(jsonpath_expr: str) -> Tuple[bool, Optional[str]]:
    """
    Validate a JSONPath expression.

    Args:
        jsonpath_expr: JSONPath expression to validate

    Returns:
        Tuple of (is_valid, error_message):
        - If valid: (True, None)
        - If invalid: (False, error_description)
    """
    if not jsonpath_expr or not jsonpath_expr.strip():
        return True, None  # Empty is valid (means "not configured")

    try:
        parse(jsonpath_expr.strip())
        return True, None
    except JsonPathParserError as e:
        return False, f"Invalid JSONPath syntax: {str(e)}"
    except Exception as e:
        return False, f"JSONPath parsing error: {str(e)}"
