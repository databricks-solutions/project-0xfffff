"""User roster and profile API endpoints."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.database import get_db
from server.features.auth.schemas import AuthSession
from server.features.auth.service import get_current_session, require_project_manager
from server.models import (
    User,
    UserCreate,
    UserPermissions,
    UserRole,
    UserStatus,
    WorkshopParticipant,
)
from server.services.database_service import DatabaseService


def get_database_service(db: Session = Depends(get_db)) -> DatabaseService:
    """Get database service instance."""
    return DatabaseService(db)


router = APIRouter()


@router.post("/")
async def create_user(
    user_data: UserCreate,
    db_service=Depends(get_database_service),
    session: AuthSession = Depends(require_project_manager),
):
    """Create a pending provider-authenticated user."""
    # Check if user already exists
    existing_user = db_service.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    user = db_service.create_user_from_invite(user_data)

    if user_data.workshop_id:
        participant = WorkshopParticipant(user_id=user.id, workshop_id=user_data.workshop_id, role=user_data.role)
        db_service.add_workshop_participant(participant)

    return user


@router.post("/workshops/{workshop_id}/users/")
async def add_user_to_workshop(workshop_id: str, user_data: UserCreate, db_service=Depends(get_database_service)):
    """Add a user to a workshop."""
    # Check if workshop exists
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if user already exists globally
    existing_user = db_service.get_user_by_email(user_data.email)

    if existing_user:
        # User exists globally - check if they're already in this workshop
        existing_users = db_service.list_users(workshop_id=workshop_id)
        for user in existing_users:
            # Case-insensitive email comparison
            if user.email.lower() == user_data.email.lower():
                raise HTTPException(status_code=400, detail="User already exists in this workshop")

        # User exists globally but not in this workshop - add them to the workshop
        participant = WorkshopParticipant(user_id=existing_user.id, workshop_id=workshop_id, role=user_data.role)
        db_service.add_workshop_participant(participant)

        return {
            "user": existing_user,
            "message": f"User {existing_user.email} added to workshop successfully",
        }
    # User doesn't exist globally - create them
    user_data.workshop_id = workshop_id
    user = db_service.create_user_from_invite(user_data)

    # Add user as workshop participant
    participant = WorkshopParticipant(user_id=user.id, workshop_id=workshop_id, role=user_data.role)
    db_service.add_workshop_participant(participant)

    return {
        "user": user,
        "message": f"User {user.email} created and added to workshop successfully",
    }


@router.get("/workshops/{workshop_id}/users/")
async def list_workshop_users(workshop_id: str, db_service=Depends(get_database_service)):
    """List all users in a workshop."""
    # Check if workshop exists
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get all users in the workshop
    users = db_service.list_users(workshop_id=workshop_id)

    return {"workshop_id": workshop_id, "users": users, "total_users": len(users)}


@router.get("/me", response_model=User)
async def get_current_user_profile(session: AuthSession = Depends(get_current_session)) -> User:
    return session.user


@router.get("/", response_model=list[User])
async def list_users(
    workshop_id: str | None = None,
    role: UserRole | None = None,
    db_service=Depends(get_database_service),
    session: AuthSession = Depends(require_project_manager),
):
    """List materialized app users, optionally filtered by workshop or role."""
    return db_service.list_users(workshop_id=workshop_id, role=role)


@router.get("/{user_id}", response_model=User)
async def get_user(user_id: str, db_service=Depends(get_database_service)):
    """Get user by ID."""
    user = db_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/{user_id}/permissions", response_model=UserPermissions)
async def get_user_permissions(user_id: str, db_service=Depends(get_database_service)):
    """Get user permissions based on their role."""
    user = db_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return UserPermissions.for_role(user.role)


@router.put("/{user_id}/status")
async def update_user_status(user_id: str, status: UserStatus, db_service=Depends(get_database_service)):
    """Update user status."""
    user = db_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.status = status
    db_service.update_user(user)
    return {"message": "User status updated successfully"}


@router.put("/{user_id}/last-active")
async def update_last_active(user_id: str, db_service=Depends(get_database_service)):
    """Update user's last active timestamp."""
    user = db_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.last_active = datetime.now()
    db_service.update_user(user)
    return {"message": "Last active timestamp updated"}


@router.get("/workshops/{workshop_id}/participants", response_model=list[WorkshopParticipant])
async def get_workshop_participants(workshop_id: str, db_service=Depends(get_database_service)):
    """Get all participants in a workshop."""
    return db_service.get_workshop_participants(workshop_id)


