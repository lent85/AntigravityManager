export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCallFunction {
  name: string;
  arguments: string;
}

export interface ToolCallItem {
  id: string;
  type: 'function';
  function: ToolCallFunction;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  name?: string;
  tool_calls?: ToolCallItem[];
  tool_call_id?: string;
  thinking?: string;
  timestamp: number;
  isError?: boolean;
}

export interface ToolDefinition {
  id: string;
  enabled: boolean;
  name: string;
  description: string;
  parametersJson: string;
}

export type SupportedProtocol = 'openai' | 'anthropic' | 'gemini';

export interface ClientToolsConfig {
  apiKey: string;
  keyId: string;
  baseUrl: string;
  model: string;
  protocol: SupportedProtocol;
  stream: boolean;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  jsonMode: boolean;
  tools: ToolDefinition[];
}

export interface RequestMetrics {
  status: number;
  statusText: string;
  durationMs: number;
  timeToFirstTokenMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  keyName?: string;
  model?: string;
  timestamp: number;
}

export interface ExecutionResult {
  metrics: RequestMetrics;
  rawResponse: unknown;
  requestPayload: unknown;
  curlCommand: string;
}
