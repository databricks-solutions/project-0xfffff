"""
Test concurrent annotation submissions to verify SQLite race condition fix.

This test simulates multiple users submitting annotations at the same time
to verify that the retry logic with jitter handles SQLite lock contention.
"""

import pytest
import threading
import time
import uuid
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from unittest.mock import patch, MagicMock

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Import models
from server.database import Base, WorkshopDB, UserDB, TraceDB, AnnotationDB, RubricDB
from server.services.database_service import DatabaseService
from server.models import AnnotationCreate


def create_test_engine(db_path: str):
    """Create a test SQLite engine with the same settings as production."""
    DATABASE_URL = f"sqlite:///{db_path}"

    engine = create_engine(
        DATABASE_URL,
        connect_args={
            'check_same_thread': False,
            'timeout': 60,
            'isolation_level': 'DEFERRED',
        },
        pool_size=20,
        max_overflow=30,
        pool_timeout=30,
        pool_recycle=3600,
        pool_pre_ping=True,
    )

    # Enable WAL mode and busy_timeout on every connection
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=60000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


@pytest.fixture
def isolated_test_db():
    """Create an isolated test database with test data."""
    # Create a temporary database file
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    engine = create_test_engine(db_path)
    TestSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
        expire_on_commit=False,
    )

    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Set up test data
    db = TestSessionLocal()
    try:
        workshop_id = str(uuid.uuid4())
        workshop = WorkshopDB(
            id=workshop_id,
            name="Concurrent Test Workshop",
            description="Testing concurrent annotations",
            current_phase="annotation",
            facilitator_id="test-facilitator",
        )
        db.add(workshop)

        rubric = RubricDB(
            id=str(uuid.uuid4()),
            workshop_id=workshop_id,
            question='[{"id": "q_1", "title": "Test", "description": "Test question", "judge_type": "likert"}]',
            judge_type="likert",
            rating_scale=5,
            created_by="test-facilitator",
        )
        db.add(rubric)

        user_ids = []
        for i in range(10):
            user_id = str(uuid.uuid4())
            user = UserDB(
                id=user_id,
                email=f"concurrent_test_user_{i}_{uuid.uuid4().hex[:8]}@test.com",
                name=f"Concurrent Test User {i}",
                role="sme",
                workshop_id=workshop_id,
            )
            db.add(user)
            user_ids.append(user_id)

        trace_ids = []
        for i in range(10):
            trace_id = str(uuid.uuid4())
            trace = TraceDB(
                id=trace_id,
                workshop_id=workshop_id,
                mlflow_trace_id=f"mlflow-concurrent-{uuid.uuid4().hex[:8]}",
                input=f"Test input {i}",
                output=f"Test output {i}",
            )
            db.add(trace)
            trace_ids.append(trace_id)

        db.commit()

        yield {
            "workshop_id": workshop_id,
            "user_ids": user_ids,
            "trace_ids": trace_ids,
            "session_factory": TestSessionLocal,
            "engine": engine,
        }

    finally:
        db.close()
        engine.dispose()
        # Clean up temp file
        try:
            os.unlink(db_path)
            # Also remove WAL and SHM files if they exist
            for ext in ["-wal", "-shm"]:
                try:
                    os.unlink(db_path + ext)
                except FileNotFoundError:
                    pass
        except Exception:
            pass


def submit_annotation_isolated(
    session_factory, workshop_id: str, user_id: str, trace_id: str, rating: int
) -> dict:
    """Submit a single annotation in its own database session."""
    db = session_factory()
    try:
        service = DatabaseService(db)
        annotation_data = AnnotationCreate(
            trace_id=trace_id,
            user_id=user_id,
            rating=rating,
            ratings={"q_1": rating},
            comment=f"Comment from {user_id}",
        )

        # Mock the MLflow sync to avoid external dependencies
        with patch.object(service, '_sync_annotation_with_mlflow'):
            result = service.add_annotation(workshop_id, annotation_data)

        return {
            "success": True,
            "annotation_id": result.id,
            "user_id": user_id,
            "trace_id": trace_id,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "user_id": user_id,
            "trace_id": trace_id,
        }
    finally:
        db.close()


