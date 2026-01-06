"""User management API endpoints."""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import (
  AuthResponse,
  FacilitatorConfigCreate,
  User,
  UserCreate,
  UserInvite,
  UserLogin,
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


@router.post('/auth/login', response_model=AuthResponse)
async def login(login_data: UserLogin, db_service=Depends(get_database_service)):
  """Authenticate a user with email and password."""
  # First, try to authenticate as a facilitator from YAML config
  facilitator_data = db_service.authenticate_facilitator_from_yaml(login_data.email, login_data.password)

  if facilitator_data:
    # Facilitator authenticated from YAML - get or create user
    user = db_service.get_or_create_facilitator_user(facilitator_data)

    return AuthResponse(user=user, is_preconfigured_facilitator=True, message='Facilitator login successful')

  # If not a facilitator, try regular user authentication
  user = db_service.authenticate_user(login_data.email, login_data.password)
  if not user:
    raise HTTPException(status_code=401, detail='Invalid email or password')

  # Activate user if they were pending
  db_service.activate_user_on_login(user.id)

  # Get updated user data with new status
  updated_user = db_service.get_user(user.id)

  return AuthResponse(user=updated_user, is_preconfigured_facilitator=False, message='Login successful')


@router.post('/')
async def create_user(user_data: UserCreate, db_service=Depends(get_database_service)):
  """Create a new user (no authentication required)."""
  # Check if user already exists
  existing_user = db_service.get_user_by_email(user_data.email)
  if existing_user:
    raise HTTPException(status_code=400, detail='User with this email already exists')

  # Create user with password
  user = db_service.create_user_with_password(user_data)

  # Add user as workshop participant
  participant = WorkshopParticipant(user_id=user.id, workshop_id=user_data.workshop_id, role=user_data.role)
  db_service.add_workshop_participant(participant)

  return user


@router.post('/admin/facilitators/')
async def create_facilitator_config(config_data: FacilitatorConfigCreate, db_service=Depends(get_database_service)):
  """Create a pre-configured facilitator (admin only)."""
  # In a real system, you'd check admin permissions here
  # For now, we'll allow this endpoint to be called

  # Check if facilitator already exists
  existing_config = db_service.get_facilitator_config(config_data.email)
  if existing_config:
    raise HTTPException(status_code=400, detail='Facilitator with this email already exists')

  # Create facilitator configuration
  config = db_service.create_facilitator_config(config_data)

  return {'config': config, 'message': 'Facilitator configuration created successfully'}


@router.get('/admin/facilitators/')
async def list_facilitator_configs(db_service=Depends(get_database_service)):
  """List all pre-configured facilitators (admin only)."""
  configs = db_service.list_facilitator_configs()
  return configs


@router.post('/invitations/')
async def create_invitation(invitation_data: UserInvite, db_service=Depends(get_database_service)):
  """Create a new user invitation (facilitators only)."""
  # Verify the inviter is a facilitator
  inviter = db_service.get_user(invitation_data.invited_by)
  if not inviter or inviter.role != UserRole.FACILITATOR:
    raise HTTPException(status_code=403, detail='Only facilitators can create invitations')

  # Check if user already exists
  existing_user = db_service.get_user_by_email(invitation_data.email)
  if existing_user:
    raise HTTPException(status_code=400, detail='User with this email already exists')

  # Create invitation
  invitation = db_service.create_invitation(invitation_data)

  return {
    'invitation': invitation,
    'invitation_url': f'/invite/{invitation.invitation_token}',
    'message': 'Invitation created successfully',
  }


@router.get('/invitations/')
async def list_invitations(
  workshop_id: Optional[str] = None,
  status: Optional[str] = None,
  db_service=Depends(get_database_service),
):
  """List invitations (facilitators only)."""
  invitations = db_service.list_invitations(workshop_id=workshop_id, status=status)
  return invitations


@router.post('/workshops/{workshop_id}/users/')
async def add_user_to_workshop(workshop_id: str, user_data: UserCreate, db_service=Depends(get_database_service)):
  """Add a user to a workshop."""
  # Check if workshop exists
  workshop = db_service.get_workshop(workshop_id)
  if not workshop:
    raise HTTPException(status_code=404, detail='Workshop not found')

  # Check if user already exists globally
  existing_user = db_service.get_user_by_email(user_data.email)

  if existing_user:
    # User exists globally - check if they're already in this workshop
    existing_users = db_service.list_users(workshop_id=workshop_id)
    for user in existing_users:
      # Case-insensitive email comparison
      if user.email.lower() == user_data.email.lower():
        raise HTTPException(status_code=400, detail='User already exists in this workshop')

    # User exists globally but not in this workshop - add them to the workshop
    participant = WorkshopParticipant(user_id=existing_user.id, workshop_id=workshop_id, role=user_data.role)
    db_service.add_workshop_participant(participant)

    return {
      'user': existing_user,
      'message': f'User {existing_user.email} added to workshop successfully',
    }
  else:
    # User doesn't exist globally - create them
    user_data.workshop_id = workshop_id
    user = db_service.create_user_with_password(user_data)

    # Add user as workshop participant
    participant = WorkshopParticipant(user_id=user.id, workshop_id=workshop_id, role=user_data.role)
    db_service.add_workshop_participant(participant)

    return {
      'user': user,
      'message': f'User {user.email} created and added to workshop successfully',
    }


@router.get('/workshops/{workshop_id}/users/')
async def list_workshop_users(workshop_id: str, db_service=Depends(get_database_service)):
  """List all users in a workshop."""
  # Check if workshop exists
  workshop = db_service.get_workshop(workshop_id)
  if not workshop:
    raise HTTPException(status_code=404, detail='Workshop not found')

  # Get all users in the workshop
  users = db_service.list_users(workshop_id=workshop_id)

  return {'workshop_id': workshop_id, 'users': users, 'total_users': len(users)}


@router.get('/{user_id}', response_model=User)
async def get_user(user_id: str, db_service=Depends(get_database_service)):
  """Get user by ID."""
  user = db_service.get_user(user_id)
  if not user:
    raise HTTPException(status_code=404, detail='User not found')
  return user


@router.get('/', response_model=List[User])
async def list_users(
  workshop_id: Optional[str] = None,
  role: Optional[UserRole] = None,
  db_service=Depends(get_database_service),
):
  """List users, optionally filtered by workshop or role."""
  return db_service.list_users(workshop_id=workshop_id, role=role)


@router.get('/{user_id}/permissions', response_model=UserPermissions)
async def get_user_permissions(user_id: str, db_service=Depends(get_database_service)):
  """Get user permissions based on their role."""
  user = db_service.get_user(user_id)
  if not user:
    raise HTTPException(status_code=404, detail='User not found')

  return UserPermissions.for_role(user.role)


@router.put('/{user_id}/status')
async def update_user_status(user_id: str, status: UserStatus, db_service=Depends(get_database_service)):
  """Update user status."""
  user = db_service.get_user(user_id)
  if not user:
    raise HTTPException(status_code=404, detail='User not found')

  user.status = status
  db_service.update_user(user)
  return {'message': 'User status updated successfully'}


@router.put('/{user_id}/last-active')
async def update_last_active(user_id: str, db_service=Depends(get_database_service)):
  """Update user's last active timestamp."""
  user = db_service.get_user(user_id)
  if not user:
    raise HTTPException(status_code=404, detail='User not found')

  user.last_active = datetime.now()
  db_service.update_user(user)
  return {'message': 'Last active timestamp updated'}


@router.get('/workshops/{workshop_id}/participants', response_model=List[WorkshopParticipant])
async def get_workshop_participants(workshop_id: str, db_service=Depends(get_database_service)):
  """Get all participants in a workshop."""
  return db_service.get_workshop_participants(workshop_id)


@router.post('/workshops/{workshop_id}/participants/{user_id}/assign-traces')
async def assign_traces_to_user(workshop_id: str, user_id: str, trace_ids: List[str], db_service=Depends(get_database_service)):
  """Assign specific traces to a user for annotation."""
  # Verify user exists and is part of workshop
  user = db_service.get_user(user_id)
  if not user or user.workshop_id != workshop_id:
    raise HTTPException(status_code=404, detail='User not found in workshop')

  # Get or create participant record
  participant = db_service.get_workshop_participant(workshop_id, user_id)
  if not participant:
    participant = WorkshopParticipant(user_id=user_id, workshop_id=workshop_id, role=user.role)

  # Assign traces
  participant.assigned_traces = trace_ids
  db_service.update_workshop_participant(participant)

  return {'message': f'Assigned {len(trace_ids)} traces to user', 'trace_ids': trace_ids}


@router.get('/workshops/{workshop_id}/participants/{user_id}/assigned-traces')
async def get_assigned_traces(workshop_id: str, user_id: str, db_service=Depends(get_database_service)):
  """Get traces assigned to a specific user."""
  participant = db_service.get_workshop_participant(workshop_id, user_id)
  if not participant:
    raise HTTPException(status_code=404, detail='User not found in workshop')

  return {'assigned_traces': participant.assigned_traces}


@router.delete('/{user_id}')
async def delete_user(user_id: str, db_service=Depends(get_database_service)):
  """Delete a user (no authentication required)."""
  # Get the user to delete
  user_to_delete = db_service.get_user(user_id)
  if not user_to_delete:
    raise HTTPException(status_code=404, detail='User not found')

  # Prevent deleting facilitators
  if user_to_delete.role == UserRole.FACILITATOR:
    raise HTTPException(status_code=403, detail='Cannot delete facilitators')

  # Delete the user
  db_service.delete_user(user_id)

  return {'message': 'User deleted successfully'}


@router.delete('/workshops/{workshop_id}/users/{user_id}')
async def remove_user_from_workshop(workshop_id: str, user_id: str, db_service=Depends(get_database_service)):
  """Remove a user from a workshop (but keep them in the system)."""
  # Check if workshop exists
  workshop = db_service.get_workshop(workshop_id)
  if not workshop:
    raise HTTPException(status_code=404, detail='Workshop not found')

  # Check if user exists
  user = db_service.get_user(user_id)
  if not user:
    raise HTTPException(status_code=404, detail='User not found')

  # Remove user from workshop
  db_service.remove_user_from_workshop(workshop_id, user_id)

  return {'message': f'User {user.email} removed from workshop successfully'}


@router.put('/workshops/{workshop_id}/users/{user_id}/role')
async def update_user_role_in_workshop(
  workshop_id: str, 
  user_id: str, 
  role_data: dict,
  db_service=Depends(get_database_service)
):
  """Update a user's role in a workshop (SME <-> Participant)."""
  # Check if workshop exists
  workshop = db_service.get_workshop(workshop_id)
  if not workshop:
    raise HTTPException(status_code=404, detail='Workshop not found')

  # Check if user exists
  user = db_service.get_user(user_id)
  if not user:
    raise HTTPException(status_code=404, detail='User not found')

  # Cannot change facilitator role
  if user.role == UserRole.FACILITATOR:
    raise HTTPException(status_code=403, detail='Cannot change facilitator role')

  new_role = role_data.get('role')
  if new_role not in ['sme', 'participant']:
    raise HTTPException(status_code=400, detail='Role must be "sme" or "participant"')

  # Update the user's role
  updated_user = db_service.update_user_role_in_workshop(workshop_id, user_id, new_role)
  
  return {
    'user': updated_user,
    'message': f'User role updated to {new_role.upper()} successfully'
  }


@router.post('/workshops/{workshop_id}/auto-assign-annotations')
async def auto_assign_annotations(workshop_id: str, db_service=Depends(get_database_service)):
  """Automatically balance annotation assignments across SMEs and participants."""
  # Get all traces in workshop
  traces = db_service.get_traces_by_workshop(workshop_id)

  # Get SMEs and participants (exclude facilitator from annotations)
  participants = db_service.get_workshop_participants(workshop_id)
  annotators = [p for p in participants if p.role in [UserRole.SME, UserRole.PARTICIPANT]]

  if not annotators:
    raise HTTPException(status_code=400, detail='No annotators available')

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
    'message': 'Annotations auto-assigned successfully',
    'assignments': assignments,
    'total_traces': len(traces),
    'total_annotators': len(annotators),
  }
