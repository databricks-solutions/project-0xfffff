# Custom LLM Provider Specification

## Overview

This specification defines how users can configure custom OpenAI-compatible LLM endpoints for judge evaluation when they cannot use Databricks Foundation Model APIs (FMAPI). This enables users with alternative LLM providers (Azure OpenAI, self-hosted models, vLLM, etc.) to use the judge evaluation features.

## Motivation

Some users deploying the Human Evaluation Workshop may not have access to Databricks FMAPI due to:
- Regional availability restrictions
- Organization policy constraints
- Cost considerations
- Preference for specific model providers (Azure OpenAI, Anthropic, self-hosted)

This feature provides a no-code configuration path for OpenAI-compatible endpoints.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Custom LLM Provider Flow                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │   Workshop   │    │   Custom     │    │   OpenAI-Compatible  │  │
│  │   Config UI  │───▶│   Provider   │───▶│   Endpoint           │  │
│  │              │    │   Config     │    │   (Azure, vLLM, etc) │  │
│  └──────────────┘    └──────────────┘    └──────────────────────┘  │
│                             │                      │                │
│                             ▼                      │                │
│                      ┌──────────────┐              │                │
│                      │   MLflow     │              │                │
│                      │   evaluate() │◀─────────────┘                │
│                      │   proxy_url  │                               │
│                      └──────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Integration with MLflow

MLflow's `make_genai_metric_from_prompt()` supports a `proxy_url` parameter that overrides the default endpoint URL. This is the preferred integration point because:

1. **Explicit**: Each evaluation call specifies its endpoint directly
2. **Isolated**: No global environment variable pollution
3. **Per-workshop**: Different workshops can use different providers

```python
metric = make_genai_metric_from_prompt(
    name="workshop_judge",
    judge_prompt=prompt_template,
    model="openai:/custom-model",  # Model name for the custom endpoint
    proxy_url="https://your-endpoint.com/v1/chat/completions",  # Custom endpoint
    parameters={"temperature": 0.0},
)
```

## Data Model

### CustomLLMProviderConfig

Configuration for a custom OpenAI-compatible LLM provider.

```
CustomLLMProviderConfig:
  - id: UUID
  - workshop_id: UUID (FK to workshops, unique)
  - provider_name: string           # User-friendly name, e.g., "Azure OpenAI"
  - base_url: string                # Base URL, e.g., "https://my-resource.openai.azure.com/openai/deployments/gpt-4"
  - model_name: string              # Model identifier for the endpoint
  - is_enabled: boolean             # Whether to use custom provider vs Databricks
  - created_at: timestamp
  - updated_at: timestamp

# Note: API key is stored in TokenStorageService (in-memory) like databricks_token
# It is NOT persisted to the database for security reasons
```

### Database Schema

```sql
CREATE TABLE custom_llm_provider_config (
    id TEXT PRIMARY KEY,
    workshop_id TEXT NOT NULL UNIQUE REFERENCES workshops(id),
    provider_name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model_name TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Pydantic Models

```python
class CustomLLMProviderConfig(BaseModel):
    """Configuration for custom OpenAI-compatible LLM provider."""

    provider_name: str = Field(..., description="User-friendly provider name")
    base_url: str = Field(..., description="Base URL for the OpenAI-compatible endpoint")
    api_key: str = Field(..., description="API key (not persisted to DB)")
    model_name: str = Field(..., description="Model name/identifier")
    is_enabled: bool = Field(default=True, description="Whether custom provider is active")


class CustomLLMProviderConfigCreate(BaseModel):
    """Request model for creating/updating custom LLM provider config."""

    provider_name: str = Field(..., description="User-friendly provider name")
    base_url: str = Field(..., description="Base URL for the OpenAI-compatible endpoint")
    api_key: str = Field(..., description="API key for authentication")
    model_name: str = Field(..., description="Model name/identifier")


class CustomLLMProviderStatus(BaseModel):
    """Status of custom LLM provider configuration."""

    workshop_id: str
    is_configured: bool = False
    is_enabled: bool = False
    provider_name: Optional[str] = None
    base_url: Optional[str] = None  # Shown in UI for reference
    model_name: Optional[str] = None
    has_api_key: bool = False  # Whether key is stored (don't expose actual key)
```

## API Endpoints

### Configure Custom LLM Provider

```
POST /workshops/{workshop_id}/custom-llm-provider
Content-Type: application/json

