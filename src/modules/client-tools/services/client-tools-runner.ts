import type {
  ChatMessage,
  ClientToolsConfig,
  ExecutionResult,
  RequestMetrics,
  ToolCallItem,
} from '../types';

export interface RunnerStreamCallbacks {
  onChunk: (delta: { contentChunk?: string; thinkingChunk?: string }) => void;
}

export function buildOpenAiPayload(config: ClientToolsConfig, messages: ChatMessage[]): Record<string, unknown> {
  const formattedMessages: Array<Record<string, unknown>> = [];

  if (config.systemPrompt.trim()) {
    formattedMessages.push({
      role: 'system',
      content: config.systemPrompt.trim(),
    });
  }

  for (const msg of messages) {
    if (msg.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        tool_call_id: msg.tool_call_id || '',
        name: msg.name || 'tool_response',
        content: msg.content,
      });
    } else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      formattedMessages.push({
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.tool_calls,
      });
    } else {
      formattedMessages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  const payload: Record<string, unknown> = {
    model: config.model,
    messages: formattedMessages,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    stream: config.stream,
  };

  if (config.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const enabledTools = config.tools.filter((t) => t.enabled);
  if (enabledTools.length > 0) {
    payload.tools = enabledTools.map((t) => {
      let params: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(t.parametersJson);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          params = parsed as Record<string, unknown>;
        }
      } catch {
        params = { type: 'object', properties: {} };
      }
      return {
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: params,
        },
      };
    });
  }

  return payload;
}

