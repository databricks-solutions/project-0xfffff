"""Tests for build_custom_llm() in discovery_dspy.py.

Covers LM construction with openai/ prefix, duplicate-prefix avoidance,
custom temperature, and TypeError fallback.
"""

from unittest.mock import MagicMock, patch

import pytest

from server.services.discovery_dspy import build_custom_llm


# ============================================================================
# build_custom_llm
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
def test_build_custom_llm_creates_lm_with_openai_prefix():
    """build_custom_llm prepends 'openai/' and passes api_key, api_base, temperature."""
    mock_lm_cls = MagicMock()
    sentinel = MagicMock(name="lm_instance")
    mock_lm_cls.return_value = sentinel

    with patch("server.services.discovery_dspy._import_dspy") as mock_import:
        fake_dspy = MagicMock()
        fake_dspy.LM = mock_lm_cls
        mock_import.return_value = fake_dspy

        result = build_custom_llm(
            base_url="https://example.com",
            model_name="my-model",
            api_key="test-key",
            temperature=0.2,
        )

    mock_lm_cls.assert_called_once_with(
        model="openai/my-model",
        api_key="test-key",
        api_base="https://example.com",
        temperature=0.2,
    )
    assert result is sentinel


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
def test_build_custom_llm_skips_prefix_if_already_openai():
    """build_custom_llm does not double-prefix when model_name starts with 'openai/'."""
    mock_lm_cls = MagicMock()

    with patch("server.services.discovery_dspy._import_dspy") as mock_import:
        fake_dspy = MagicMock()
        fake_dspy.LM = mock_lm_cls
        mock_import.return_value = fake_dspy

        build_custom_llm(
            base_url="https://example.com",
            model_name="openai/my-model",
            api_key="test-key",
        )

    # The model kwarg should remain "openai/my-model" (not "openai/openai/my-model")
    call_kwargs = mock_lm_cls.call_args[1]
    assert call_kwargs["model"] == "openai/my-model"


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
def test_build_custom_llm_custom_temperature():
    """Custom temperature=0.5 flows through to dspy.LM."""
    mock_lm_cls = MagicMock()

    with patch("server.services.discovery_dspy._import_dspy") as mock_import:
        fake_dspy = MagicMock()
        fake_dspy.LM = mock_lm_cls
        mock_import.return_value = fake_dspy

        build_custom_llm(
            base_url="https://example.com",
            model_name="some-model",
            api_key="key-123",
            temperature=0.5,
        )

    call_kwargs = mock_lm_cls.call_args[1]
    assert call_kwargs["temperature"] == 0.5


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.unit
def test_build_custom_llm_typeerror_fallback():
    """When dspy.LM raises TypeError, falls back to dspy.LM(model=model)."""
    call_args_list = []

    def mock_lm_constructor(**kwargs):
        call_args_list.append(kwargs)
        if len(call_args_list) == 1:
            # First call: raise TypeError to trigger fallback
            raise TypeError("unexpected keyword argument 'api_base'")
        # Second call (fallback): succeed
        return MagicMock(name="fallback_lm")

    with patch("server.services.discovery_dspy._import_dspy") as mock_import:
        fake_dspy = MagicMock()
        fake_dspy.LM = MagicMock(side_effect=mock_lm_constructor)
        mock_import.return_value = fake_dspy

        result = build_custom_llm(
            base_url="https://example.com",
            model_name="my-model",
            api_key="test-key",
        )

    # Two calls: the first with full kwargs, the second with just model=
    assert len(call_args_list) == 2
    assert call_args_list[0]["model"] == "openai/my-model"
    assert "api_key" in call_args_list[0]
    # Fallback call should only have model=
    assert call_args_list[1] == {"model": "openai/my-model"}
    assert result is not None
