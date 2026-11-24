export const OPENAI_COMPATIBILITY_BASELINE = '2026-09-24';

export type OpenAICompatibilityStatus = 'partial' | 'extension';
export type OpenAICompatibilityScope = 'proxy' | 'admin';

export interface OpenAICompatibilityRoute {
  method: 'DELETE' | 'GET' | 'POST';
  path: string;
  scope: OpenAICompatibilityScope;
  status: OpenAICompatibilityStatus;
}

/** Machine-readable route inventory paired with docs/openai-api-compatibility.md. */
export const OPENAI_COMPATIBILITY_ROUTES: readonly OpenAICompatibilityRoute[] = [
  { method: 'GET', path: '/v1/models', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/models/quote', scope: 'proxy', status: 'extension' },
  { method: 'GET', path: '/v1/models/:model', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/gateway/quote', scope: 'proxy', status: 'extension' },
  { method: 'GET', path: '/v1/gateway/quota', scope: 'admin', status: 'extension' },
  {
    method: 'GET',
    path: '/v1/dashboard/billing/usage',
    scope: 'admin',
    status: 'extension',
  },
  { method: 'POST', path: '/v1/chat/completions', scope: 'proxy', status: 'partial' },
  {
    method: 'GET',
    path: '/v1/chat/completions/:completionId',
    scope: 'proxy',
    status: 'partial',
  },
  { method: 'POST', path: '/v1/completions', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/responses', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/responses/:responseId', scope: 'proxy', status: 'partial' },
  { method: 'DELETE', path: '/v1/responses/:responseId', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/images/generations', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/images/edits', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/audio/transcriptions', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/audio/translations', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/files', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/files', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/files/:id', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/files/:id/content', scope: 'proxy', status: 'partial' },
  { method: 'DELETE', path: '/v1/files/:id', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/uploads', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/uploads/:id/parts', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/uploads/:id/complete', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/uploads/:id/cancel', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/batches', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/batches', scope: 'proxy', status: 'partial' },
  { method: 'GET', path: '/v1/batches/:id', scope: 'proxy', status: 'partial' },
  { method: 'POST', path: '/v1/batches/:id/cancel', scope: 'proxy', status: 'partial' },
];
