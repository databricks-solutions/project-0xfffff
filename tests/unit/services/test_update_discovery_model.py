"""Tests for updating the discovery questions model name.

These tests exercise the full path from DatabaseService through DiscoveryService
to verify model selection persists correctly. This catches integration bugs like
missing methods or broken cache invalidation.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, WorkshopDB
from server.services.database_service import DatabaseService


@pytest.fixture
def test_db():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def database_service(test_db):
    return DatabaseService(test_db)


@pytest.fixture
def workshop(test_db):
    ws = WorkshopDB(id="ws-1", name="Test Workshop", facilitator_id="facilitator-1")
    test_db.add(ws)
    test_db.commit()
    return ws


# ============================================================================
# DatabaseService.update_discovery_questions_model_name
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Facilitator can select LLM model for follow-up question generation in Discovery dashboard")
@pytest.mark.unit
class TestUpdateDiscoveryQuestionsModelName:
    """Tests for the database layer of model name persistence."""

    def test_update_persists_model_name(self, database_service, workshop):
        """Model name is persisted and returned."""
        result = database_service.update_discovery_questions_model_name(
            workshop.id, "databricks-claude-sonnet-4-5"
        )
        assert result is not None
        assert result.discovery_questions_model_name == "databricks-claude-sonnet-4-5"

    def test_update_returns_none_for_missing_workshop(self, database_service):
        """Returns None when workshop doesn't exist."""
        result = database_service.update_discovery_questions_model_name(
            "nonexistent-ws", "some-model"
        )
        assert result is None

    def test_update_overwrites_previous_model(self, database_service, workshop):
        """Updating model name overwrites the previous value."""
        database_service.update_discovery_questions_model_name(
            workshop.id, "databricks-gpt-5-2"
        )
        result = database_service.update_discovery_questions_model_name(
            workshop.id, "databricks-claude-opus-4-5"
        )
        assert result is not None
        assert result.discovery_questions_model_name == "databricks-claude-opus-4-5"

    def test_update_can_set_to_custom(self, database_service, workshop):
        """Model name can be set to 'custom' for custom LLM provider."""
        result = database_service.update_discovery_questions_model_name(
            workshop.id, "custom"
        )
        assert result is not None
        assert result.discovery_questions_model_name == "custom"

    def test_update_can_reset_to_demo(self, database_service, workshop):
        """Model name can be set back to 'demo'."""
        database_service.update_discovery_questions_model_name(
            workshop.id, "databricks-claude-sonnet-4-5"
        )
        result = database_service.update_discovery_questions_model_name(
            workshop.id, "demo"
        )
        assert result is not None
        assert result.discovery_questions_model_name == "demo"

    def test_default_model_is_demo(self, database_service, workshop):
        """New workshop defaults to 'demo' model."""
        ws = database_service.get_workshop(workshop.id)
        assert ws.discovery_questions_model_name == "demo"


# ============================================================================
# DiscoveryService.set_discovery_questions_model (router layer)
# ============================================================================


@pytest.mark.spec("DISCOVERY_SPEC")
@pytest.mark.req("Facilitator can select LLM model for follow-up question generation in Discovery dashboard")
@pytest.mark.unit
class TestSetDiscoveryQuestionsModel:
    """Tests for the service layer that the router calls."""

    def test_set_model_delegates_to_db_service(self, database_service, workshop):
        """DiscoveryService.set_discovery_questions_model calls through to DB."""
        from server.services.discovery_service import DiscoveryService

        svc = DiscoveryService(database_service.db)
        model_name = svc.set_discovery_questions_model(workshop.id, "databricks-claude-sonnet-4-5")
        assert model_name == "databricks-claude-sonnet-4-5"

    def test_set_model_raises_for_missing_workshop(self, database_service):
        """DiscoveryService raises 404 for nonexistent workshop."""
        from fastapi import HTTPException

        from server.services.discovery_service import DiscoveryService

        svc = DiscoveryService(database_service.db)
        with pytest.raises(HTTPException, match="404"):
            svc.set_discovery_questions_model("nonexistent-ws", "some-model")
