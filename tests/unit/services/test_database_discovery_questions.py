"""Tests for DatabaseService discovery questions methods.

@spec ASSISTED_FACILITATION_SPEC

Per the spec, generated questions (Q2+) are stored per-user/per-trace to allow
personalized question generation. The database layer must support:

1. get_discovery_questions(workshop_id, trace_id, user_id) - retrieve questions
2. add_discovery_question(workshop_id, trace_id, user_id, prompt, placeholder, category) - create questions
"""

import pytest

pytestmark = pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, DiscoveryQuestionDB, WorkshopDB, TraceDB
from server.services.database_service import DatabaseService


@pytest.fixture
@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
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
    """Create a DatabaseService instance with test database."""
    return DatabaseService(test_db)


@pytest.fixture
def workshop(test_db):
    """Create a test workshop."""
    workshop = WorkshopDB(id="workshop-1", name="Test Workshop", facilitator_id="facilitator-1")
    test_db.add(workshop)
    test_db.commit()
    return workshop


@pytest.fixture
def trace(test_db, workshop):
    """Create a test trace."""
    trace = TraceDB(
        id="trace-1",
        workshop_id=workshop.id,
        input="Test input",
        output="Test output",
    )
    test_db.add(trace)
    test_db.commit()
    return trace


@pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
@pytest.mark.req("Facilitators can generate targeted questions that broadcast to all participants")
class TestDiscoveryQuestionsDatabase:
    """Tests for discovery questions database operations.

    These tests verify the database layer for per-user question storage, which
    supports the question generation workflow described in the spec.
    """

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_discovery_questions_empty(self, database_service, workshop, trace):
        """Test getting questions when none exist returns empty list."""
        result = database_service.get_discovery_questions(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
        )
        assert result == []

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_add_discovery_question_creates_question(self, database_service, workshop, trace):
        """Test adding a discovery question creates it with correct fields."""
        result = database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="What edge cases should be considered?",
            placeholder="Enter your observations about edge cases...",
            category="edge_cases",
        )

        assert result["id"] == "q_2"  # First generated question is q_2 (q_1 is baseline)
        assert result["prompt"] == "What edge cases should be considered?"
        assert result["placeholder"] == "Enter your observations about edge cases..."
        assert result["category"] == "edge_cases"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_add_discovery_question_increments_question_id(self, database_service, workshop, trace):
        """Test that question_id increments correctly for each new question."""
        # Add first question
        q1 = database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="First question",
            category="themes",
        )
        assert q1["id"] == "q_2"

        # Add second question
        q2 = database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="Second question",
            category="edge_cases",
        )
        assert q2["id"] == "q_3"

        # Add third question
        q3 = database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="Third question",
            category="failure_modes",
        )
        assert q3["id"] == "q_4"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_discovery_questions_returns_all_for_user(self, database_service, workshop, trace):
        """Test getting questions returns all questions for a specific user."""
        # Add multiple questions for user-1
        database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="Question 1",
            category="themes",
        )
        database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="Question 2",
            category="edge_cases",
        )

        result = database_service.get_discovery_questions(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
        )

        assert len(result) == 2
        assert result[0]["id"] == "q_2"
        assert result[0]["prompt"] == "Question 1"
        assert result[1]["id"] == "q_3"
        assert result[1]["prompt"] == "Question 2"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_discovery_questions_isolates_by_user(self, database_service, workshop, trace):
        """Test that questions are isolated per-user."""
        # Add questions for user-1
        database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="User 1 question",
            category="themes",
        )

        # Add questions for user-2
        database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-2",
            prompt="User 2 question",
            category="edge_cases",
        )

        # Get questions for user-1
        user1_questions = database_service.get_discovery_questions(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
        )
        assert len(user1_questions) == 1
        assert user1_questions[0]["prompt"] == "User 1 question"

        # Get questions for user-2
        user2_questions = database_service.get_discovery_questions(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-2",
        )
        assert len(user2_questions) == 1
        assert user2_questions[0]["prompt"] == "User 2 question"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_get_discovery_questions_isolates_by_trace(self, database_service, workshop, test_db):
        """Test that questions are isolated per-trace."""
        # Create second trace
        trace1 = TraceDB(id="trace-1", workshop_id=workshop.id, input="Input 1", output="Output 1")
        trace2 = TraceDB(id="trace-2", workshop_id=workshop.id, input="Input 2", output="Output 2")
        test_db.add(trace1)
        test_db.add(trace2)
        test_db.commit()

        # Add question for trace-1
        database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id="trace-1",
            user_id="user-1",
            prompt="Trace 1 question",
            category="themes",
        )

        # Add question for trace-2
        database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id="trace-2",
            user_id="user-1",
            prompt="Trace 2 question",
            category="edge_cases",
        )

        # Get questions for trace-1
        trace1_questions = database_service.get_discovery_questions(
            workshop_id=workshop.id,
            trace_id="trace-1",
            user_id="user-1",
        )
        assert len(trace1_questions) == 1
        assert trace1_questions[0]["prompt"] == "Trace 1 question"

        # Get questions for trace-2
        trace2_questions = database_service.get_discovery_questions(
            workshop_id=workshop.id,
            trace_id="trace-2",
            user_id="user-1",
        )
        assert len(trace2_questions) == 1
        assert trace2_questions[0]["prompt"] == "Trace 2 question"

    @pytest.mark.spec("ASSISTED_FACILITATION_SPEC")
    def test_add_discovery_question_with_optional_fields(self, database_service, workshop, trace):
        """Test adding a question with optional placeholder and category as None."""
        result = database_service.add_discovery_question(
            workshop_id=workshop.id,
            trace_id=trace.id,
            user_id="user-1",
            prompt="Question without optional fields",
            placeholder=None,
            category=None,
        )

        assert result["id"] == "q_2"
        assert result["prompt"] == "Question without optional fields"
        assert result["placeholder"] is None
        assert result["category"] is None
