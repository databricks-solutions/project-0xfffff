"""DBSQL Export API Router.

Provides endpoints for exporting SQLite data to Databricks DBSQL tables.
"""

import logging
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import DBSQLExportRequest, DBSQLExportResponse
from server.services.dbsql_export_service import DBSQLExportService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dbsql-export", tags=["dbsql-export"])


@router.post("/{workshop_id}/export", response_model=DBSQLExportResponse)
async def export_workshop_to_dbsql(
    workshop_id: str,
    request: DBSQLExportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Export all workshop data from SQLite to Databricks DBSQL tables.

    This endpoint exports:
    - All tables from the SQLite database
    - Creates tables in DBSQL if they don't exist
    - Inserts or overwrites data in DBSQL tables
    """
    try:
        # Get the SQLite database path
        db_path = os.getenv("DATABASE_URL", "workshop.db")
        if db_path.startswith("sqlite:///"):
            db_path = db_path.replace("sqlite:///", "")
        elif db_path.startswith("sqlite://"):
            db_path = db_path.replace("sqlite://", "")

        # Initialize DBSQL export service
        dbsql_service = DBSQLExportService(
            databricks_host=request.databricks_host,
            databricks_token=request.databricks_token,
            http_path=request.http_path,
            catalog=request.catalog,
            schema_name=request.schema_name,
        )

        logger.info(f"Starting DBSQL export for workshop {workshop_id}")
        logger.info(f"Database path: {db_path}")
        logger.info(f"Target: {request.catalog}.{request.schema_name}")

        # Export workshop data to DBSQL
        export_result = dbsql_service.export_workshop_data(db_path)

        if not export_result.get("success", False):
            raise HTTPException(status_code=500, detail=f"Export failed: {export_result.get('error', 'Unknown error')}")

        return DBSQLExportResponse(
            success=True,
            message=f"Successfully exported workshop {workshop_id} to DBSQL",
            tables_exported=export_result.get("tables_exported", []),
            total_rows=export_result.get("total_rows", 0),
            errors=export_result.get("errors", []),
        )

    except Exception as e:
        logger.error(f"Failed to export workshop {workshop_id} to DBSQL: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to export workshop to DBSQL: {e!s}") from e


@router.get("/{workshop_id}/export-status")
async def get_dbsql_export_status(workshop_id: str, db: Session = Depends(get_db)):
    """Get the export status and summary for a workshop."""
    try:
        from server.services.database_service import DatabaseService

        db_service = DatabaseService(db)

        # Get workshop data counts
        rubric = db_service.get_rubric(workshop_id)
        annotations = db_service.get_annotations(workshop_id)
        traces = db_service.get_traces(workshop_id)
        judge_prompts = db_service.get_judge_prompts(workshop_id)
        users = db_service.get_workshop_participants(workshop_id)

        return {
            "workshop_id": workshop_id,
            "export_ready": True,
            "data_summary": {
                "rubrics_count": 1 if rubric else 0,
                "annotations_count": len(annotations),
                "traces_count": len(traces),
                "judge_prompts_count": len(judge_prompts),
                "users_count": len(users),
            },
            "export_requirements": {
                "has_rubrics": rubric is not None,
                "has_annotations": len(annotations) > 0,
                "has_traces": len(traces) > 0,
                "has_judge_prompts": len(judge_prompts) > 0,
                "has_users": len(users) > 0,
            },
        }

    except Exception as e:
        logger.error(f"Failed to get DBSQL export status for workshop {workshop_id}: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to get export status: {e!s}") from e
