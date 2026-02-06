import { useMutation, useQuery } from '@tanstack/react-query';

// Types for Databricks API
export interface DatabricksConfig {
  workspace_url: string;
  token: string;
}

export interface DatabricksEndpointCall {
  endpoint_name: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  model_parameters?: Record<string, any>;
}

export interface DatabricksChatMessage {
  role: string;
  content: string;
}

export interface DatabricksChatCompletion {
  endpoint_name: string;
  messages: DatabricksChatMessage[];
  temperature?: number;
  max_tokens?: number;
  model_parameters?: Record<string, any>;
}

export interface DatabricksResponse {
  success: boolean;
  data?: any;
  error?: string;
  endpoint_name: string;
  timestamp: string;
}

export interface DatabricksEndpointInfo {
  name: string;
  id: string;
  state?: string;
  config?: any;
  creator?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DatabricksConnectionTest {
  status: string;
  workspace_url: string;
  endpoints_count?: number;
  error?: string;
  message: string;
}

// API functions
const testConnection = async (config: DatabricksConfig): Promise<DatabricksConnectionTest> => {
  const response = await fetch('/databricks/test-connection', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error(`Connection test failed: ${response.statusText}`);
  }
  
  return response.json();
};

const listEndpoints = async (config: DatabricksConfig): Promise<DatabricksEndpointInfo[]> => {
  const response = await fetch('/databricks/endpoints', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to list endpoints: ${response.statusText}`);
  }
  
  return response.json();
};

const getEndpointInfo = async (endpointName: string, config: DatabricksConfig): Promise<DatabricksEndpointInfo> => {
  const response = await fetch(`/databricks/endpoints/${endpointName}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get endpoint info: ${response.statusText}`);
  }
  
  return response.json();
};

const callEndpoint = async (request: DatabricksEndpointCall, config: DatabricksConfig): Promise<DatabricksResponse> => {
  const response = await fetch('/databricks/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request, config }),
  });
  
  if (!response.ok) {
    throw new Error(`Endpoint call failed: ${response.statusText}`);
  }
  
  return response.json();
};

const callChatCompletion = async (request: DatabricksChatCompletion, config: DatabricksConfig): Promise<DatabricksResponse> => {
  const response = await fetch('/databricks/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ request, config }),
  });
  
  if (!response.ok) {
    throw new Error(`Chat completion failed: ${response.statusText}`);
  }
  
  return response.json();
};

const simpleCall = async (
  endpointName: string,
  prompt: string,
  config: DatabricksConfig,
  temperature: number = 0.5,
  maxTokens?: number
): Promise<DatabricksResponse> => {
  const response = await fetch('/databricks/simple-call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      endpoint_name: endpointName,
      prompt,
      temperature,
      max_tokens: maxTokens,
      workspace_url: config.workspace_url,
      token: config.token,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Simple call failed: ${response.statusText}`);
  }
  
  return response.json();
};

// React Query hooks
export const useTestDatabricksConnection = () => {
  return useMutation({
    mutationFn: testConnection,
    onError: (error) => {
      
    },
  });
};

export const useListDatabricksEndpoints = (config: DatabricksConfig | null) => {
  return useQuery({
    queryKey: ['databricks', 'endpoints', config?.workspace_url, config],
    queryFn: () => listEndpoints(config!),
    enabled: !!config,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useGetDatabricksEndpointInfo = (endpointName: string, config: DatabricksConfig | null) => {
  return useQuery({
    queryKey: ['databricks', 'endpoint', endpointName, config?.workspace_url, config],
    queryFn: () => getEndpointInfo(endpointName, config!),
    enabled: !!config && !!endpointName,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

export const useCallDatabricksEndpoint = () => {
  return useMutation({
    mutationFn: ({ request, config }: { request: DatabricksEndpointCall; config: DatabricksConfig }) =>
      callEndpoint(request, config),
    onError: (error) => {
      
    },
  });
};

export const useCallDatabricksChat = () => {
  return useMutation({
    mutationFn: ({ request, config }: { request: DatabricksChatCompletion; config: DatabricksConfig }) =>
      callChatCompletion(request, config),
    onError: (error) => {
      
    },
  });
};

export const useSimpleDatabricksCall = () => {
  return useMutation({
    mutationFn: ({
      endpointName,
      prompt,
      config,
      temperature,
      maxTokens,
    }: {
      endpointName: string;
      prompt: string;
      config: DatabricksConfig;
      temperature?: number;
      maxTokens?: number;
    }) => simpleCall(endpointName, prompt, config, temperature, maxTokens),
    onError: (error) => {
      
    },
  });
};

// Judge evaluation call
const judgeEvaluate = async ({
  endpointName,
  prompt,
  config,
  workshop_id,
  temperature = 0.0,
  maxTokens = 10
}: {
  endpointName: string;
  prompt: string;
  config: DatabricksConfig;
  workshop_id?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<DatabricksResponse> => {
  const response = await fetch('/databricks/judge-evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint_name: endpointName,
      prompt: prompt,
      config: config,
      workshop_id: workshop_id,
      temperature: temperature,
      max_tokens: maxTokens
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
};

export const useJudgeEvaluate = () => {
  return useMutation({
    mutationFn: judgeEvaluate,
    onSuccess: (data) => {
      
    },
    onError: (error) => {
      
    },
  });
};