{
  "provider_name": "Azure OpenAI",
  "base_url": "https://my-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2024-02-15-preview",
  "api_key": "your-api-key-here",
  "model_name": "gpt-4"
}

Response: 200 OK
{
  "workshop_id": "uuid",
  "is_configured": true,
  "is_enabled": true,
  "provider_name": "Azure OpenAI",
  "base_url": "https://my-resource.openai.azure.com/...",
  "model_name": "gpt-4",
  "has_api_key": true
}
```

### Get Custom LLM Provider Status

```
GET /workshops/{workshop_id}/custom-llm-provider

Response: 200 OK
{
  "workshop_id": "uuid",
  "is_configured": true,
  "is_enabled": true,
  "provider_name": "Azure OpenAI",
  "base_url": "https://my-resource.openai.azure.com/...",
  "model_name": "gpt-4",
  "has_api_key": true
}
```

### Delete Custom LLM Provider

```
DELETE /workshops/{workshop_id}/custom-llm-provider

Response: 204 No Content
```

### Test Custom LLM Provider Connection

```
POST /workshops/{workshop_id}/custom-llm-provider/test

Response: 200 OK
{
  "success": true,
  "message": "Successfully connected to Azure OpenAI",
  "response_time_ms": 245
}

Response: 400 Bad Request
{
  "success": false,
  "message": "Authentication failed: Invalid API key",
  "error_code": "AUTH_FAILED"
}
```

## Token Storage

API keys for custom LLM providers follow the same pattern as Databricks tokens:

1. **In-memory storage**: Keys are stored in `TokenStorageService` with workshop-scoped keys
2. **Expiration**: Keys expire after 24 hours (configurable)
3. **No persistence**: Keys are NOT stored in the database
4. **Key format**: Storage key is `custom_llm_{workshop_id}`

```python
# Store custom LLM API key
token_storage.store_token(f"custom_llm_{workshop_id}", api_key)

# Retrieve custom LLM API key
api_key = token_storage.get_token(f"custom_llm_{workshop_id}")
```

## UI Components

### Model Selector Enhancement

The existing model selector in JudgeTuningPage should be enhanced to include custom provider option:

```typescript
interface ModelOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  requiresDatabricks?: boolean;
  isCustomProvider?: boolean;  // NEW: indicates this is a custom provider
}

// Add to getModelOptions()
{
  value: 'custom',
  label: 'Custom Provider',
  description: 'Use configured OpenAI-compatible endpoint',
  disabled: !hasCustomProviderConfig,
  isCustomProvider: true,
}
```

### Custom Provider Configuration Panel

Location: Intake phase or a new "Settings" section in JudgeTuningPage

Fields:
- **Provider Name**: Text input (e.g., "Azure OpenAI", "My vLLM Server")
- **Base URL**: Text input with validation for HTTPS URL
- **API Key**: Password input (masked)
- **Model Name**: Text input (e.g., "gpt-4", "claude-3-sonnet")
- **Test Connection**: Button to verify configuration works

Visual States:
- **Not Configured**: Show configuration form
- **Configured**: Show status with provider name, masked URL, "Reconfigure" button
- **Testing**: Show loading spinner during connection test

### Configuration Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Custom LLM Provider Configuration                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Provider Name:  [Azure OpenAI________________]              │
│                                                              │
│  Base URL:       [https://my-resource.openai.a]              │
│                  Must be a valid HTTPS URL                   │
│                                                              │
│  API Key:        [••••••••••••••••____________]              │
│                                                              │
│  Model Name:     [gpt-4__________________________]           │
│                                                              │
│  [Test Connection]                    [Save Configuration]   │
│                                                              │
│  ✓ Connection successful (245ms)                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Judge Service Integration

Modify `_evaluate_with_mlflow()` in `judge_service.py`:

```python
def _evaluate_with_mlflow(self, workshop_id: str, prompt: JudgePrompt, ...):
    # Check for custom LLM provider first
    custom_config = self.db_service.get_custom_llm_provider_config(workshop_id)

    if custom_config and custom_config.is_enabled:
        # Use custom provider
        api_key = token_storage.get_token(f"custom_llm_{workshop_id}")
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="Custom LLM API key not found. Please reconfigure the provider."
            )

        # Construct proxy_url for MLflow
        proxy_url = self._build_chat_completions_url(custom_config.base_url)

        # Set API key in environment for this request
        os.environ['OPENAI_API_KEY'] = api_key

        metric = make_genai_metric_from_prompt(
            name='workshop_judge',
            judge_prompt=mlflow_prompt_template,
            model=f"openai:/{custom_config.model_name}",
            proxy_url=proxy_url,
            parameters=prompt.model_parameters or {'temperature': 0.0},
        )
    else:
        # Use existing Databricks FMAPI path
        # ... existing code ...
