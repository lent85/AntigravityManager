import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  buildOpenAiPayload,
  generateCurlCommand,
  executeClientToolsRequest,
} from '@/modules/client-tools/services/client-tools-runner';
import { getMockToolResponse } from '@/modules/client-tools/presets/default-tools';
import type { ChatMessage, ClientToolsConfig, ToolDefinition } from '@/modules/client-tools/types';

describe('client-tools-runner', () => {
  const sampleTools: ToolDefinition[] = [
    {
      id: 'tool_1',
      enabled: true,
      name: 'get_current_weather',
      description: 'Get weather in location',
      parametersJson: JSON.stringify({
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location'],
      }),
    },
    {
      id: 'tool_2',
      enabled: false,
      name: 'disabled_tool',
      description: 'Should not appear in payload',
      parametersJson: '{}',
    },
  ];

  const sampleConfig: ClientToolsConfig = {
    apiKey: 'sk-test-key-12345',
    keyId: 'Default Client',
    baseUrl: 'http://127.0.0.1:8045',
    model: 'gemini-2.5-flash',
    protocol: 'openai',
    stream: false,
    temperature: 0.8,
    maxTokens: 1024,
    systemPrompt: 'You are a test assistant.',
    jsonMode: true,
    tools: sampleTools,
  };

  describe('buildOpenAiPayload', () => {
    it('constructs payload with system prompt, messages, and enabled tools only', () => {
      const messages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: "What's the weather in Tokyo?",
          timestamp: 1000,
        },
        {
          id: '2',
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_999',
              type: 'function',
              function: { name: 'get_current_weather', arguments: '{"location":"Tokyo"}' },
            },
          ],
          timestamp: 2000,
        },
        {
          id: '3',
          role: 'tool',
          name: 'get_current_weather',
          tool_call_id: 'call_999',
          content: '{"temperature": 20}',
          timestamp: 3000,
        },
      ];

      const payload = buildOpenAiPayload(sampleConfig, messages);

      expect(payload.model).toBe('gemini-2.5-flash');
      expect(payload.temperature).toBe(0.8);
      expect(payload.max_tokens).toBe(1024);
      expect(payload.stream).toBe(false);
      expect(payload.response_format).toEqual({ type: 'json_object' });

      const msgs = payload.messages as Array<Record<string, unknown>>;
      expect(msgs).toHaveLength(4);
      expect(msgs[0]).toEqual({ role: 'system', content: 'You are a test assistant.' });
      expect(msgs[1]).toEqual({ role: 'user', content: "What's the weather in Tokyo?" });
      expect(msgs[2]).toEqual({
        role: 'assistant',
        content: null,
        tool_calls: messages[1]?.tool_calls,
      });
      expect(msgs[3]).toEqual({
        role: 'tool',
        tool_call_id: 'call_999',
        name: 'get_current_weather',
        content: '{"temperature": 20}',
      });

      const tools = payload.tools as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'get_current_weather',
          description: 'Get weather in location',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        },
      });
    });
  });

  describe('generateCurlCommand', () => {
    it('generates well-formatted curl command with auth header and body', () => {
      const curl = generateCurlCommand('http://127.0.0.1:8045/v1/chat/completions', 'sk-my-key', {
        model: 'gemini-2.5-flash',
      });

      expect(curl).toContain('curl -X POST "http://127.0.0.1:8045/v1/chat/completions"');
      expect(curl).toContain('-H "Authorization: Bearer sk-my-key"');
      expect(curl).toContain('-H "X-Client-App: Antigravity-ClientTools/1.0"');
      expect(curl).toContain('"model": "gemini-2.5-flash"');
    });
  });

  describe('getMockToolResponse', () => {
    it('generates simulated weather result', () => {
      const res = getMockToolResponse('get_current_weather', { location: 'Tokyo', unit: 'celsius' });
      const parsed = JSON.parse(res) as Record<string, unknown>;
      expect(parsed.location).toBe('Tokyo');
      expect(parsed.unit).toBe('celsius');
      expect(parsed.condition).toBeDefined();
    });

    it('evaluates math expression safely', () => {
      const res = getMockToolResponse('calculator', { expression: '10 + 20 * 2' });
      const parsed = JSON.parse(res) as Record<string, unknown>;
      expect(parsed.result).toBe(50);
      expect(parsed.status).toBe('success');
    });

    it('returns structured search results', () => {
      const res = getMockToolResponse('search_web', { query: 'NextJS AI' });
      const parsed = JSON.parse(res) as Record<string, unknown>;
      expect(parsed.query).toBe('NextJS AI');
      expect(Array.isArray(parsed.results)).toBe(true);
    });
  });

  describe('executeClientToolsRequest', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('handles successful chat completion with tool calls and usage tokens', async () => {
      const mockResponseBody = {
        id: 'chatcmpl-test-123',
        object: 'chat.completion',
        created: 1727170000,
        model: 'gemini-2.5-flash',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Let me check that weather for you.',
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'get_current_weather',
                    arguments: '{"location":"Tokyo"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 42,
          completion_tokens: 18,
          total_tokens: 60,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify(mockResponseBody),
      });

      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: "What's the weather in Tokyo?", timestamp: 100 },
      ];

      const res = await executeClientToolsRequest(sampleConfig, messages);

      expect(res.content).toBe('Let me check that weather for you.');
      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls?.[0]?.function.name).toBe('get_current_weather');
      expect(res.result.metrics.status).toBe(200);
      expect(res.result.metrics.promptTokens).toBe(42);
      expect(res.result.metrics.completionTokens).toBe(18);
      expect(res.result.metrics.totalTokens).toBe(60);
    });

    it('rejects with error details on HTTP 401 Unauthorized', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: { message: 'API key validation failed' } }),
      });

      const messages: ChatMessage[] = [
        { id: '1', role: 'user', content: 'Hello', timestamp: 100 },
      ];

      await expect(executeClientToolsRequest(sampleConfig, messages)).rejects.toMatchObject({
        message: 'API key validation failed',
        result: {
          metrics: {
            status: 401,
            statusText: 'Unauthorized',
          },
        },
      });
    });
  });
});
