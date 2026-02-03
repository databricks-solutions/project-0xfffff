// @spec UI_COMPONENTS_SPEC
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TraceDataViewer } from './TraceDataViewer';

// Mock clipboard API
const mockClipboardWrite = vi.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockClipboardWrite,
  },
});

// Mock URL.createObjectURL and revokeObjectURL for download tests
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();
Object.assign(window, {
  URL: {
    createObjectURL: mockCreateObjectURL,
    revokeObjectURL: mockRevokeObjectURL,
  },
});

describe('@spec:UI_COMPONENTS_SPEC TraceDataViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic rendering', () => {
    it('renders with valid JSON output', () => {
      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"query": "Hello"}',
            output: '{"response": "World"}',
          }}
        />
      );

      expect(screen.getByText('Trace Data Viewer')).toBeInTheDocument();
      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Output')).toBeInTheDocument();
    });

    it('renders error state for invalid JSON output', () => {
      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"query": "Hello"}',
            output: 'not valid json',
          }}
        />
      );

      expect(screen.getByText('Unable to parse trace output')).toBeInTheDocument();
    });

    it('displays MLflow trace ID badge when provided', () => {
      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"query": "Hello"}',
            output: '{"response": "World"}',
            mlflow_trace_id: 'mlflow-12345678-abcd',
          }}
        />
      );

      expect(screen.getByText('MLflow: mlflow-1...')).toBeInTheDocument();
    });

    it('shows context section when showContext is true and context exists', () => {
      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"query": "Hello"}',
            output: '{"response": "World"}',
            context: { source: 'test', metadata: { key: 'value' } },
          }}
          showContext={true}
        />
      );

      expect(screen.getByText('Context')).toBeInTheDocument();
    });

    it('hides context section when showContext is false', () => {
      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"query": "Hello"}',
            output: '{"response": "World"}',
            context: { source: 'test' },
          }}
          showContext={false}
        />
      );

      expect(screen.queryByText('Context')).not.toBeInTheDocument();
    });
  });

  describe('LLM content extraction - OpenAI format', () => {
    it('extracts content from OpenAI chat completion format', () => {
      const openAIResponse = JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'gpt-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello, I am an AI assistant.',
            },
            finish_reason: 'stop',
          },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"messages": [{"role": "user", "content": "Hello"}]}',
            output: openAIResponse,
          }}
        />
      );

      // Should show Response tab (LLM content detected)
      expect(screen.getByText('Response')).toBeInTheDocument();
      expect(screen.getByText('Hello, I am an AI assistant.')).toBeInTheDocument();
    });

    it('extracts content from text completion format', () => {
      const textCompletion = JSON.stringify({
        choices: [
          {
            text: 'This is a text completion response.',
            finish_reason: 'stop',
          },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"prompt": "Hello"}',
            output: textCompletion,
          }}
        />
      );

      expect(screen.getByText('This is a text completion response.')).toBeInTheDocument();
    });
  });

  describe('LLM content extraction - Anthropic format', () => {
    it('extracts content from Anthropic Claude format', () => {
      const anthropicResponse = JSON.stringify({
        id: 'msg-123',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Hello from Claude!',
          },
        ],
        model: 'claude-3',
        stop_reason: 'end_turn',
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"messages": []}',
            output: anthropicResponse,
          }}
        />
      );

      expect(screen.getByText('Hello from Claude!')).toBeInTheDocument();
    });

    it('concatenates multiple text blocks', () => {
      const multiBlockResponse = JSON.stringify({
        content: [
          { type: 'text', text: 'First paragraph.' },
          { type: 'text', text: 'Second paragraph.' },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: multiBlockResponse,
          }}
        />
      );

      // Both paragraphs should be joined
      expect(screen.getByText(/First paragraph/)).toBeInTheDocument();
      expect(screen.getByText(/Second paragraph/)).toBeInTheDocument();
    });
  });

  describe('LLM content extraction - Judge format', () => {
    it('extracts rationale from judge evaluation output', () => {
      const judgeResponse = JSON.stringify({
        choices: [
          {
            result: 4,
            rationale: 'The response is accurate and helpful.',
          },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: judgeResponse,
          }}
        />
      );

      expect(screen.getByText(/Rating: 4/)).toBeInTheDocument();
      expect(screen.getByText(/The response is accurate and helpful./)).toBeInTheDocument();
    });

    it('extracts JSON-encoded judge result from message content', () => {
      const judgeInMessage = JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                result: 1,
                rationale: 'Excellent response!',
              }),
            },
          },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: judgeInMessage,
          }}
        />
      );

      expect(screen.getByText(/Rating: 1/)).toBeInTheDocument();
      expect(screen.getByText(/Excellent response!/)).toBeInTheDocument();
    });
  });

  describe('Data table format (SQL results)', () => {
    it('renders result array as table when clicking Data Table tab', async () => {
      const user = userEvent.setup();
      const sqlResult = JSON.stringify({
        result: [
          { name: 'Alice', age: 30 },
          { name: 'Bob', age: 25 },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: sqlResult,
          }}
        />
      );

      // Data Table tab should be present
      expect(screen.getByText('Data Table')).toBeInTheDocument();

      // Click on Data Table tab to see content
      await user.click(screen.getByText('Data Table'));

      // Now the table content should be visible
      expect(screen.getByText('2 rows × 2 columns')).toBeInTheDocument();
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.getByText('Bob')).toBeInTheDocument();
    });

    it('shows Download CSV button when Data Table tab is active', async () => {
      const user = userEvent.setup();
      const sqlResult = JSON.stringify({
        result: [{ name: 'Alice', age: 30 }],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: sqlResult,
          }}
        />
      );

      // Click Data Table tab to activate it
      await user.click(screen.getByText('Data Table'));

      expect(screen.getByText('Download CSV')).toBeInTheDocument();
    });
  });

  describe('SQL query formatting', () => {
    it('displays SQL query with formatting', () => {
      const sqlOutput = JSON.stringify({
        result: [{ count: 10 }],
        query_text: 'SELECT COUNT(*) FROM users WHERE active = 1',
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: sqlOutput,
          }}
        />
      );

      expect(screen.getByText('SQL Query')).toBeInTheDocument();
      // Query should be displayed (formatted with line breaks)
      expect(screen.getByText(/SELECT/)).toBeInTheDocument();
    });

    it('shows Download SQL button when query_text exists', () => {
      const sqlOutput = JSON.stringify({
        result: [],
        query_text: 'SELECT * FROM users',
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: sqlOutput,
          }}
        />
      );

      expect(screen.getByText('Download SQL')).toBeInTheDocument();
    });
  });

  describe('Copy to clipboard', () => {
    it('has Copy buttons for input and output sections', () => {
      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{"query": "test"}',
            output: '{"result": "ok"}',
          }}
        />
      );

      // Find Copy buttons - there should be at least one for input
      const copyButtons = screen.getAllByText('Copy');
      expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Tab switching', () => {
    it('switches between Response and Raw JSON tabs for LLM content', async () => {
      const user = userEvent.setup();
      const openAIResponse = JSON.stringify({
        choices: [
          {
            message: {
              content: 'Test response',
            },
          },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: openAIResponse,
          }}
        />
      );

      // Initially on Response tab
      expect(screen.getByText('Test response')).toBeInTheDocument();

      // Click Raw JSON tab
      await user.click(screen.getByText('Raw JSON'));

      // Should show raw JSON structure
      expect(screen.getByText(/choices/)).toBeInTheDocument();
    });

    it('switches between Data Table and Raw JSON tabs for SQL results', async () => {
      const user = userEvent.setup();
      const sqlResult = JSON.stringify({
        result: [{ name: 'Alice' }],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: sqlResult,
          }}
        />
      );

      // Click Data Table tab first to see table content
      await user.click(screen.getByText('Data Table'));
      expect(screen.getByText('Alice')).toBeInTheDocument();

      // Click Raw JSON tab
      await user.click(screen.getByText('Raw JSON'));

      // Should show raw JSON (the result key)
      expect(screen.getByText(/result/)).toBeInTheDocument();
    });
  });

  describe('Fallback display', () => {
    it('shows raw JSON when no LLM content or table data detected', () => {
      const plainJson = JSON.stringify({
        custom: 'data',
        nested: { key: 'value' },
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: plainJson,
          }}
        />
      );

      // Should render as raw JSON without tabs
      expect(screen.getByText(/custom/)).toBeInTheDocument();
      expect(screen.queryByText('Response')).not.toBeInTheDocument();
      expect(screen.queryByText('Data Table')).not.toBeInTheDocument();
    });

    it('handles double-stringified JSON', () => {
      // JSON that's been stringified twice
      const doubleStringified = JSON.stringify(JSON.stringify({ message: 'hello' }));

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: doubleStringified,
          }}
        />
      );

      // Should parse correctly
      expect(screen.getByText(/message/)).toBeInTheDocument();
    });
  });

  describe('Response metadata', () => {
    it('shows collapsible metadata section for LLM responses', () => {
      const responseWithMetadata = JSON.stringify({
        id: 'chatcmpl-123',
        model: 'gpt-4',
        object: 'chat.completion',
        choices: [
          {
            message: { content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: { total_tokens: 50 },
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: responseWithMetadata,
          }}
        />
      );

      // Should show Response Metadata summary
      expect(screen.getByText('Response Metadata')).toBeInTheDocument();
    });
  });

  describe('Edge cases', () => {
    it('handles empty result array', () => {
      const emptyResult = JSON.stringify({
        result: [],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: emptyResult,
          }}
        />
      );

      // Should still render without errors
      expect(screen.getByText('Trace Data Viewer')).toBeInTheDocument();
    });

    it('handles messages array format', () => {
      const messagesFormat = JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: messagesFormat,
          }}
        />
      );

      expect(screen.getByText('Hi there!')).toBeInTheDocument();
    });

    it('handles Databricks agent response format', () => {
      const databricksFormat = JSON.stringify({
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Databricks response' }],
          },
        ],
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: databricksFormat,
          }}
        />
      );

      expect(screen.getByText('Databricks response')).toBeInTheDocument();
    });

    it('handles flattened chat completion format', () => {
      const flattenedFormat = JSON.stringify({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        model: 'gpt-4',
        role: 'assistant',
        content: 'Flattened response content',
        finish_reason: 'stop',
      });

      render(
        <TraceDataViewer
          trace={{
            id: 'test-1',
            input: '{}',
            output: flattenedFormat,
          }}
        />
      );

      expect(screen.getByText('Flattened response content')).toBeInTheDocument();
    });
  });
});