```

### URL Construction

The `base_url` provided by the user may or may not include the `/chat/completions` suffix. The system should handle both cases:

```python
def _build_chat_completions_url(base_url: str) -> str:
    """Ensure URL ends with /chat/completions for OpenAI-compatible endpoints."""
    base_url = base_url.rstrip('/')

    # If URL already ends with /chat/completions, use as-is
    if base_url.endswith('/chat/completions'):
        return base_url

    # If URL ends with /v1, append /chat/completions
    if base_url.endswith('/v1'):
        return f"{base_url}/chat/completions"

    # Otherwise, assume it's a base URL and append full path
    return f"{base_url}/v1/chat/completions"
```

### Connection Testing

The test endpoint should make a minimal API call to verify connectivity:

```python
async def test_custom_llm_connection(config: CustomLLMProviderConfigCreate) -> dict:
    """Test connection to custom LLM provider."""
    import httpx
    import time

    url = _build_chat_completions_url(config.base_url)
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": config.model_name,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 5,
    }

    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response_time_ms = int((time.time() - start_time) * 1000)

            if response.status_code == 200:
                return {
                    "success": True,
                    "message": f"Successfully connected to {config.provider_name}",
                    "response_time_ms": response_time_ms,
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "message": "Authentication failed: Invalid API key",
                    "error_code": "AUTH_FAILED",
                }
            else:
                return {
                    "success": False,
                    "message": f"Request failed with status {response.status_code}",
                    "error_code": "REQUEST_FAILED",
                }
    except httpx.TimeoutException:
        return {
            "success": False,
            "message": "Connection timed out",
            "error_code": "TIMEOUT",
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection error: {str(e)}",
            "error_code": "CONNECTION_ERROR",
        }
```

## Provider-Specific Notes

### Azure OpenAI

Azure OpenAI uses a different URL format:
```
https://{resource-name}.openai.azure.com/openai/deployments/{deployment-name}/chat/completions?api-version={api-version}
```

The system should handle this format. Users should provide the full URL including query parameters.

### vLLM / Local Models

For self-hosted vLLM or similar:
```
http://localhost:8000/v1/chat/completions
```

Note: HTTP (non-HTTPS) may be needed for local development. The UI should warn but allow this.

### Anthropic via OpenAI-Compatible Proxy

Some users may use proxies that translate Anthropic API to OpenAI format. This should work as long as the proxy exposes an OpenAI-compatible `/chat/completions` endpoint.

## Success Criteria

### Configuration
- [ ] Users can configure custom LLM provider via UI
- [ ] Base URL, API key, and model name are captured
- [ ] API key is stored securely in memory (not database)
- [ ] Configuration persists across page refreshes (except API key which requires re-entry after 24h)

### Connection Testing
- [ ] "Test Connection" button verifies endpoint is reachable
- [ ] Clear error messages for common failures (auth, timeout, invalid URL)
- [ ] Response time is displayed on success

### Judge Evaluation
- [ ] When custom provider is enabled, judge evaluation uses the custom endpoint
- [ ] `proxy_url` parameter is correctly passed to MLflow
- [ ] Evaluation results are identical in format to Databricks FMAPI results
- [ ] Errors from custom provider are properly surfaced to UI

### UI/UX
- [ ] Custom provider option appears in model selector when configured
- [ ] Clear indication of which provider is being used
- [ ] Easy to switch between Databricks and custom provider
- [ ] Configuration can be updated without losing other workshop data

## Security Considerations

1. **API Key Storage**: Keys are stored in-memory only, never in the database
2. **HTTPS Enforcement**: UI should warn (but allow) non-HTTPS URLs for local development
3. **Key Expiration**: Keys expire after 24 hours, requiring re-entry
4. **No Key Logging**: API keys must never be logged or included in error messages
5. **Request Scoping**: Custom provider config is scoped to workshop, preventing cross-workshop access

## Future Work

- **Multiple Providers**: Allow multiple custom providers per workshop for A/B testing judges
- **Provider Templates**: Pre-configured templates for common providers (Azure, Anthropic, etc.)
- **Cost Tracking**: Track token usage and estimated costs for custom providers
- **Retry Configuration**: Allow users to configure retry behavior for their endpoints
