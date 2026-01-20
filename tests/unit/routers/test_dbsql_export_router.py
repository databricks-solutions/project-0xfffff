import pytest


@pytest.mark.spec("DATASETS_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_dbsql_export_success(async_client, override_get_db, monkeypatch):
    import server.routers.dbsql_export as dbsql_router

    class FakeDBSQLExportService:
        def __init__(self, **kwargs):
            # Basic sanity that we wired the request fields
            assert kwargs["databricks_host"] == "https://example.cloud.databricks.com"
            assert kwargs["databricks_token"] == "tok"
            assert kwargs["http_path"] == "/sql/1.0/warehouses/abc"
            assert kwargs["catalog"] == "cat"
            assert kwargs["schema_name"] == "sch"

        def export_workshop_data(self, db_path: str):
            assert db_path  # derived from env
            return {"success": True, "tables_exported": [{"table": "users"}], "total_rows": 1, "errors": []}

    monkeypatch.setattr(dbsql_router, "DBSQLExportService", FakeDBSQLExportService)

    resp = await async_client.post(
        "/dbsql-export/w1/export",
        json={
            "databricks_host": "https://example.cloud.databricks.com",
            "databricks_token": "tok",
            "http_path": "/sql/1.0/warehouses/abc",
            "catalog": "cat",
            "schema_name": "sch",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["total_rows"] == 1


@pytest.mark.spec("DATASETS_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_dbsql_export_status_happy_path(async_client, override_get_db, monkeypatch):
    import server.routers.dbsql_export as dbsql_router

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_rubric(self, workshop_id: str):
            return object()

        def get_annotations(self, workshop_id: str, user_id=None):
            return [object(), object()]

        def get_traces(self, workshop_id: str):
            return [object()]

        def get_judge_prompts(self, workshop_id: str):
            return []

        def get_workshop_participants(self, workshop_id: str):
            return [object(), object(), object()]

    # The router imports DatabaseService inside the function body, so patch the module path it uses.
    monkeypatch.setattr("server.services.database_service.DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/dbsql-export/w1/export-status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["workshop_id"] == "w1"
    assert body["data_summary"]["annotations_count"] == 2
    assert body["data_summary"]["users_count"] == 3