@router.post("/workshops/{workshop_id}/participants/{user_id}/assign-traces")
async def assign_traces_to_user(
    workshop_id: str, user_id: str, trace_ids: list[str], db_service=Depends(get_database_service)
):
    """Assign specific traces to a user for annotation."""
    # Verify user exists and is part of workshop
    user = db_service.get_user(user_id)
    if not user or user.workshop_id != workshop_id:
        raise HTTPException(status_code=404, detail="User not found in workshop")

    # Get or create participant record
    participant = db_service.get_workshop_participant(workshop_id, user_id)
    if not participant:
        participant = WorkshopParticipant(user_id=user_id, workshop_id=workshop_id, role=user.role)

    # Assign traces
    participant.assigned_traces = trace_ids
    db_service.update_workshop_participant(participant)

    return {"message": f"Assigned {len(trace_ids)} traces to user", "trace_ids": trace_ids}


@router.get("/workshops/{workshop_id}/participants/{user_id}/assigned-traces")
async def get_assigned_traces(workshop_id: str, user_id: str, db_service=Depends(get_database_service)):
    """Get traces assigned to a specific user."""
    participant = db_service.get_workshop_participant(workshop_id, user_id)
    if not participant:
        raise HTTPException(status_code=404, detail="User not found in workshop")

    return {"assigned_traces": participant.assigned_traces}


@router.delete("/{user_id}")
async def delete_user(user_id: str, db_service=Depends(get_database_service)):
    """Delete a user (no authentication required)."""
    # Get the user to delete
    user_to_delete = db_service.get_user(user_id)
    if not user_to_delete:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent deleting facilitators
    if user_to_delete.role == UserRole.FACILITATOR:
        raise HTTPException(status_code=403, detail="Cannot delete facilitators")

    # Delete the user
    db_service.delete_user(user_id)

    return {"message": "User deleted successfully"}


@router.delete("/workshops/{workshop_id}/users/{user_id}")
async def remove_user_from_workshop(workshop_id: str, user_id: str, db_service=Depends(get_database_service)):
    """Remove a user from a workshop (but keep them in the system)."""
    # Check if workshop exists
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if user exists
    user = db_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Remove user from workshop
    db_service.remove_user_from_workshop(workshop_id, user_id)

    return {"message": f"User {user.email} removed from workshop successfully"}


@router.put("/workshops/{workshop_id}/users/{user_id}/role")
async def update_user_role_in_workshop(
    workshop_id: str, user_id: str, role_data: dict, db_service=Depends(get_database_service)
):
    """Update a user's role in a workshop (SME <-> Participant)."""
    # Check if workshop exists
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if user exists
    user = db_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot change facilitator role
    if user.role == UserRole.FACILITATOR:
        raise HTTPException(status_code=403, detail="Cannot change facilitator role")

    new_role = role_data.get("role")
    if new_role not in ["sme", "participant"]:
        raise HTTPException(status_code=400, detail='Role must be "sme" or "participant"')

    # Update the user's role
    updated_user = db_service.update_user_role_in_workshop(workshop_id, user_id, new_role)

    return {"user": updated_user, "message": f"User role updated to {new_role.upper()} successfully"}


@router.post("/workshops/{workshop_id}/auto-assign-annotations")
async def auto_assign_annotations(workshop_id: str, db_service=Depends(get_database_service)):
    """Automatically balance annotation assignments across SMEs and participants."""
    # Get all traces in workshop
    traces = db_service.get_traces_by_workshop(workshop_id)

    # Get SMEs and participants (exclude facilitator from annotations)
    participants = db_service.get_workshop_participants(workshop_id)
    annotators = [p for p in participants if p.role in [UserRole.SME, UserRole.PARTICIPANT]]

    if not annotators:
        raise HTTPException(status_code=400, detail="No annotators available")

    # Simple round-robin assignment
    assignments = {}
    for i, trace in enumerate(traces):
        annotator = annotators[i % len(annotators)]
        if annotator.user_id not in assignments:
            assignments[annotator.user_id] = []
        assignments[annotator.user_id].append(trace.id)

    # Update assignments
    for user_id, trace_ids in assignments.items():
        participant = db_service.get_workshop_participant(workshop_id, user_id)
        if participant:
            participant.assigned_traces = trace_ids
            db_service.update_workshop_participant(participant)

    return {
        "message": "Annotations auto-assigned successfully",
        "assignments": assignments,
        "total_traces": len(traces),
        "total_annotators": len(annotators),
    }
