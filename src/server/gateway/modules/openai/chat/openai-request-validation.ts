import { BadRequestException } from '@nestjs/common';
import type { OpenAIChatRequest } from '../../../common/interfaces/request-interfaces';
import type { OpenAITextCompletionRequest } from '../openai-operations.service';

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMessage(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const role = Reflect.get(value, 'role');
  const content = Reflect.get(value, 'content');
  return (
    typeof role === 'string' &&
    role.length > 0 &&
    (typeof content === 'string' || Array.isArray(content) || content === null)
  );
}

function isOpenAIChatRequest(value: unknown): value is OpenAIChatRequest {
  if (!isRecord(value)) {
    return false;
  }
  const model = Reflect.get(value, 'model');
  const messages = Reflect.get(value, 'messages');
  return (
    typeof model === 'string' &&
    model.trim().length > 0 &&
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(isMessage)
  );
}

export function validateOpenAIChatRequest(value: unknown): OpenAIChatRequest {
  if (isOpenAIChatRequest(value)) {
    return value;
  }
  if (!isRecord(value)) {
    throw invalidRequest('Request body must be a JSON object.', null);
  }
  const model = Reflect.get(value, 'model');
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw invalidRequest("Missing required parameter: 'model'.", 'model');
  }
  const messages = Reflect.get(value, 'messages');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw invalidRequest("Missing required parameter: 'messages'.", 'messages');
  }
  const invalidMessageIndex = messages.findIndex((message) => !isMessage(message));
  throw invalidRequest(
    `Invalid value for 'messages[${invalidMessageIndex}]'. Expected a role-bearing message.`,
    `messages[${invalidMessageIndex}]`,
  );
}

export function validateOpenAITextCompletionRequest(value: unknown): OpenAITextCompletionRequest {
  if (!isRecord(value)) {
    throw invalidRequest('Request body must be a JSON object.', null);
  }

  const model = Reflect.get(value, 'model');
  if (model !== undefined && (typeof model !== 'string' || model.trim().length === 0)) {
    throw invalidRequest("Invalid value for 'model'.", 'model');
  }

  const prompt = Reflect.get(value, 'prompt');
  if (
    prompt !== undefined &&
    typeof prompt !== 'string' &&
    !(Array.isArray(prompt) && prompt.every((item) => typeof item === 'string'))
  ) {
    throw invalidRequest(
      "Invalid value for 'prompt'. Expected a string or string array.",
      'prompt',
    );
  }

  return {
    model: typeof model === 'string' ? model : undefined,
    prompt: prompt as string | string[] | undefined,
    max_tokens:
      typeof Reflect.get(value, 'max_tokens') === 'number'
        ? (Reflect.get(value, 'max_tokens') as number)
        : undefined,
    temperature:
      typeof Reflect.get(value, 'temperature') === 'number'
        ? (Reflect.get(value, 'temperature') as number)
        : undefined,
    top_p:
      typeof Reflect.get(value, 'top_p') === 'number'
        ? (Reflect.get(value, 'top_p') as number)
        : undefined,
    stream:
      typeof Reflect.get(value, 'stream') === 'boolean'
        ? (Reflect.get(value, 'stream') as boolean)
        : undefined,
  };
}

function invalidRequest(message: string, param: string | null): BadRequestException {
  return new BadRequestException({
    code: 'invalid_request_error',
    message,
    param,
    type: 'invalid_request_error',
  });
}
