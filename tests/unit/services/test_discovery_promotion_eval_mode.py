"""Tests for discovery promotion bridge behavior in eval vs workshop modes."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, ClassifiedFindingDB, DraftRubricItemDB, TraceCriterionDB, TraceDB, WorkshopDB
from server.services.discovery_service import DiscoveryService


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_workshop_with_finding(test_db, workshop_id: str, mode: str):
    workshop = WorkshopDB(id=workshop_id, name=f"Workshop {mode}", facilitator_id="fac-1", mode=mode)
    trace = TraceDB(id=f"{workshop_id}-trace", workshop_id=workshop_id, input="in", output="out")
    finding = ClassifiedFindingDB(
        id=f"{workshop_id}-finding",
        workshop_id=workshop_id,
        trace_id=trace.id,
        user_id="user-1",
        text="Identifies a concrete next step",
        category="themes",
        question_id="q_1",
    )
    test_db.add_all([workshop, trace, finding])
    test_db.commit()
    return finding.id, trace.id


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Criteria can be promoted from discovery findings")
@pytest.mark.req("Eval-mode workshops do not use the global rubric system")
def test_promote_finding_to_trace_criteria_in_eval_mode(test_db):
    finding_id, trace_id = _seed_workshop_with_finding(test_db, "ws-eval", "eval")
    service = DiscoveryService(test_db)

    result = service.promote_finding("ws-eval", finding_id, "fac-1")
    assert result["target"] == "trace_criteria"

    criteria_rows = test_db.query(TraceCriterionDB).filter(TraceCriterionDB.workshop_id == "ws-eval").all()
    assert len(criteria_rows) == 1
    assert criteria_rows[0].trace_id == trace_id
    assert criteria_rows[0].source_finding_id == finding_id
    assert criteria_rows[0].text == "Identifies a concrete next step"

    draft_rows = test_db.query(DraftRubricItemDB).filter(DraftRubricItemDB.workshop_id == "ws-eval").all()
    assert draft_rows == []


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Existing workshop-mode behavior is unchanged")
def test_promote_finding_to_draft_rubric_in_workshop_mode(test_db):
    finding_id, _trace_id = _seed_workshop_with_finding(test_db, "ws-workshop", "workshop")
    service = DiscoveryService(test_db)

    result = service.promote_finding("ws-workshop", finding_id, "fac-1")
    assert result["target"] == "draft_rubric_items"

    draft_rows = test_db.query(DraftRubricItemDB).filter(DraftRubricItemDB.workshop_id == "ws-workshop").all()
    assert len(draft_rows) == 1
    assert draft_rows[0].text == "Identifies a concrete next step"

    criteria_rows = test_db.query(TraceCriterionDB).filter(TraceCriterionDB.workshop_id == "ws-workshop").all()
    assert criteria_rows == []
