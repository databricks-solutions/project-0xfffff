"""Unit tests for JSONPath utility functions."""

import pytest

from server.utils.jsonpath_utils import apply_jsonpath, validate_jsonpath


class TestApplyJsonPath:
    """Tests for the apply_jsonpath function."""

    def test_simple_extraction(self):
        """Test extracting a simple top-level value."""
        data = '{"message": "hello"}'
        result, success = apply_jsonpath(data, "$.message")
        assert success is True
        assert result == "hello"

    def test_nested_extraction(self):
        """Test extracting a nested value."""
        data = '{"response": {"text": "answer"}}'
        result, success = apply_jsonpath(data, "$.response.text")
        assert success is True
        assert result == "answer"

    def test_array_index_extraction(self):
        """Test extracting a value from an array by index."""
        data = '{"messages": [{"content": "first"}, {"content": "second"}]}'
        result, success = apply_jsonpath(data, "$.messages[0].content")
        assert success is True
        assert result == "first"

    def test_array_extraction_multiple(self):
        """Test extracting multiple values from an array."""
        data = '{"messages": [{"content": "a"}, {"content": "b"}, {"content": "c"}]}'
        result, success = apply_jsonpath(data, "$.messages[*].content")
        assert success is True
        assert result == "a\nb\nc"

    def test_no_match_returns_failure(self):
        """Test that a query with no matches returns failure."""
        data = '{"foo": "bar"}'
        result, success = apply_jsonpath(data, "$.missing")
        assert success is False
        assert result is None

    def test_invalid_json_returns_failure(self):
        """Test that invalid JSON returns failure."""
        data = "not json"
        result, success = apply_jsonpath(data, "$.anything")
        assert success is False
        assert result is None

    def test_null_result_returns_failure(self):
        """Test that a null result returns failure."""
        data = '{"value": null}'
        result, success = apply_jsonpath(data, "$.value")
        assert success is False
        assert result is None

    def test_empty_jsonpath_returns_failure(self):
        """Test that an empty JSONPath returns failure."""
        data = '{"message": "hello"}'

        result, success = apply_jsonpath(data, "")
        assert success is False
        assert result is None

        result, success = apply_jsonpath(data, "   ")
        assert success is False
        assert result is None

        result, success = apply_jsonpath(data, None)
        assert success is False
        assert result is None

    def test_invalid_jsonpath_syntax_returns_failure(self):
        """Test that invalid JSONPath syntax returns failure."""
        data = '{"message": "hello"}'
        result, success = apply_jsonpath(data, "$.[invalid")
        assert success is False
        assert result is None

    def test_empty_string_result_returns_failure(self):
        """Test that an empty string result returns failure."""
        data = '{"message": ""}'
        result, success = apply_jsonpath(data, "$.message")
        assert success is False
        assert result is None

    def test_numeric_value_converted_to_string(self):
        """Test that numeric values are converted to strings."""
        data = '{"count": 42}'
        result, success = apply_jsonpath(data, "$.count")
        assert success is True
        assert result == "42"

    def test_boolean_value_converted_to_string(self):
        """Test that boolean values are converted to strings."""
        data = '{"active": true}'
        result, success = apply_jsonpath(data, "$.active")
        assert success is True
        assert result == "True"

    def test_deeply_nested_extraction(self):
        """Test extracting from deeply nested structures."""
        data = '{"a": {"b": {"c": {"d": "deep"}}}}'
        result, success = apply_jsonpath(data, "$.a.b.c.d")
        assert success is True
        assert result == "deep"

    def test_array_with_mixed_values(self):
        """Test extracting from array with some null values (nulls filtered out)."""
        data = '{"items": ["one", null, "three"]}'
        result, success = apply_jsonpath(data, "$.items[*]")
        assert success is True
        # Null values should be filtered out
        assert result == "one\nthree"

    def test_whitespace_in_jsonpath_trimmed(self):
        """Test that whitespace in JSONPath expression is trimmed."""
        data = '{"message": "hello"}'
        result, success = apply_jsonpath(data, "  $.message  ")
        assert success is True
        assert result == "hello"


class TestValidateJsonPath:
    """Tests for the validate_jsonpath function."""

    def test_valid_jsonpath(self):
        """Test that valid JSONPath expressions are accepted."""
        is_valid, error = validate_jsonpath("$.message")
        assert is_valid is True
        assert error is None

    def test_valid_nested_jsonpath(self):
        """Test that valid nested JSONPath expressions are accepted."""
        is_valid, error = validate_jsonpath("$.response.text")
        assert is_valid is True
        assert error is None

    def test_valid_array_jsonpath(self):
        """Test that valid array JSONPath expressions are accepted."""
        is_valid, error = validate_jsonpath("$.messages[0].content")
        assert is_valid is True
        assert error is None

    def test_valid_wildcard_jsonpath(self):
        """Test that valid wildcard JSONPath expressions are accepted."""
        is_valid, error = validate_jsonpath("$.messages[*].content")
        assert is_valid is True
        assert error is None

    def test_empty_jsonpath_is_valid(self):
        """Test that empty JSONPath (meaning 'not configured') is valid."""
        is_valid, error = validate_jsonpath("")
        assert is_valid is True
        assert error is None

        is_valid, error = validate_jsonpath("   ")
        assert is_valid is True
        assert error is None

    def test_invalid_jsonpath_syntax(self):
        """Test that invalid JSONPath syntax is rejected."""
        is_valid, error = validate_jsonpath("$.[invalid")
        assert is_valid is False
        assert error is not None
        assert "Invalid JSONPath" in error or "parsing error" in error.lower()
