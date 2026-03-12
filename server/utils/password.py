"""Password utilities for authentication."""

import re

import bcrypt


def hash_password(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password: Plain text password (can be empty for SME/participant accounts)

    Returns:
        Hashed password string
    """
    # Allow empty passwords for SME/participant accounts (email-only login)
    if not password:
        # Return a special hash for empty passwords
        # This will never match any real password input
        return bcrypt.hashpw(b"", bcrypt.gensalt()).decode("utf-8")

    # Generate salt and hash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify a password against its hash.

    Args:
        password: Plain text password to verify
        hashed_password: Hashed password to check against

    Returns:
        True if password matches, False otherwise
    """
    if not password or not hashed_password:
        return False

    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def validate_password_strength(
    password: str,
    min_length: int = 8,
    require_uppercase: bool = True,
    require_lowercase: bool = True,
    require_numbers: bool = True,
    require_special_chars: bool = False,
) -> tuple[bool, str | None]:
    """Validate password strength according to requirements.

    Args:
        password: Password to validate
        min_length: Minimum password length
        require_uppercase: Whether to require uppercase letters
        require_lowercase: Whether to require lowercase letters
        require_numbers: Whether to require numbers
        require_special_chars: Whether to require special characters

    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < min_length:
        return False, f"Password must be at least {min_length} characters long"

    if require_uppercase and not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter"

    if require_lowercase and not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter"

    if require_numbers and not re.search(r"\d", password):
        return False, "Password must contain at least one number"

    if require_special_chars and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "Password must contain at least one special character"

    return True, None


def generate_default_password(email: str) -> str:
    """Generate a default password for new users.
    SMEs and participants don't need passwords (email-only login).

    Args:
        email: User's email address

    Returns:
        Default password string (empty for participants/SMEs)
    """
    # For workshop participants and SMEs, no password needed
    # They authenticate with email only
    # This will be hashed and stored but never used for authentication
    return ""
