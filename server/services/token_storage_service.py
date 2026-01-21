"""In-memory token storage service for Databricks tokens."""

import threading
from datetime import datetime, timedelta
from typing import Dict, Optional


class TokenStorageService:
  """Service for storing Databricks tokens in memory with expiration."""

  def __init__(self):
    self._tokens: Dict[str, Dict[str, any]] = {}
    self._lock = threading.Lock()
    self._default_expiry_hours = 24  # Tokens expire after 24 hours by default

  def store_token(self, workshop_id: str, token: str, expiry_hours: int = None) -> None:
    """Store a token for a workshop with optional expiration."""
    if expiry_hours is None:
      expiry_hours = self._default_expiry_hours

    expiry_time = datetime.now() + timedelta(hours=expiry_hours)

    with self._lock:
      self._tokens[workshop_id] = {'token': token, 'expires_at': expiry_time, 'created_at': datetime.now()}

  def get_token(self, workshop_id: str) -> Optional[str]:
    """Retrieve a token for a workshop if it exists and hasn't expired."""
    with self._lock:
      if workshop_id not in self._tokens:
        return None

      token_data = self._tokens[workshop_id]

      # Check if token has expired
      if datetime.now() > token_data['expires_at']:
        # Remove expired token
        del self._tokens[workshop_id]
        return None

      return token_data['token']

  def remove_token(self, workshop_id: str) -> bool:
    """Remove a token for a workshop."""
    with self._lock:
      if workshop_id in self._tokens:
        del self._tokens[workshop_id]
        return True
      return False

  def delete_token(self, key: str) -> bool:
    """Alias for remove_token for API consistency."""
    return self.remove_token(key)

  def has_token(self, workshop_id: str) -> bool:
    """Check if a valid (non-expired) token exists for a workshop."""
    return self.get_token(workshop_id) is not None

  def cleanup_expired_tokens(self) -> int:
    """Remove all expired tokens and return count of removed tokens."""
    current_time = datetime.now()
    expired_workshops = []

    with self._lock:
      for workshop_id, token_data in self._tokens.items():
        if current_time > token_data['expires_at']:
          expired_workshops.append(workshop_id)

      for workshop_id in expired_workshops:
        del self._tokens[workshop_id]

    return len(expired_workshops)

  def get_token_info(self, workshop_id: str) -> Optional[Dict[str, any]]:
    """Get token information including creation and expiry times."""
    with self._lock:
      if workshop_id not in self._tokens:
        return None

      token_data = self._tokens[workshop_id]

      # Check if token has expired
      if datetime.now() > token_data['expires_at']:
        del self._tokens[workshop_id]
        return None

      return {'created_at': token_data['created_at'], 'expires_at': token_data['expires_at'], 'is_expired': False}


# Global instance for the application
token_storage = TokenStorageService()