@pytest.mark.spec("SQLITE_CONCURRENCY")
def test_concurrent_annotations_same_trace(isolated_test_db):
    """
    Test that multiple users can annotate the SAME trace concurrently.

    This is the most challenging scenario for SQLite because all writes
    compete for the same rows/tables simultaneously.
    """
    test_data = isolated_test_db
    workshop_id = test_data["workshop_id"]
    user_ids = test_data["user_ids"]
    trace_id = test_data["trace_ids"][0]
    session_factory = test_data["session_factory"]

    results = []

    # Submit annotations from all 10 users concurrently to the same trace
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(
                submit_annotation_isolated,
                session_factory,
                workshop_id,
                user_id,
                trace_id,
                (i % 5) + 1
            ): user_id
            for i, user_id in enumerate(user_ids)
        }

        for future in as_completed(futures):
            result = future.result()
            results.append(result)

    successful = [r for r in results if r["success"]]
    errors = [r for r in results if not r["success"]]

    print(f"\n=== Concurrent Annotation Test (Same Trace) ===")
    print(f"Total submissions: {len(results)}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(errors)}")

    if errors:
        print(f"\nErrors:")
        for err in errors:
            print(f"  - User {err['user_id'][:8]}...: {err['error'][:100]}")

    # Verify in database
    db = session_factory()
    try:
        saved_annotations = db.query(AnnotationDB).filter(
            AnnotationDB.workshop_id == workshop_id,
            AnnotationDB.trace_id == trace_id
        ).all()

        print(f"\nAnnotations in DB: {len(saved_annotations)}")

        # All 10 users should have their annotations saved
        assert len(successful) == 10, f"Expected 10 successful submissions, got {len(successful)}. Errors: {errors}"
        assert len(saved_annotations) == 10, f"Expected 10 annotations in DB, got {len(saved_annotations)}"

    finally:
        db.close()


@pytest.mark.spec("SQLITE_CONCURRENCY")
def test_concurrent_annotations_different_traces(isolated_test_db):
    """
    Test that multiple users can annotate DIFFERENT traces concurrently.
    """
    test_data = isolated_test_db
    workshop_id = test_data["workshop_id"]
    user_ids = test_data["user_ids"]
    trace_ids = test_data["trace_ids"]
    session_factory = test_data["session_factory"]

    results = []

    # Each user annotates a different trace
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(
                submit_annotation_isolated,
                session_factory,
                workshop_id,
                user_ids[i],
                trace_ids[i],
                (i % 5) + 1
            ): user_ids[i]
            for i in range(10)
        }

        for future in as_completed(futures):
            result = future.result()
            results.append(result)

    successful = [r for r in results if r["success"]]
    errors = [r for r in results if not r["success"]]

    print(f"\n=== Concurrent Annotation Test (Different Traces) ===")
    print(f"Total submissions: {len(results)}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(errors)}")

    if errors:
        print(f"\nErrors:")
        for err in errors:
            print(f"  - User {err['user_id'][:8]}...: {err['error'][:100]}")

    # Verify in database
    db = session_factory()
    try:
        saved_annotations = db.query(AnnotationDB).filter(
            AnnotationDB.workshop_id == workshop_id
        ).all()

        print(f"\nAnnotations in DB: {len(saved_annotations)}")

        assert len(successful) == 10, f"Expected 10 successful submissions, got {len(successful)}. Errors: {errors}"
        assert len(saved_annotations) == 10, f"Expected 10 annotations in DB, got {len(saved_annotations)}"

    finally:
        db.close()


@pytest.mark.spec("SQLITE_CONCURRENCY")
def test_rapid_fire_annotations_single_user(isolated_test_db):
    """
    Test that a single user can rapidly submit annotations without losing data.
    """
    test_data = isolated_test_db
    workshop_id = test_data["workshop_id"]
    user_id = test_data["user_ids"][0]
    trace_ids = test_data["trace_ids"]
    session_factory = test_data["session_factory"]

    results = []

    # Single user submits 10 annotations as fast as possible
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(
                submit_annotation_isolated,
                session_factory,
                workshop_id,
                user_id,
                trace_id,
                (i % 5) + 1
            ): trace_id
            for i, trace_id in enumerate(trace_ids)
        }

        for future in as_completed(futures):
            result = future.result()
            results.append(result)

    successful = [r for r in results if r["success"]]
    errors = [r for r in results if not r["success"]]

    print(f"\n=== Rapid Fire Single User Test ===")
    print(f"Total submissions: {len(results)}")
    print(f"Successful: {len(successful)}")
    print(f"Failed: {len(errors)}")

    if errors:
        print(f"\nErrors:")
        for err in errors:
            print(f"  - Trace {err['trace_id'][:8]}...: {err['error'][:100]}")

    # Verify in database
    db = session_factory()
    try:
        saved_annotations = db.query(AnnotationDB).filter(
            AnnotationDB.workshop_id == workshop_id,
            AnnotationDB.user_id == user_id
        ).all()

        print(f"\nAnnotations in DB: {len(saved_annotations)}")

        assert len(successful) == 10, f"Expected 10 successful submissions, got {len(successful)}. Errors: {errors}"
        assert len(saved_annotations) == 10, f"Expected 10 annotations in DB, got {len(saved_annotations)}"

    finally:
        db.close()


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
