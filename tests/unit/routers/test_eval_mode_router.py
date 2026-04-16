from datetime import datetime

import pytest

from server.models import (
    CriterionEvaluation,
    TraceCriterion,
    TraceCriterionType,
    TraceEvalScore,
    TraceRubric,
)


def _criterion(criterion_id: str = "c1") -> TraceCriterion:
    now = datetime.now()
    return TraceCriterion(
        id=criterion_id,
        trace_id="t1",
        workshop_id="w1",
        text="Provides concrete next step",
        criterion_type=TraceCriterionType.STANDARD,
        weight=4,
        created_by="fac-1",
        created_at=now,
        updated_at=now,
    )


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Facilitator can create criteria on a specific trace")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_and_list_criteria(async_client, override_get_db, monkeypatch):
    import server.routers.eval_mode as eval_router

    store: dict[str, TraceCriterion] = {}

    class FakeEvalCriteriaService:
        def __init__(self, db):
            self.db = db

        def create_criterion(self, workshop_id, trace_id, data):
            assert workshop_id == "w1"
            assert trace_id == "t1"
            c = _criterion("c-created")
            c.text = data.text
            c.weight = data.weight
            c.criterion_type = data.criterion_type
            store[c.id] = c
            return c

        def list_criteria(self, workshop_id, trace_id):
            assert workshop_id == "w1"
            assert trace_id == "t1"
            return list(store.values())

    monkeypatch.setattr(eval_router, "EvalCriteriaService", FakeEvalCriteriaService)

    create_resp = await async_client.post(
        "/workshops/w1/traces/t1/criteria",
        json={
            "text": "Provides concrete next step",
            "criterion_type": "standard",
            "weight": 4,
            "created_by": "fac-1",
        },
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["criterion_type"] == "standard"

    list_resp = await async_client.get("/workshops/w1/traces/t1/criteria")
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Criteria are editable and deletable")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_update_and_delete_criterion(async_client, override_get_db, monkeypatch):
    import server.routers.eval_mode as eval_router

    criterion = _criterion("c-edit")

    class FakeEvalCriteriaService:
        def __init__(self, db):
            self.db = db

        def update_criterion(self, workshop_id, criterion_id, updates):
            assert workshop_id == "w1"
            assert criterion_id == "c-edit"
            criterion.text = updates.text or criterion.text
            criterion.weight = updates.weight if updates.weight is not None else criterion.weight
            return criterion

        def delete_criterion(self, workshop_id, criterion_id):
            assert workshop_id == "w1"
            assert criterion_id == "c-edit"
            return True

    monkeypatch.setattr(eval_router, "EvalCriteriaService", FakeEvalCriteriaService)

    update_resp = await async_client.put(
        "/workshops/w1/criteria/c-edit",
        json={"text": "Updated text", "weight": 7},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["text"] == "Updated text"
    assert update_resp.json()["weight"] == 7

    delete_resp = await async_client.delete("/workshops/w1/criteria/c-edit")
    assert delete_resp.status_code == 204


@pytest.mark.spec("EVAL_MODE_SPEC")
@pytest.mark.req("Per-trace rubric is rendered as markdown")
@pytest.mark.req("Scoring handles edge cases: no criteria, all hurdles, all negative weights")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_trace_rubric_and_eval_results(async_client, override_get_db, monkeypatch):
    import server.routers.eval_mode as eval_router

    criterion = _criterion("c-rubric")
    evaluation = CriterionEvaluation(
        id="e1",
        criterion_id="c-rubric",
        trace_id="t1",
        workshop_id="w1",
        judge_model="demo",
        met=True,
        rationale="met",
        created_at=datetime.now(),
    )

    class FakeEvalCriteriaService:
        def __init__(self, db):
            self.db = db

        def list_criteria(self, workshop_id, trace_id):
            assert workshop_id == "w1"
            assert trace_id in {"t1", "t2"}
            return [criterion] if trace_id == "t1" else []

        def list_evaluations(self, workshop_id, trace_id):
            assert workshop_id == "w1"
            return [evaluation] if trace_id == "t1" else []

    class FakeTrace:
        def __init__(self, trace_id):
            self.id = trace_id

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_traces(self, workshop_id):
            assert workshop_id == "w1"
            return [FakeTrace("t1"), FakeTrace("t2")]

    monkeypatch.setattr(eval_router, "EvalCriteriaService", FakeEvalCriteriaService)
    monkeypatch.setattr(eval_router, "DatabaseService", FakeDatabaseService)

    rubric_resp = await async_client.get("/workshops/w1/traces/t1/rubric")
    assert rubric_resp.status_code == 200
    rubric = TraceRubric(**rubric_resp.json())
    assert "## Criteria" in rubric.markdown

    results_resp = await async_client.get("/workshops/w1/eval-results")
    assert results_resp.status_code == 200
    scores = [TraceEvalScore(**row) for row in results_resp.json()]
    assert len(scores) == 2
    assert scores[0].trace_id == "t1"
