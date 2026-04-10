"""Databricks Model Serving API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import (
    DatabricksChatCompletion,
    DatabricksConfig,
    DatabricksConnectionTest,
    DatabricksEndpointCall,
    DatabricksEndpointInfo,
    DatabricksResponse,
)
from server.services.database_service import DatabaseService
from server.services.databricks_service import DatabricksService, create_databricks_service

router = APIRouter()


def get_databricks_service(config: DatabricksConfig) -> DatabricksService:
    """Create a Databricks service instance from configuration."""
    try:
        return create_databricks_service(workspace_url=config.workspace_url, token=config.token or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize Databricks service: {e!s}") from e


@router.post("/test-connection", response_model=DatabricksConnectionTest)
async def test_databricks_connection(config: DatabricksConfig) -> DatabricksConnectionTest:
    """Test the connection to a Databricks workspace.

    Args:
        config: Databricks workspace configuration

    Returns:
        Connection test results
    """
    try:
        service = get_databricks_service(config)
        result = service.test_connection()
        return DatabricksConnectionTest(**result)
    except Exception as e:
        return DatabricksConnectionTest(
            status="failed",
            workspace_url=config.workspace_url,
            error=str(e),
            message=f"Connection test failed: {e!s}",
        )


@router.get("/endpoints", response_model=list[DatabricksEndpointInfo])
async def list_serving_endpoints(config: DatabricksConfig) -> list[DatabricksEndpointInfo]:
    """List all available serving endpoints in the Databricks workspace.

    Args:
        config: Databricks workspace configuration

    Returns:
        List of serving endpoint information
    """
    service = get_databricks_service(config)
    endpoints = service.list_serving_endpoints()
    return [DatabricksEndpointInfo(**endpoint) for endpoint in endpoints]


@router.get("/endpoints/{endpoint_name}", response_model=DatabricksEndpointInfo)
async def get_endpoint_info(endpoint_name: str, config: DatabricksConfig) -> DatabricksEndpointInfo:
    """Get detailed information about a specific serving endpoint.

    Args:
        endpoint_name: Name of the serving endpoint
        config: Databricks workspace configuration

    Returns:
        Detailed endpoint information
    """
    service = get_databricks_service(config)
    endpoint_info = service.get_endpoint_info(endpoint_name)
    return DatabricksEndpointInfo(**endpoint_info)


@router.post("/call", response_model=DatabricksResponse)
async def call_serving_endpoint(request: DatabricksEndpointCall, config: DatabricksConfig) -> DatabricksResponse:
    """Call a Databricks serving endpoint with a prompt.

    Args:
        request: Endpoint call request with prompt and parameters
        config: Databricks workspace configuration

    Returns:
        Response from the model
    """
    try:
        service = get_databricks_service(config)

        # Prepare parameters for the service call
        params = {
            "endpoint_name": request.endpoint_name,
            "prompt": request.prompt,
            "temperature": request.temperature,
        }

        if request.max_tokens:
            params["max_tokens"] = request.max_tokens

        if request.model_parameters:
            params["model_parameters"] = request.model_parameters

        # Make the API call
        result = service.call_serving_endpoint(**params)

        return DatabricksResponse(success=True, data=result, endpoint_name=request.endpoint_name)

    except Exception as e:
        return DatabricksResponse(success=False, error=str(e), endpoint_name=request.endpoint_name)


@router.post("/chat", response_model=DatabricksResponse)
async def call_chat_completion(request: DatabricksChatCompletion, config: DatabricksConfig) -> DatabricksResponse:
    """Call a Databricks serving endpoint using chat completion format.

    Args:
        request: Chat completion request with messages
        config: Databricks workspace configuration

    Returns:
        Response from the model
    """
    try:
        service = get_databricks_service(config)

        # Convert messages to the format expected by the service
        messages = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        # Prepare parameters for the service call
        params = {
            "endpoint_name": request.endpoint_name,
            "messages": messages,
            "temperature": request.temperature,
        }

        if request.max_tokens:
            params["max_tokens"] = request.max_tokens

        if request.model_parameters:
            params["model_parameters"] = request.model_parameters

        # Make the API call
        result = service.call_chat_completion(**params)

        return DatabricksResponse(success=True, data=result, endpoint_name=request.endpoint_name)

    except Exception as e:
        return DatabricksResponse(success=False, error=str(e), endpoint_name=request.endpoint_name)


@router.post("/judge-evaluate")
async def evaluate_judge_prompt(request: dict, db: Session = Depends(get_db)) -> DatabricksResponse:
    """Evaluate a judge prompt using Databricks serving endpoint.
    This is specifically designed for judge evaluation with default parameters.

    Args:
        request: Dictionary containing endpoint_name, prompt, config, temperature, max_tokens
        db: Database session

    Returns:
        Response from the model
    """
    try:
        endpoint_name = request.get("endpoint_name")
        prompt = request.get("prompt")
        config_data = request.get("config", {})
        temperature = request.get("temperature", 0.0)
        max_tokens = request.get("max_tokens", 10)
        workshop_id = request.get("workshop_id")

        # Resolve workspace URL from MLflow config or request config
        workspace_url = config_data.get("workspace_url")
        if workshop_id:
            db_service = DatabaseService(db)
            mlflow_config = db_service.get_mlflow_config(workshop_id)
            if mlflow_config:
                workspace_url = mlflow_config.databricks_host

        # Use SDK auth via create_databricks_service (token from request is fallback)
        service = create_databricks_service(
            workspace_url=workspace_url,
            token=config_data.get("token") or None,
        )

        # Call the serving endpoint with judge-specific parameters using SDK (same as intake)
        result = service.call_serving_endpoint(
            endpoint_name=endpoint_name, prompt=prompt, temperature=temperature, max_tokens=max_tokens
        )

        return DatabricksResponse(success=True, data=result, endpoint_name=endpoint_name)

    except Exception as e:
        return DatabricksResponse(success=False, error=str(e), endpoint_name=endpoint_name)


@router.post("/simple-call")
async def simple_endpoint_call(
    endpoint_name: str,
    prompt: str,
    temperature: float = 0.5,
    max_tokens: int = None,
    workspace_url: str = None,
    token: str = None,
) -> dict[str, Any]:
    """Simple endpoint call for testing purposes.

    Args:
        endpoint_name: Name of the serving endpoint
        prompt: The prompt to send
        temperature: Temperature for generation
        max_tokens: Maximum tokens to generate
        workspace_url: Databricks workspace URL
        token: Databricks API token

    Returns:
        Response from the model
    """
    try:
        # Create config from parameters
        config = DatabricksConfig(workspace_url=workspace_url, token=token)

        service = get_databricks_service(config)

        # Prepare parameters
        params = {"endpoint_name": endpoint_name, "prompt": prompt, "temperature": temperature}

        if max_tokens:
            params["max_tokens"] = max_tokens

        # Make the API call
        result = service.call_serving_endpoint(**params)

        return {"success": True, "data": result, "endpoint_name": endpoint_name}

    except Exception as e:
        return {"success": False, "error": str(e), "endpoint_name": endpoint_name}
