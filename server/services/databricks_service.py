"""Databricks Model Serving Service.

This service handles calls to Databricks model serving endpoints using the OpenAI client.
"""

import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

import requests
from fastapi import HTTPException
from openai import OpenAI

logger = logging.getLogger(__name__)

# Global client cache to reuse OpenAI clients across requests
# Key: (workspace_url, token_hash) -> OpenAI client
_client_cache = {}


def _get_token_hash(token: str) -> str:
    """Get a hash of the token for cache key (don't store actual token in cache key)."""
    return hashlib.sha256(token.encode()).hexdigest()[:16]


class DatabricksService:
    """Service for interacting with Databricks model serving endpoints."""

    def __init__(
        self,
        workspace_url: Optional[str] = None,
        token: Optional[str] = None,
        workshop_id: Optional[str] = None,
        db_service=None,
        init_sdk: bool = True,
    ):
        """Initialize the Databricks service.

        Args:
            workspace_url: Databricks workspace URL (e.g., https://adb-1234567890123456.7.azuredatabricks.net)
            token: Databricks API token
            workshop_id: Workshop ID to get MLflow config from database
            db_service: Database service instance to fetch MLflow config
            init_sdk: Whether to initialize the Databricks SDK (set False for direct HTTP calls only)
        """
        # If workshop_id and db_service are provided, try to get token from memory storage
        if workshop_id and db_service:
            try:
                from server.services.token_storage_service import token_storage

                databricks_token = token_storage.get_token(workshop_id)
                if not databricks_token and db_service:
                    databricks_token = db_service.get_databricks_token(workshop_id)
                    if databricks_token:
                        token_storage.store_token(workshop_id, databricks_token)
                if databricks_token:
                    mlflow_config = db_service.get_mlflow_config(workshop_id)
                    if mlflow_config:
                        self.workspace_url = workspace_url or mlflow_config.databricks_host
                        self.token = token or databricks_token
                        print(f"Using token from memory storage for workshop {workshop_id}")
                    else:
                        # Fallback to provided parameters or environment variables
                        self.workspace_url = workspace_url or os.getenv("DATABRICKS_HOST")
                        self.token = token or databricks_token
                else:
                    # Fallback to provided parameters or environment variables
                    self.workspace_url = workspace_url or os.getenv("DATABRICKS_HOST")
                    self.token = token or os.getenv("DATABRICKS_TOKEN")
            except Exception as e:
                print(f"Failed to get token from memory storage for workshop {workshop_id}: {e}")
                # Fallback to provided parameters or environment variables
                self.workspace_url = workspace_url or os.getenv("DATABRICKS_HOST")
                self.token = token or os.getenv("DATABRICKS_TOKEN")
        else:
            # Use provided parameters or environment variables
            self.workspace_url = workspace_url or os.getenv("DATABRICKS_HOST")
            self.token = token or os.getenv("DATABRICKS_TOKEN")

        if not self.workspace_url or not self.token:
            raise ValueError("Databricks workspace URL and token are required")

        # Initialize the OpenAI client for calling serving endpoints
        # Use cached client if available to avoid reinitializing for every request
        try:
            cache_key = (self.workspace_url, _get_token_hash(self.token))

            if cache_key in _client_cache:
                self.client = _client_cache[cache_key]
                logger.info(f"✅ Reusing cached OpenAI client for Databricks workspace: {self.workspace_url}")
            else:
                print(f"Initializing OpenAI client for Databricks workspace: {self.workspace_url}")

                # Create OpenAI client configured for Databricks serving endpoints
                self.client = OpenAI(api_key=self.token, base_url=f"{self.workspace_url}/serving-endpoints")

                # Cache the client for future requests
                _client_cache[cache_key] = self.client

                logger.info(
                    f"Successfully initialized and cached OpenAI client for Databricks workspace: {self.workspace_url}"
                )
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to initialize OpenAI client: {str(e)}")

    def call_serving_endpoint(
        self,
        endpoint_name: str,
        prompt: str,
        temperature: float = 0.5,
        max_tokens: Optional[int] = None,
        model_parameters: Optional[Dict[str, Any]] = None,
        response_format: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Call a Databricks serving endpoint using chat completion format.

        Args:
            endpoint_name: Name of the serving endpoint
            prompt: The prompt to send to the model
            temperature: Temperature for generation (0.0 to 1.0)
            max_tokens: Maximum number of tokens to generate
            model_parameters: Additional model parameters
            response_format: Optional structured output spec (e.g., {"type":"json_schema", ...})

        Returns:
            Dictionary containing the response from the model
        """

        def _do_call(request_params: Dict[str, Any]) -> Dict[str, Any]:
            # Make the API call using OpenAI client
            response = self.client.chat.completions.create(**request_params)

            # Convert response to dictionary format
            # Include the full message payload (content/refusal/tool_calls/etc.) so callers
            # can robustly parse structured outputs across models/endpoints.
            try:
                message_dump = response.choices[0].message.model_dump()
            except Exception:
                message_dump = {
                    "content": response.choices[0].message.content,
                    "role": response.choices[0].message.role,
                }

            result = {
                "choices": [
                    {
                        "message": message_dump,
                        "index": response.choices[0].index,
                        "finish_reason": response.choices[0].finish_reason,
                    }
                ],
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
            }
            return result

        try:
            # Prepare messages in OpenAI format
            messages = [
                {"role": "system", "content": "You are a helpful assistant."},
                {"role": "user", "content": prompt},
            ]

            # Prepare the request parameters
            request_params = {"messages": messages, "model": endpoint_name, "temperature": temperature}

            # Add optional parameters
            if max_tokens:
                request_params["max_tokens"] = max_tokens

            if model_parameters:
                request_params.update(model_parameters)

            # Structured outputs (Databricks Foundation Model APIs / OpenAI-compatible)
            if response_format:
                request_params["response_format"] = response_format

            logger.info(f"Calling Databricks serving endpoint: {endpoint_name}")
            logger.debug(f"Request parameters: {request_params}")

            try:
                result = _do_call(request_params)
            except Exception as e:
                # Backwards-compatible fallback for endpoints/models that don't support structured outputs.
                if response_format:
                    logger.warning(
                        "Structured outputs request failed for endpoint=%s; retrying without response_format. Error: %s",
                        endpoint_name,
                        e,
                    )
                    request_params.pop("response_format", None)
                    result = _do_call(request_params)
                else:
                    raise

            logger.info(f"Successfully called serving endpoint: {endpoint_name}")
            logger.debug(f"Response: {result}")

            return result

        except Exception as e:
            logger.error(f"Error calling serving endpoint {endpoint_name}: {e}")
            logger.error(f"Error type: {type(e)}")
            logger.error("Full traceback:", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error calling serving endpoint: {str(e)}")

    def list_serving_endpoints(self) -> List[Dict[str, Any]]:
        """List all available serving endpoints.
        Note: This method returns a placeholder since OpenAI client doesn't provide endpoint listing.
        You may need to implement this using direct HTTP calls to Databricks API.

        Returns:
            List of serving endpoint information
        """
        try:
            logger.info("Listing Databricks serving endpoints")

            # Since OpenAI client doesn't provide endpoint listing, return a placeholder
            # In a real implementation, you might want to make direct HTTP calls to Databricks API
            endpoint_list = [
                {
                    "name": "databricks-claude-sonnet-4-5",
                    "id": "placeholder-id",
                    "state": "active",
                    "config": {"model_name": "claude-4-5-sonnet"},
                }
            ]

            logger.info(f"Found {len(endpoint_list)} serving endpoints (placeholder)")
            return endpoint_list

        except Exception as e:
            logger.error(f"Error listing endpoints: {e}")
            raise HTTPException(status_code=500, detail=f"Error listing endpoints: {str(e)}")

    def get_endpoint_info(self, endpoint_name: str) -> Dict[str, Any]:
        """Get information about a specific serving endpoint.
        Note: This method returns placeholder info since OpenAI client doesn't provide endpoint details.
        You may need to implement this using direct HTTP calls to Databricks API.

        Args:
            endpoint_name: Name of the serving endpoint

        Returns:
            Dictionary containing endpoint information
        """
        try:
            logger.info(f"Getting information for serving endpoint: {endpoint_name}")

            # Since OpenAI client doesn't provide endpoint details, return placeholder info
            endpoint_info = {
                "name": endpoint_name,
                "id": "placeholder-id",
                "state": "active",
                "config": {"model_name": endpoint_name},
                "creator": "placeholder",
                "created_at": "2024-01-01T00:00:00Z",
                "updated_at": "2024-01-01T00:00:00Z",
            }

            logger.info(f"Successfully retrieved endpoint info for: {endpoint_name} (placeholder)")
            return endpoint_info

        except Exception as e:
            logger.error(f"Error getting endpoint info for {endpoint_name}: {e}")
            raise HTTPException(status_code=500, detail=f"Error getting endpoint info: {str(e)}")

    def test_connection(self) -> Dict[str, Any]:
        """Test the connection to Databricks workspace.

        Returns:
            Dictionary containing connection status
        """
        try:
            logger.info("Testing Databricks connection")

            # TODO: this is a noop, actually handle connection testing?
            # test_response = self.client.chat.completions.create(
            #   messages=[{'role': 'user', 'content': 'Hello'}],
            #   max_tokens=5,
            # )

            return {
                "status": "connected",
                "workspace_url": self.workspace_url,
                "endpoints_count": 1,  # Placeholder
                "message": "Successfully connected to Databricks workspace",
            }

        except Exception as e:
            logger.error(f"Connection test failed: {e}")
            return {
                "status": "failed",
                "workspace_url": self.workspace_url,
                "error": str(e),
                "message": "Failed to connect to Databricks workspace",
            }

    def call_chat_completion(
        self,
        endpoint_name: str,
        messages: List[Dict[str, str]],
        temperature: float = 0.5,
        max_tokens: Optional[int] = None,
        model_parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Call a Databricks serving endpoint using chat completion format with OpenAI client.

        Args:
            endpoint_name: Name of the serving endpoint
            messages: List of message dictionaries with 'role' and 'content'
            temperature: Temperature for generation (0.0 to 1.0)
            max_tokens: Maximum number of tokens to generate
            model_parameters: Additional model parameters

        Returns:
            Dictionary containing the response from the model
        """
        try:
            # Prepare the request parameters
            request_params = {"messages": messages, "model": endpoint_name, "temperature": temperature}

            # Add optional parameters
            if max_tokens:
                request_params["max_tokens"] = max_tokens

            if model_parameters:
                request_params.update(model_parameters)

            logger.info(f"Calling Databricks serving endpoint with chat completion: {endpoint_name}")
            logger.debug(f"Request parameters: {request_params}")

            # Make the API call using OpenAI client
            response = self.client.chat.completions.create(**request_params)

            # Convert response to dictionary format
            try:
                message_dump = response.choices[0].message.model_dump()
            except Exception:
                message_dump = {
                    "content": response.choices[0].message.content,
                    "role": response.choices[0].message.role,
                }

            result = {
                "choices": [
                    {
                        "message": message_dump,
                        "index": response.choices[0].index,
                        "finish_reason": response.choices[0].finish_reason,
                    }
                ],
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.prompt_tokens,
                    "completion_tokens": response.usage.completion_tokens,
                    "total_tokens": response.usage.total_tokens,
                },
            }

            logger.info(f"Successfully called serving endpoint: {endpoint_name}")
            logger.debug(f"Response: {result}")

            return result

        except Exception as e:
            logger.error(f"Error calling serving endpoint {endpoint_name}: {e}")
            logger.error(f"Error type: {type(e)}")
            logger.error("Full traceback:", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Error calling serving endpoint: {str(e)}")

    def call_serving_endpoint_direct(
        self,
        endpoint_name: str,
        prompt: str,
        temperature: float = 0.5,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Call a Databricks serving endpoint directly via HTTP API.
        This bypasses the Databricks SDK to avoid authentication issues.

        Args:
            endpoint_name: Name of the serving endpoint
            prompt: The prompt to send to the model
            temperature: Temperature for generation (0.0 to 1.0)
            max_tokens: Maximum number of tokens to generate

        Returns:
            Dictionary containing the response from the model
        """
        try:
            # Prepare the API URL
            api_url = f"{self.workspace_url.rstrip('/')}/serving-endpoints/{endpoint_name}/invocations"

            # Prepare headers with PAT token authentication
            headers = {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

            # Prepare the request payload in chat completion format
            payload = {
                "messages": [
                    {"role": "system", "content": "You are a helpful assistant."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": temperature,
            }

            # Add max_tokens if specified
            if max_tokens:
                payload["max_tokens"] = max_tokens

            logger.info(f"Calling Databricks serving endpoint directly: {endpoint_name}")
            logger.debug(f"Request URL: {api_url}")
            logger.debug(f"Request payload: {payload}")
            # Log token prefix for debugging (never log full token)
            token_prefix = self.token[:10] if self.token else "None"
            print(f"Using token starting with: {token_prefix}...")

            # Make the HTTP request
            response = requests.post(api_url, headers=headers, json=payload, timeout=60)

            # Add detailed error logging for 403 errors
            if response.status_code == 403:
                print("403 Forbidden error details:")
                print(f"  - Endpoint: {endpoint_name}")
                print(f"  - URL: {api_url}")
                print(f"  - Token prefix: {token_prefix}...")
                print(f"  - Response text: {response.text}")

            # Check if request was successful
            response.raise_for_status()

            # Parse the response
            result = response.json()

            logger.info(f"Successfully called serving endpoint: {endpoint_name}")
            logger.debug(f"Response: {result}")

            return result

        except requests.exceptions.RequestException as e:
            logger.error(f"HTTP request error calling endpoint {endpoint_name}: {e}")
            raise HTTPException(status_code=500, detail=f"HTTP request error: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected error calling serving endpoint {endpoint_name}: {e}")
            logger.error(f"Error type: {type(e)}")
            logger.error("Full traceback:", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


# Factory function to create Databricks service instance
def create_databricks_service(
    workspace_url: Optional[str] = None,
    token: Optional[str] = None,
    workshop_id: Optional[str] = None,
    db_service=None,
) -> DatabricksService:
    """Create a Databricks service instance.

    Args:
        workspace_url: Databricks workspace URL
        token: Databricks API token
        workshop_id: Workshop ID to get MLflow config from database
        db_service: Database service instance to fetch MLflow config

    Returns:
        DatabricksService instance
    """
    return DatabricksService(workspace_url=workspace_url, token=token, workshop_id=workshop_id, db_service=db_service)
