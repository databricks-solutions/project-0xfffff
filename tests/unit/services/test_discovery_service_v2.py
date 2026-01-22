"""Tests for Assisted Facilitation v2 discovery service methods."""

import pytest
from fastapi import HTTPException
from server.services.discovery_service import DiscoveryService

pytestmark = pytest.mark.spec("ASSISTED_FACILITATION_SPEC")


class MockDatabaseService:
    """Mock database service for testing."""

    def __init__(self):
        self.workshops = {}
        self.traces = {}

    def get_workshop(self, workshop_id):
        return self.workshops.get(workshop_id)

    def get_trace(self, trace_id):
        return self.traces.get(trace_id)

    def get_traces(self, workshop_id):
        return list(self.traces.values())

    def get_findings(self, workshop_id, user_id=None):
        return []


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
class TestDiscoveryServiceV2:
    """Tests for DiscoveryService v2 methods."""

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_fuzzy_progress_empty(self, mock_db_session):
        """Test fuzzy progress with no traces."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        # Create a mock workshop
        workshop = type('Workshop', (), {'id': 'test_workshop'})()
        service.db_service.workshops['test_workshop'] = workshop

        result = service.get_fuzzy_progress('test_workshop')
        assert result['status'] == 'exploring'
        assert result['percentage'] == 0.0

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_fuzzy_progress_exploring(self, mock_db_session):
        """Test fuzzy progress in exploring state."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        # Create mock workshop
        workshop = type('Workshop', (), {'id': 'test_workshop'})()
        service.db_service.workshops['test_workshop'] = workshop

        # Create mock traces (less than 30% with findings)
        for i in range(10):
            trace = type('Trace', (), {'id': f'trace_{i}', 'workshop_id': 'test_workshop'})()
            service.db_service.traces[f'trace_{i}'] = trace

        result = service.get_fuzzy_progress('test_workshop')
        assert result['status'] == 'exploring'
        assert 0 <= result['percentage'] < 30

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_trace_discovery_state_structure(self, mock_db_session):
        """Test that get_trace_discovery_state returns correct structure."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        # Create mock workshop and trace
        workshop = type('Workshop', (), {'id': 'test_workshop'})()
        trace = type('Trace', (), {'id': 'test_trace', 'workshop_id': 'test_workshop'})()

        service.db_service.workshops['test_workshop'] = workshop
        service.db_service.traces['test_trace'] = trace

        result = service.get_trace_discovery_state('test_workshop', 'test_trace')

        # Verify structure
        assert 'trace_id' in result
        assert 'categories' in result
        assert 'disagreements' in result
        assert 'questions' in result
        assert 'thresholds' in result

        # Verify category keys
        expected_categories = {
            'themes',
            'edge_cases',
            'boundary_conditions',
            'failure_modes',
            'missing_info',
        }
        assert set(result['categories'].keys()) == expected_categories

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_promote_finding_structure(self, mock_db_session):
        """Test that promote_finding returns correct structure."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type('Workshop', (), {'id': 'test_workshop'})()
        service.db_service.workshops['test_workshop'] = workshop

        result = service.promote_finding('test_workshop', 'finding_123', 'facilitator_1')

        assert 'id' in result
        assert 'finding_id' in result
        assert 'promoted_by' in result
        assert result['promoted_by'] == 'facilitator_1'

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_update_trace_thresholds_structure(self, mock_db_session):
        """Test that update_trace_thresholds returns correct structure."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type('Workshop', (), {'id': 'test_workshop'})()
        trace = type('Trace', (), {'id': 'test_trace', 'workshop_id': 'test_workshop'})()

        service.db_service.workshops['test_workshop'] = workshop
        service.db_service.traces['test_trace'] = trace

        thresholds = {'themes': 5, 'edge_cases': 3, 'failure_modes': 4}
        result = service.update_trace_thresholds('test_workshop', 'test_trace', thresholds)

        assert result['trace_id'] == 'test_trace'
        assert result['thresholds'] == thresholds
        assert result['updated'] is True

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_submit_finding_v2_classification(self, mock_db_session):
        """Test that submit_finding_v2 classifies findings."""
        service = DiscoveryService(mock_db_session)
        service.db_service = MockDatabaseService()

        workshop = type('Workshop', (), {'id': 'test_workshop'})()
        trace = type('Trace', (), {'id': 'test_trace', 'workshop_id': 'test_workshop'})()

        service.db_service.workshops['test_workshop'] = workshop
        service.db_service.traces['test_trace'] = trace

        result = service.submit_finding_v2(
            'test_workshop',
            'test_trace',
            'user_1',
            'The response is missing important details',
        )

        assert 'category' in result
        assert result['category'] in {'themes', 'edge_cases', 'boundary_conditions', 'failure_modes', 'missing_info'}
