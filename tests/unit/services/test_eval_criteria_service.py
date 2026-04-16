"""Unit tests for EvalCriteriaService extraction and mode guards."""

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import Base, TraceDB, WorkshopDB
from server.models import TraceCriterionCreate, TraceCriterionType, TraceCriterionUpdate
from server.services.eval_criteria_service import EvalCriteriaService


@pytest.fixture
def test_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def eval_workshop(test_db):
    workshop = WorkshopDB(id="ws-eval", name="Eval WS", facilitator_id="fac-1", mode="eval")
    trace = TraceDB(id="trace-1", workshop_id="ws-eval", input="in", output="out")
    test_db.add(workshop)
    test_db.add(trace)
    test_db.commit()
    return workshop


@pytest.fixture
def workshop_mode_workshop(test_db):
    workshop = WorkshopDB(id="ws-workshop", name="Classic WS", facilitator_id="fac-1", mode="workshop")
    trace = TraceDB(id="trace-2", workshop_id="ws-workshop", input="in", output="out")
    test_db.add(workshop)
    test_db.add(trace)
    test_db.commit()
    return workshop


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Facilitator can create criteria on a specific trace")
def test_create_and_list_criteria_in_eval_mode(test_db, eval_workshop):
    service = EvalCriteriaService(test_db)
    created = service.create_criterion(
        "ws-eval",
        "trace-1",
        TraceCriterionCreate(
            text="Mentions at least one concrete next step",
            criterion_type=TraceCriterionType.STANDARD,
            weight=4,
            created_by="fac-1",
        ),
    )
    assert created.trace_id == "trace-1"
    assert created.criterion_type == TraceCriterionType.STANDARD

    listed = service.list_criteria("ws-eval", "trace-1")
    assert len(listed) == 1
    assert listed[0].id == created.id


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Criteria are editable and deletable")
def test_update_and_delete_criteria(test_db, eval_workshop):
    service = EvalCriteriaService(test_db)
    created = service.create_criterion(
        "ws-eval",
        "trace-1",
        TraceCriterionCreate(
            text="Original criterion",
            criterion_type=TraceCriterionType.STANDARD,
            weight=1,
            created_by="fac-1",
        ),
    )

    updated = service.update_criterion(
        "ws-eval",
        created.id,
        TraceCriterionUpdate(text="Updated criterion", weight=2),
    )
    assert updated is not None
    assert updated.text == "Updated criterion"
    assert updated.weight == 2

    deleted = service.delete_criterion("ws-eval", created.id)
    assert deleted is True
    assert service.list_criteria("ws-eval", "trace-1") == []


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Eval-mode workshops do not use the global rubric system")
def test_rejects_non_eval_workshop(test_db, workshop_mode_workshop):
    service = EvalCriteriaService(test_db)
    with pytest.raises(HTTPException) as exc:
        service.list_criteria("ws-workshop", "trace-2")
    assert exc.value.status_code == 409
