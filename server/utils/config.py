"""Configuration utilities for loading YAML settings."""

import os
from pathlib import Path
from typing import Any

import yaml


def load_auth_config(config_path: str | None = None) -> dict[str, Any]:
    """Load authentication configuration from YAML file.

    Args:
        config_path: Path to config file. If None, uses default location.

    Returns:
        Configuration dictionary
    """
    if config_path is None:
        # Default to config/auth.yaml relative to project root
        project_root = Path(__file__).parent.parent.parent
        config_path = project_root / "config" / "auth.yaml"

    if not os.path.exists(config_path):
        # Return default configuration if file doesn't exist
        return {
            "facilitators": [
                {
                    "email": "facilitator@databricks.com",
                    "password": "facilitator123",
                    "name": "Databricks Facilitator",
                    "description": "Primary workshop facilitator",
                }
            ],
            "security": {
                "default_user_password": "changeme123",
                "password_requirements": {
                    "min_length": 8,
                    "require_uppercase": True,
                    "require_lowercase": True,
                    "require_numbers": True,
                    "require_special_chars": False,
                },
                "session": {"token_expiry_hours": 24, "refresh_token_expiry_days": 7},
            },
        }

    try:
        with open(config_path) as f:
            config = yaml.safe_load(f)
        return config or {}
    except Exception as e:
        print(f"Warning: Could not load auth config from {config_path}: {e}")
        return {}


def get_facilitator_config(email: str, config_path: str | None = None) -> dict[str, Any] | None:
    """Get facilitator configuration for a specific email.

    Args:
        email: Facilitator email
        config_path: Path to config file

    Returns:
        Facilitator config dict or None if not found
    """
    config = load_auth_config(config_path)
    facilitators = config.get("facilitators", [])

    # Case-insensitive email comparison
    email_lower = email.lower()
    for facilitator in facilitators:
        if facilitator.get("email", "").lower() == email_lower:
            return facilitator

    return None


def get_security_config(config_path: str | None = None) -> dict[str, Any]:
    """Get security configuration.

    Args:
        config_path: Path to config file

    Returns:
        Security configuration dict
    """
    config = load_auth_config(config_path)
    return config.get("security", {})