export function generateCurlCommand(
  url: string,
  apiKey: string,
  payload: Record<string, unknown>,
): string {
  const headerParts = [
    `curl -X POST "${url}"`,
    `-H "Content-Type: application/json"`,
    `-H "X-Client-App: Antigravity-ClientTools/1.0"`,
  ];

  if (apiKey.trim()) {
    headerParts.push(`-H "Authorization: Bearer ${apiKey.trim()}"`);
  }

  const jsonStr = JSON.stringify(payload, null, 2);
  const escapedData = jsonStr.replace(/'/g, `'\\''`);
  headerParts.push(`-d '${escapedData}'`);

  return headerParts.join(' \\\n  ');
}

function parseUsage(raw: unknown): { promptTokens: number; completionTokens: number; totalTokens: number } {
  if (typeof raw === 'object' && raw !== null && 'usage' in raw) {
    const usage = (raw as Record<string, unknown>).usage;
    if (typeof usage === 'object' && usage !== null) {
      const u = usage as Record<string, unknown>;
      const promptTokens = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0;
      const completionTokens = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0;
      const totalTokens = typeof u.total_tokens === 'number' ? u.total_tokens : promptTokens + completionTokens;
      return { promptTokens, completionTokens, totalTokens };
    }
  }
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

export async function executeClientToolsRequest(
  config: ClientToolsConfig,
  messages: ChatMessage[],
  callbacks?: RunnerStreamCallbacks,
): Promise<{
  content: string;
  toolCalls?: ToolCallItem[];
  thinking?: string;
  result: ExecutionResult;
}> {
  const cleanBaseUrl = config.baseUrl.replace(/\/+$/, '');
  const endpoint = `${cleanBaseUrl}/v1/chat/completions`;
  const payload = buildOpenAiPayload(config, messages);
  const curlCommand = generateCurlCommand(endpoint, config.apiKey, payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-App': 'Antigravity-ClientTools/1.0',
    Accept: config.stream ? 'text/event-stream' : 'application/json',
  };

  if (config.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`;
  }

  const startTime = Date.now();
  let timeToFirstTokenMs: number | undefined;

  // type-boundary: allow no-native-fetch owner=client-tools issue=#playground expires=2099-01-01 reason=Browser HTTP client requires fetch to stream SSE and send external-client requests to proxy gateway
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status} ${response.statusText}`;
    let rawErrorJson: unknown = null;
    try {
      const parsedText = await response.text();
      try {
        rawErrorJson = JSON.parse(parsedText);
        if (typeof rawErrorJson === 'object' && rawErrorJson !== null && 'error' in rawErrorJson) {
          const errObj = (rawErrorJson as Record<string, unknown>).error;
          if (typeof errObj === 'object' && errObj !== null && 'message' in errObj) {
            errorDetail = String((errObj as Record<string, unknown>).message);
          }
        }
      } catch {
        errorDetail = parsedText || errorDetail;
      }
    } catch {
      // keep fallback
    }

    const metrics: RequestMetrics = {
      status: response.status,
      statusText: response.statusText,
      durationMs,
      keyName: config.keyId || 'Custom',
      model: config.model,
      timestamp: Date.now(),
    };

    throw {
      message: errorDetail,
      result: {
        metrics,
        rawResponse: rawErrorJson ?? { error: errorDetail },
        requestPayload: payload,
        curlCommand,
      },
    };
  }

  if (!config.stream || !response.body) {
    const responseText = await response.text();
    let rawJson: unknown = {};
    try {
      rawJson = JSON.parse(responseText);
    } catch {
      rawJson = { raw: responseText };
    }

    const usage = parseUsage(rawJson);
    const metrics: RequestMetrics = {
      status: response.status,
      statusText: response.statusText,
      durationMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      keyName: config.keyId || 'Custom',
      model: config.model,
      timestamp: Date.now(),
    };

    let assistantContent = '';
    let toolCalls: ToolCallItem[] | undefined;
    let thinking: string | undefined;

    if (typeof rawJson === 'object' && rawJson !== null && 'choices' in rawJson) {
      const choices = (rawJson as Record<string, unknown>).choices;
      if (Array.isArray(choices) && choices.length > 0) {
        const firstChoice = choices[0] as Record<string, unknown>;
        const message = firstChoice.message as Record<string, unknown> | undefined;
        if (message) {
          if (typeof message.content === 'string') {
            assistantContent = message.content;
          }
          if (typeof message.reasoning_content === 'string') {
            thinking = message.reasoning_content;
          }
          if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
            toolCalls = message.tool_calls as ToolCallItem[];
          }
        }
      }
    }

    // Check for inline <thought> tags if reasoning_content was not separately populated
    if (!thinking && assistantContent.includes('<thought>') && assistantContent.includes('</thought>')) {
      const match = assistantContent.match(/<thought>([\s\S]*?)<\/thought>/);
      if (match && match[1]) {
        thinking = match[1].trim();
        assistantContent = assistantContent.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
      }
    }

    return {
      content: assistantContent,
      toolCalls,
      thinking,
      result: {
        metrics,
        rawResponse: rawJson,
        requestPayload: payload,
        curlCommand,
      },
    };
  }

  // Handle SSE streaming
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let accumulatedContent = '';
  let accumulatedThinking = '';
  const accumulatedToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
  const receivedChunks: unknown[] = [];

  let buffer = '';
  let isDone = false;

  while (!isDone) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (timeToFirstTokenMs === undefined) {
      timeToFirstTokenMs = Date.now() - startTime;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) {
        continue;
      }

      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') {
        isDone = true;
        break;
      }

      try {
        const parsedChunk: unknown = JSON.parse(dataStr);
        receivedChunks.push(parsedChunk);

        if (typeof parsedChunk === 'object' && parsedChunk !== null && 'choices' in parsedChunk) {
          const choices = (parsedChunk as Record<string, unknown>).choices;
          if (Array.isArray(choices) && choices.length > 0) {
            const first = choices[0] as Record<string, unknown>;
            const delta = first.delta as Record<string, unknown> | undefined;
            if (delta) {
              let contentChunk = '';
              let thinkingChunk = '';

              if (typeof delta.content === 'string') {
                contentChunk = delta.content;
                accumulatedContent += contentChunk;
              }

              if (typeof delta.reasoning_content === 'string') {
                thinkingChunk = delta.reasoning_content;
                accumulatedThinking += thinkingChunk;
              }

              if (Array.isArray(delta.tool_calls)) {
                for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                  const idx = typeof tc.index === 'number' ? tc.index : 0;
                  const current = accumulatedToolCalls.get(idx) || { id: '', name: '', args: '' };
                  if (typeof tc.id === 'string') current.id = tc.id;
                  const fn = tc.function as Record<string, unknown> | undefined;
                  if (fn) {
                    if (typeof fn.name === 'string') current.name += fn.name;
                    if (typeof fn.arguments === 'string') current.args += fn.arguments;
                  }
                  accumulatedToolCalls.set(idx, current);
                }
              }

              callbacks?.onChunk({ contentChunk, thinkingChunk });
            }
          }
        }
      } catch {
        // ignore parse error on incomplete chunks
      }
    }
  }

  const finalDurationMs = Date.now() - startTime;

  let finalToolCalls: ToolCallItem[] | undefined;
  if (accumulatedToolCalls.size > 0) {
    finalToolCalls = Array.from(accumulatedToolCalls.values()).map((tc, index) => ({
      id: tc.id || `call_stream_${index}`,
      type: 'function',
      function: {
        name: tc.name,
        arguments: tc.args,
      },
    }));
  }

  const metrics: RequestMetrics = {
    status: response.status,
    statusText: response.statusText,
    durationMs: finalDurationMs,
    timeToFirstTokenMs,
    keyName: config.keyId || 'Custom',
    model: config.model,
    timestamp: Date.now(),
  };

  return {
    content: accumulatedContent,
    toolCalls: finalToolCalls,
    thinking: accumulatedThinking || undefined,
    result: {
      metrics,
      rawResponse: receivedChunks,
      requestPayload: payload,
      curlCommand,
    },
  };
}
