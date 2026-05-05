from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class SetupQueue:
    """Queue adapter for setup orchestration.

    The Procrastinate import is intentionally lazy so tests and SQLite-only
    local development can exercise service behavior before the worker package
    is installed or configured.
    """

    def enqueue_setup_pipeline(self, *, project_id: str, setup_job_id: str) -> str:
        try:
            from server.features.project_setup.tasks import run_setup_pipeline
        except Exception as exc:  # pragma: no cover - exercised only when dependency/config missing
            logger.warning("Procrastinate setup queue unavailable; using dev queue id: %s", exc)
            return f"dev-unqueued:{setup_job_id}"

        job = run_setup_pipeline.defer(project_id=project_id, setup_job_id=setup_job_id)
        return str(getattr(job, "id", job))
