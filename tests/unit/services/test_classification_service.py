"""Tests for classification service."""

import pytest
from server.services.classification_service import ClassificationService, FINDING_CATEGORIES
from server.services.discovery_service import DiscoveryService

pytestmark = pytest.mark.spec("ASSISTED_FACILITATION_SPEC")


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestClassificationService:
    """Tests for ClassificationService."""

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_classify_finding_locally_themes(self):
        """Test local classification for themes."""
        text = "This response demonstrates good customer service quality."
        category = DiscoveryService._classify_finding_locally(text)
        assert category in FINDING_CATEGORIES

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_classify_finding_locally_missing_info(self):
        """Test local classification for missing_info."""
        text = "The response is missing important context and lacks detail."
        category = DiscoveryService._classify_finding_locally(text)
        assert category == "missing_info"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_classify_finding_locally_failure_modes(self):
        """Test local classification for failure_modes."""
        text = "The response fails to address the user's primary concern."
        category = DiscoveryService._classify_finding_locally(text)
        assert category == "failure_modes"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_classify_finding_locally_boundary_conditions(self):
        """Test local classification for boundary_conditions."""
        text = "This is at the boundary condition where the response changes behavior."
        category = DiscoveryService._classify_finding_locally(text)
        assert category == "boundary_conditions"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_classify_finding_locally_edge_cases(self):
        """Test local classification for edge_cases."""
        text = "This is a particularly unusual and special case that needs consideration."
        category = DiscoveryService._classify_finding_locally(text)
        assert category == "edge_cases"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_classify_finding_returns_valid_category(self):
        """Test that classification always returns valid category."""
        test_texts = [
            "Random text about nothing specific",
            "Another unrelated comment",
            "Generic observation",
        ]
        for text in test_texts:
            category = DiscoveryService._classify_finding_locally(text)
            assert category in FINDING_CATEGORIES, f"Invalid category {category} for text: {text}"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_all_categories_are_valid(self):
        """Test that all categories are defined."""
        expected_categories = {
            "themes",
            "edge_cases",
            "boundary_conditions",
            "failure_modes",
            "missing_info",
        }
        assert set(FINDING_CATEGORIES) == expected_categories
