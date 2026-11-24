import type {
  OpenAIChatResponse,
  OpenAIToolCall,
  OpenAIUsage,
} from '../../../common/interfaces/request-interfaces';

interface CollectedChoice {
  content: string;
  finishReason: string | null;
  reasoningContent: string;
  role: string;
  toolCalls: Map<number, OpenAIToolCall>;
}

/** Reassembles the final Chat Completion object while forwarding SSE unchanged. */
export class OpenAIChatStreamCollector {
  private buffer = '';
  private created = 0;
  private id = '';
  private model = '';
  private usage: OpenAIUsage = {
    completion_tokens: 0,
    prompt_tokens: 0,
    total_tokens: 0,
  };
  private readonly choices = new Map<number, CollectedChoice>();

  public accept(chunk: unknown): void {
    if (typeof chunk !== 'string') {
      return;
    }

    this.buffer += chunk;
    while (true) {
      const separator = /\r?\n\r?\n/u.exec(this.buffer);
      if (!separator || separator.index === undefined) {
        return;
      }
      const block = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator[0].length);
      this.acceptEventBlock(block);
    }
  }

  public build(): OpenAIChatResponse | null {
    if (this.buffer.trim()) {
      this.acceptEventBlock(this.buffer);
      this.buffer = '';
    }
    if (!this.id || !this.model || this.choices.size === 0) {
      return null;
    }

    return {
      id: this.id,
      object: 'chat.completion',
      created: this.created,
      model: this.model,
      choices: [...this.choices.entries()]
        .sort(([left], [right]) => left - right)
        .map(([index, choice]) => ({
          index,
          finish_reason: choice.finishReason,
          message: {
            role: choice.role,
            content: choice.content || null,
            ...(choice.reasoningContent ? { reasoning_content: choice.reasoningContent } : {}),
            ...(choice.toolCalls.size > 0
              ? {
                  tool_calls: [...choice.toolCalls.entries()]
                    .sort(([left], [right]) => left - right)
                    .map(([, toolCall]) => toolCall),
                }
              : {}),
          },
        })),
      usage: this.usage,
    };
  }

  private acceptEventBlock(block: string): void {
    const data = block
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') {
      return;
    }

    try {
      this.acceptChunk(JSON.parse(data) as unknown);
    } catch {
      return;
    }
  }

  private acceptChunk(value: unknown): void {
    const record = toRecord(value);
    if (!record) {
      return;
    }
    const id = Reflect.get(record, 'id');
    const created = Reflect.get(record, 'created');
    const model = Reflect.get(record, 'model');
    if (typeof id === 'string') {
      this.id = id;
    }
    if (typeof created === 'number') {
      this.created = created;
    }
    if (typeof model === 'string') {
      this.model = model;
    }
    this.acceptUsage(Reflect.get(record, 'usage'));

    const choices = Reflect.get(record, 'choices');
    if (!Array.isArray(choices)) {
      return;
    }
    for (const rawChoice of choices) {
      this.acceptChoice(rawChoice);
    }
  }

  private acceptChoice(value: unknown): void {
    const record = toRecord(value);
    if (!record) {
      return;
    }
    const rawIndex = Reflect.get(record, 'index');
    const index = typeof rawIndex === 'number' ? rawIndex : 0;
    const choice = this.choices.get(index) ?? {
      content: '',
      finishReason: null,
      reasoningContent: '',
      role: 'assistant',
      toolCalls: new Map<number, OpenAIToolCall>(),
    };
    const finishReason = Reflect.get(record, 'finish_reason');
    if (typeof finishReason === 'string') {
      choice.finishReason = finishReason;
    }

    const delta = toRecord(Reflect.get(record, 'delta'));
    if (delta) {
      const role = Reflect.get(delta, 'role');
      const content = Reflect.get(delta, 'content');
      const reasoningContent = Reflect.get(delta, 'reasoning_content');
      if (typeof role === 'string') {
        choice.role = role;
      }
      if (typeof content === 'string') {
        choice.content += content;
      }
      if (typeof reasoningContent === 'string') {
        choice.reasoningContent += reasoningContent;
      }
      const toolCalls = Reflect.get(delta, 'tool_calls');
      if (Array.isArray(toolCalls)) {
        for (const toolCall of toolCalls) {
          this.acceptToolCall(choice, toolCall);
        }
      }
    }
    this.choices.set(index, choice);
  }

  private acceptToolCall(choice: CollectedChoice, value: unknown): void {
    const record = toRecord(value);
    if (!record) {
      return;
    }
    const rawIndex = Reflect.get(record, 'index');
    const index = typeof rawIndex === 'number' ? rawIndex : choice.toolCalls.size;
    const existing = choice.toolCalls.get(index);
    const rawFunction = toRecord(Reflect.get(record, 'function'));
    const nextName = rawFunction ? Reflect.get(rawFunction, 'name') : undefined;
    const nextArguments = rawFunction ? Reflect.get(rawFunction, 'arguments') : undefined;
    choice.toolCalls.set(index, {
      id:
        typeof Reflect.get(record, 'id') === 'string'
          ? (Reflect.get(record, 'id') as string)
          : (existing?.id ?? `call_${index}`),
      type:
        typeof Reflect.get(record, 'type') === 'string'
          ? (Reflect.get(record, 'type') as string)
          : (existing?.type ?? 'function'),
      function: {
        name: (existing?.function?.name ?? '') + (typeof nextName === 'string' ? nextName : ''),
        arguments:
          (existing?.function?.arguments ?? '') +
          (typeof nextArguments === 'string' ? nextArguments : ''),
      },
    });
  }

  private acceptUsage(value: unknown): void {
    const record = toRecord(value);
    if (!record) {
      return;
    }
    const promptTokens = Reflect.get(record, 'prompt_tokens');
    const completionTokens = Reflect.get(record, 'completion_tokens');
    const totalTokens = Reflect.get(record, 'total_tokens');
    this.usage = {
      prompt_tokens: typeof promptTokens === 'number' ? promptTokens : this.usage.prompt_tokens,
      completion_tokens:
        typeof completionTokens === 'number' ? completionTokens : this.usage.completion_tokens,
      total_tokens: typeof totalTokens === 'number' ? totalTokens : this.usage.total_tokens,
    };
  }
}

function toRecord(value: unknown): Record<PropertyKey, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<PropertyKey, unknown>)
    : null;
}
