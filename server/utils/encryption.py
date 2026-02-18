"""Encryption utilities for sensitive data storage."""

import base64
import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


class EncryptionManager:
    """Manages encryption and decryption of sensitive data."""

    def __init__(self, secret_key: str = None):
        """Initialize encryption manager.

        Args:
            secret_key: Optional secret key. If not provided, will use environment variable ENCRYPTION_KEY
        """
        if secret_key:
            self.secret_key = secret_key
        else:
            self.secret_key = os.getenv("ENCRYPTION_KEY")

        if not self.secret_key:
            # Generate a new key if none exists
            self.secret_key = self._generate_key()
            logger.warning(
                "No encryption key found. Generated new key. Please set ENCRYPTION_KEY environment variable for production."
            )

        # Create Fernet cipher
        self.cipher = Fernet(self.secret_key.encode())

    def _generate_key(self) -> str:
        """Generate a new encryption key."""
        key = Fernet.generate_key()
        return key.decode()

    def encrypt(self, data: str) -> str:
        """Encrypt a string.

        Args:
            data: String to encrypt

        Returns:
            Encrypted string (base64 encoded)
        """
        if not data:
            return ""

        try:
            encrypted_data = self.cipher.encrypt(data.encode())
            return base64.b64encode(encrypted_data).decode()
        except Exception as e:
            logger.error(f"Encryption failed: {e}")
            raise ValueError(f"Failed to encrypt data: {e}") from e

    def decrypt(self, encrypted_data: str) -> str:
        """Decrypt a string.

        Args:
            encrypted_data: Encrypted string (base64 encoded)

        Returns:
            Decrypted string
        """
        if not encrypted_data:
            return ""

        try:
            # Decode from base64
            encrypted_bytes = base64.b64decode(encrypted_data.encode())
            decrypted_data = self.cipher.decrypt(encrypted_bytes)
            return decrypted_data.decode()
        except Exception as e:
            logger.error(f"Decryption failed: {e}")
            raise ValueError(f"Failed to decrypt data: {e}") from e

    def is_encrypted(self, data: str) -> bool:
        """Check if data appears to be encrypted.

        Args:
            data: String to check

        Returns:
            True if data appears to be encrypted
        """
        if not data:
            return False

        try:
            # Try to decode as base64
            decoded = base64.b64decode(data.encode())

            # Check if it's a valid Fernet token (32 bytes + signature)
            if len(decoded) >= 32:
                # Try to decrypt with our cipher to see if it's our encrypted data
                try:
                    self.cipher.decrypt(decoded)
                    return True
                except Exception:
                    # If decryption fails, it's not our encrypted data
                    pass

            # If it's base64 but not our encrypted format, it's probably not encrypted
            return False
        except Exception:
            # If base64 decode fails, it's probably not encrypted
            return False


# Global encryption manager instance
_encryption_manager = None


def get_encryption_manager() -> EncryptionManager:
    """Get the global encryption manager instance."""
    global _encryption_manager
    if _encryption_manager is None:
        _encryption_manager = EncryptionManager()
    return _encryption_manager


def encrypt_sensitive_data(data: str) -> str:
    """Encrypt sensitive data.

    Args:
        data: Data to encrypt

    Returns:
        Encrypted data
    """
    if not data:
        return ""

    manager = get_encryption_manager()

    # Only encrypt if not already encrypted
    if not manager.is_encrypted(data):
        return manager.encrypt(data)
    return data


def decrypt_sensitive_data(data: str) -> str:
    """Decrypt sensitive data.

    Args:
        data: Data to decrypt

    Returns:
        Decrypted data
    """
    if not data:
        return ""

    manager = get_encryption_manager()

    # Only decrypt if it appears to be encrypted
    if manager.is_encrypted(data):
        return manager.decrypt(data)
    return data
