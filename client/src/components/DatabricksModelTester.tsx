import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  Play, 
  TestTube, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Zap,
  Database,
  Settings,
  MessageSquare,
  FileText
} from 'lucide-react';
import { toast } from 'sonner';
import { getModelOptions, getBackendModelName } from '@/utils/modelMapping';
import {
  useTestDatabricksConnection,
  useListDatabricksEndpoints,
  useCallDatabricksEndpoint,
  useCallDatabricksChat,
  useSimpleDatabricksCall,
  type DatabricksConfig,
  type DatabricksEndpointCall,
  type DatabricksChatCompletion,
  type DatabricksChatMessage
} from '@/hooks/useDatabricksApi';

export const DatabricksModelTester: React.FC = () => {
  // Configuration state
  const [config, setConfig] = useState<DatabricksConfig>({
    workspace_url: '',
    token: ''
  });

  // Connection state
  const [isConnected, setIsConnected] = useState(false);

  // Endpoint selection
  const [selectedEndpoint, setSelectedEndpoint] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('Claude 3.7 Sonnet');

  // Prompt state
  const [prompt, setPrompt] = useState<string>('Generate a recipe for building scalable Databricks Apps.');
  const [temperature, setTemperature] = useState<number>(0.5);
  const [maxTokens, setMaxTokens] = useState<number>(256);

  // Chat state
  const [messages, setMessages] = useState<DatabricksChatMessage[]>([
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Hello, how can you help me?' }
  ]);
  const [newMessage, setNewMessage] = useState<string>('');

  // Response state
  const [response, setResponse] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // API hooks
  const testConnection = useTestDatabricksConnection();
  const listEndpoints = useListDatabricksEndpoints(isConnected ? config : null);
  const callEndpoint = useCallDatabricksEndpoint();
  const callChat = useCallDatabricksChat();
  const simpleCall = useSimpleDatabricksCall();

  // Test connection
  const handleTestConnection = async () => {
    if (!config.workspace_url || !config.token) {
      toast.error('Please provide both workspace URL and token');
      return;
    }

    try {
      const result = await testConnection.mutateAsync(config);
      if (result.status === 'connected') {
        setIsConnected(true);
        toast.success('Successfully connected to Databricks workspace!');
      } else {
        toast.error(`Connection failed: ${result.message}`);
      }
    } catch (error) {
      toast.error(`Connection test failed: ${String(error)}`);
    }
  };

  // Call endpoint
  const handleCallEndpoint = async () => {
    if (!selectedModel || !prompt.trim()) {
      toast.error('Please select a model and enter a prompt');
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const request: DatabricksEndpointCall = {
        endpoint_name: getBackendModelName(selectedModel),
        prompt: prompt,
        temperature: temperature,
        max_tokens: maxTokens
      };

      const result = await callEndpoint.mutateAsync({ request, config });
      
      if (result.success) {
        setResponse(result.data);
        toast.success('Successfully called Databricks endpoint!');
      } else {
        toast.error(`Endpoint call failed: ${result.error}`);
      }
    } catch (error) {
      toast.error(`Failed to call endpoint: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Simple call (like the Streamlit example)
  const handleSimpleCall = async () => {
    if (!selectedModel || !prompt.trim()) {
      toast.error('Please select a model and enter a prompt');
      return;
    }

    setIsLoading(true);
    setResponse(null);

    try {
      const result = await simpleCall.mutateAsync({
        endpointName: getBackendModelName(selectedModel),
        prompt: prompt,
        config: config,
        temperature: temperature,
        maxTokens: maxTokens
      });

      if (result.success) {
        setResponse(result.data);
        toast.success('Successfully called Databricks endpoint!');
      } else {
        toast.error(`Endpoint call failed: ${result.error}`);
      }
    } catch (error) {
      toast.error(`Failed to call endpoint: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Add chat message
  const handleAddMessage = () => {
    if (!newMessage.trim()) return;

    const updatedMessages = [...messages, { role: 'user', content: newMessage }];
    setMessages(updatedMessages);
    setNewMessage('');
  };

  // Call chat completion
  const handleChatCompletion = async () => {
    if (!selectedModel || messages.length === 0) {
      toast.error('Please select a model and add messages');
      return;
    }

    setIsLoading(true);

    try {
      const request: DatabricksChatCompletion = {
        endpoint_name: getBackendModelName(selectedModel),
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
      };

      const result = await callChat.mutateAsync({ request, config });
      
      if (result.success) {
        // Add assistant response to messages
        const assistantMessage = result.data?.choices?.[0]?.message?.content || 'No response received';
        setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
        setResponse(result.data);
        toast.success('Chat completion successful!');
      } else {
        toast.error(`Chat completion failed: ${result.error}`);
      }
    } catch (error) {
      toast.error(`Failed to complete chat: ${String(error)}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Database className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Databricks Model Tester</h1>
          </div>
          <p className="text-gray-600">
            Test and interact with Databricks model serving endpoints using the Databricks SDK.
          </p>
        </div>

        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Databricks Configuration
            </CardTitle>
            <CardDescription>
              Configure your Databricks workspace connection
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="workspace-url">Workspace URL</Label>
                <Input
                  id="workspace-url"
                  type="url"
                  placeholder="https://adb-1234567890123456.7.azuredatabricks.net"
                  value={config.workspace_url}
                  onChange={(e) => setConfig(prev => ({ ...prev, workspace_url: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="token">API Token</Label>
                <Input
                  id="token"
                  type="password"
                  placeholder="Enter your Databricks API token"
                  value={config.token}
                  onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button
                onClick={handleTestConnection}
                disabled={testConnection.isPending || !config.workspace_url || !config.token}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {testConnection.isPending ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  <>
                    <TestTube className="mr-2 h-4 w-4" />
                    Test Connection
                  </>
                )}
              </Button>
              
              {isConnected && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Connected</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Endpoint Selection */}
        {isConnected && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Endpoint Selection
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="endpoint">Select Serving Endpoint</Label>
                  <Select value={selectedEndpoint} onValueChange={setSelectedEndpoint}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an endpoint" />
                    </SelectTrigger>
                    <SelectContent>
                      {listEndpoints.data?.map((endpoint) => (
                        <SelectItem key={endpoint.id} value={endpoint.name}>
                          <div className="flex items-center gap-2">
                            <span>{endpoint.name}</span>
                            <Badge variant={endpoint.state === 'READY' ? 'default' : 'secondary'}>
                              {endpoint.state || 'Unknown'}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {listEndpoints.isLoading && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Clock className="h-4 w-4 animate-spin" />
                    Loading endpoints...
                  </div>
                )}
                
                {listEndpoints.error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Failed to load endpoints: {listEndpoints.error.message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Model Testing Interface */}
        {isConnected && selectedEndpoint && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Model Testing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="prompt" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="prompt">Prompt Completion</TabsTrigger>
                  <TabsTrigger value="chat">Chat Completion</TabsTrigger>
                </TabsList>

                {/* Prompt Completion Tab */}
                <TabsContent value="prompt" className="space-y-4">
                  <div>
                    <Label htmlFor="model">Model</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {getModelOptions(true).map((option) => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value}
                            disabled={option.disabled}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{option.label}</span>
                              {option.description && (
                                <span className="text-xs text-gray-500 ml-2">({option.description})</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="temperature">Temperature</Label>
                      <Input
                        id="temperature"
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="max-tokens">Max Tokens</Label>
                      <Input
                        id="max-tokens"
                        type="number"
                        min="1"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="prompt">Prompt</Label>
                    <Textarea
                      id="prompt"
                      placeholder="Enter your prompt here..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="min-h-[100px]"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleCallEndpoint}
                      disabled={isLoading || !prompt.trim()}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isLoading ? (
                        <>
                          <Clock className="mr-2 h-4 w-4 animate-spin" />
                          Calling...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          Call Endpoint
                        </>
                      )}
                    </Button>
                    
                    <Button
                      onClick={handleSimpleCall}
                      disabled={isLoading || !prompt.trim()}
                      variant="outline"
                    >
                      {isLoading ? (
                        <>
                          <Clock className="mr-2 h-4 w-4 animate-spin" />
                          Calling...
                        </>
                      ) : (
                        <>
                          <FileText className="mr-2 h-4 w-4" />
                          Simple Call
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>

                {/* Chat Completion Tab */}
                <TabsContent value="chat" className="space-y-4">
                  <div>
                    <Label htmlFor="chat-model">Model</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {getModelOptions(true).map((option) => (
                          <SelectItem 
                            key={option.value} 
                            value={option.value}
                            disabled={option.disabled}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span>{option.label}</span>
                              {option.description && (
                                <span className="text-xs text-gray-500 ml-2">({option.description})</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="chat-temperature">Temperature</Label>
                      <Input
                        id="chat-temperature"
                        type="number"
                        min="0"
                        max="1"
                        step="0.1"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="chat-max-tokens">Max Tokens</Label>
                      <Input
                        id="chat-max-tokens"
                        type="number"
                        min="1"
                        value={maxTokens}
                        onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                      />
                    </div>
                  </div>

                  {/* Chat Messages */}
                  <div className="space-y-2">
                    <Label>Chat Messages</Label>
                    <div className="border rounded-lg p-4 max-h-60 overflow-y-auto space-y-2">
                      {messages.map((message, index) => (
                        <div
                          key={index}
                          className={`p-2 rounded ${
                            message.role === 'user' 
                              ? 'bg-blue-50 text-blue-900' 
                              : 'bg-gray-50 text-gray-900'
                          }`}
                        >
                          <div className="text-xs font-medium mb-1">
                            {message.role === 'user' ? '👤 User' : '🤖 Assistant'}
                          </div>
                          <div className="text-sm">{message.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Add New Message */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Type your message..."
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddMessage()}
                    />
                    <Button onClick={handleAddMessage} disabled={!newMessage.trim()}>
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    onClick={handleChatCompletion}
                    disabled={isLoading || messages.length === 0}
                  >
                    {isLoading ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" />
                        Completing...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Complete Chat
                      </>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}

        {/* Response Display */}
        {response && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Response
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(response, null, 2)}
                </pre>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
