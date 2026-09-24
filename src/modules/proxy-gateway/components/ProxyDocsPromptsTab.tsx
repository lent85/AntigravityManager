import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { OpenCodeSyncCard } from './OpenCodeSyncCard';
import type { ProxyApiKey } from '@/modules/config/types';
import type { ProxyExampleModel } from './proxy-example-models';
import {
  BookOpen,
  CheckCircle2,
  Code,
  Copy,
  Database,
  Eye,
  FileCode,
  Laptop,
  Layers,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react';

interface ProxyDocsPromptsTabProps {
  baseUrl: string;
  apiKey: string;
  models: readonly ProxyExampleModel[];
  apiKeys?: ProxyApiKey[];
}

export function ProxyDocsPromptsTab({
  baseUrl,
  apiKey: defaultApiKey,
  models,
  apiKeys = [],
}: ProxyDocsPromptsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [userSelectedModelId, setUserSelectedModelId] = useState<string | null>(null);
  const [userSelectedKeyId, setUserSelectedKeyId] = useState<string | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});

  const apiKey = useMemo(() => {
    if (userSelectedKeyId && apiKeys.length > 0) {
      const found = apiKeys.find((k) => k.id === userSelectedKeyId);
      if (found) return found.key;
    }
    if (apiKeys.length > 0) {
      const active = apiKeys.find((k) => k.enabled !== false);
      if (active) return active.key;
    }
    return defaultApiKey;
  }, [userSelectedKeyId, apiKeys, defaultApiKey]);

  const selectedModelId = useMemo(() => {
    if (userSelectedModelId && models.some((m) => m.id === userSelectedModelId)) {
      return userSelectedModelId;
    }
    const preferred = models.find((m) => m.id === 'gemini-3.1-pro-high');
    return preferred?.id || models[0]?.id || 'gemini-3.1-pro-high';
  }, [userSelectedModelId, models]);

  const { geminiModels, claudeModels, otherModels } = useMemo(() => {
    const gemini: ProxyExampleModel[] = [];
    const claude: ProxyExampleModel[] = [];
    const other: ProxyExampleModel[] = [];

    for (const model of models) {
      const lower = model.id.toLowerCase();
      if (lower.startsWith('gemini')) {
        gemini.push(model);
      } else if (lower.startsWith('claude')) {
        claude.push(model);
      } else {
        other.push(model);
      }
    }

    return { geminiModels: gemini, claudeModels: claude, otherModels: other };
  }, [models]);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
    toast({ title: t('proxy.copied', 'Copied to clipboard!') });
  };

  const toggleResponse = (id: string) => {
    setExpandedResponses((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const PROMPTS = [
    {
      id: 'agent_integration',
      title: t('proxy.prompts.agent_integration_title', 'Autonomous Agent Gateway Integration'),
      desc: t(
        'proxy.prompts.agent_integration_desc',
        'System prompt for Cursor, Claude Code, Cline, or custom AI agents to route requests through this Gateway.',
      ),
      content: `You are an AI developer assistant connected to the local Antigravity AI Gateway.

Gateway Connection:
- Base URL: ${baseUrl}/v1
- Protocol: OpenAI & Anthropic Compatible
- Authentication: Bearer ${apiKey || '<GATEWAY_API_KEY>'}

Core Operational Rules:
1. Endpoint Routing: Send chat completions to '${baseUrl}/v1/chat/completions' or native Anthropic requests to '${baseUrl}/v1/messages'.
2. Model Selection:
   - Primary active model: '${selectedModelId}'
   - Deep reasoning & architecture: 'gemini-3.1-pro-high' or 'claude-sonnet-4-6-thinking'
   - Fast completions & small edits: 'gemini-3-flash'
3. Resilience & Rate Limiting: The gateway automatically pools and rotates accounts. If you encounter HTTP 429 or 503, retry with brief exponential backoff (1s, 2s); the gateway will rotate to a healthy account.
4. Tool Calling: Standard OpenAI/Anthropic tool schemas and function calling are fully supported.`,
    },
    {
      id: 'subagent_delegation',
      title: t('proxy.prompts.subagent_title', 'Sub-Agent & Worker LLM Delegation'),
      desc: t(
        'proxy.prompts.subagent_desc',
        'Instructions for worker LLMs and sub-agents to dispatch delegated tasks through the Gateway with quota awareness.',
      ),
      content: `You are a delegated worker agent executing focused subtasks for the primary agent.
All external LLM inference must be dispatched via the Antigravity AI Gateway:

Gateway Specs:
- API Base: ${baseUrl}/v1
- Auth Header: Authorization: Bearer ${apiKey || '<GATEWAY_API_KEY>'}

Execution Constraints:
1. Conciseness: Omit conversational filler. Return structured results (code, JSON, or concise markdown) immediately.
2. Model Tiering: Use 'gemini-3-flash' for extraction, indexing, and high-throughput tasks. Use '${selectedModelId}' for complex logic synthesis.
3. Streaming: Enable 'stream: true' on completions for incremental chunk delivery and lower perceived latency.
4. Token Efficiency: Target surgical code diffs rather than entire file rewrites to preserve pooled account quota.`,
    },
    {
      id: 'quota_discovery',
      title: t(
        'proxy.prompts.quota_discovery_title',
        'Dynamic Gateway Model Inspection (Tool Use)',
      ),
      desc: t(
        'proxy.prompts.quota_discovery_desc',
        'Instructions for AI models to query the public model catalog and configured quote data.',
      ),
      content: `You have access to inspect the Antigravity AI Gateway runtime status and quota capacity dynamically:

Diagnostic & Discovery Endpoints:
- Available Model IDs: GET ${baseUrl}/v1/models
- Configured Pricing & Observed Model Quota: GET ${baseUrl}/v1/models/quote

Protocol:
- Always include 'Authorization: Bearer ${apiKey || '<GATEWAY_API_KEY>'}' in discovery headers.
- Treat omitted pricing or quota fields as unknown; never infer them from a model name.
- '/v1/gateway/quota' is an administrator-only endpoint and must not be queried by downstream agents.`,
    },
    {
      id: 'fallback_cascade',
      title: t('proxy.prompts.fallback_title', 'Multi-Model Fallback & Routing Cascade'),
      desc: t(
        'proxy.prompts.fallback_desc',
        'Instructs AI agents on graceful model fallback sequences across Gemini and Claude when handling rate limits.',
      ),
      content: `You are operating within a multi-provider gateway environment with Gemini and Claude unified behind a single endpoint.

Gateway Target: ${baseUrl}/v1 (Bearer: ${apiKey || '<GATEWAY_API_KEY>'})

Model Priority Cascade:
1. High Reasoning: '${selectedModelId}'
2. Alternative Reasoning: 'claude-sonnet-4-6-thinking'
3. High Speed / Fallback: 'gemini-3-flash'

Fallback Behavior:
- If a primary model encounters extended latency (>15s) or account exhaustion, switch to the next tier in the cascade.
- Maintain message state across transitions; the gateway unifies parameter schemas between Anthropic and OpenAI formats.
- Log a brief notification: "[Gateway Notice: Routed to <model_id>]" before providing the completion.`,
    },
  ];

  const CURSOR_CONFIG = `# .cursorrules for Antigravity AI Gateway
# OpenAI API Base URL: ${baseUrl}/v1
# API Key: ${apiKey || 'YOUR_API_KEY'}

Preferred Model: ${selectedModelId}
Fast Model: gemini-3-flash
Thinking Model: ${selectedModelId.includes('thinking') ? selectedModelId : 'claude-sonnet-4-6-thinking'}

Guidelines:
- Prioritize clean architecture and strict TypeScript types.
- Provide direct code diffs with explanatory context.`;

  const VSCODE_CLINE_CONFIG = JSON.stringify(
    {
      apiProvider: 'openai-compatible',
      openAiBaseUrl: `${baseUrl}/v1`,
      openAiApiKey: apiKey || 'YOUR_API_KEY',
      openAiModelId: selectedModelId,
    },
    null,
    2,
  );

  const CURL_EXAMPLE = `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}" \\
  -d '{
    "model": "${selectedModelId}",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ]
  }'`;

  const NODE_OPENAI_EXAMPLE = `import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${baseUrl}/v1',
  apiKey: '${apiKey || 'YOUR_API_KEY'}',
});

const response = await client.chat.completions.create({
  model: '${selectedModelId}',
  messages: [{ role: 'user', content: 'Explain the concept of quantum entanglement' }],
});

console.log(response.choices[0].message.content);`;

  const PYTHON_OPENAI_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    base_url="${baseUrl}/v1",
    api_key="${apiKey || 'YOUR_API_KEY'}"
)

response = client.chat.completions.create(
    model="${selectedModelId}",
    messages=[{"role": "user", "content": "Explain the concept of quantum entanglement"}]
)
print(response.choices[0].message.content)`;

  const PYTHON_ANTHROPIC_EXAMPLE = `from anthropic import Anthropic

client = Anthropic(
    base_url="${baseUrl}",
    api_key="${apiKey || 'YOUR_API_KEY'}"
)

response = client.messages.create(
    model="${selectedModelId}",
    max_tokens=2048,
    messages=[{"role": "user", "content": "Write a clean TypeScript debounce hook"}]
)
print(response.content[0].text)`;

  const OPENAI_CACHE_EXAMPLE = `// OpenAI SDK (Node.js / TypeScript) - Verifying Cache Hits
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: '${baseUrl}/v1',
  apiKey: '${apiKey || 'YOUR_API_KEY'}',
});

const response = await client.chat.completions.create({
  model: '${selectedModelId}',
  messages: [
    // Tip: Keep static system instructions >= 8,192 chars to trigger caching
    { role: 'system', content: 'You are an expert system architect...' },
    { role: 'user', content: 'Design a microservice architecture for billing' },
  ],
});

// The gateway maps Gemini's cachedContentTokenCount to prompt_tokens_details.cached_tokens
const cachedTokens = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
console.log('Cached Tokens Read: ' + cachedTokens);
console.log('Total Prompt Tokens: ' + response.usage?.prompt_tokens);`;

  const CLAUDE_CACHE_EXAMPLE = `# Anthropic SDK (Python) - Verifying Cache Hits
from anthropic import Anthropic

client = Anthropic(
    base_url="${baseUrl}",
    api_key="${apiKey || 'YOUR_API_KEY'}",
)

response = client.messages.create(
    model="${selectedModelId}",
    max_tokens=2048,
    # Tip: Keep static system instructions >= 8,192 chars to trigger caching
    system="You are an expert system architect...",
    messages=[{"role": "user", "content": "Design a microservice architecture for billing"}]
)

# The gateway maps Gemini's cachedContentTokenCount to cache_read_input_tokens
cached_tokens = getattr(response.usage, "cache_read_input_tokens", 0)
print(f"Cached Tokens Read: {cached_tokens}")
print(f"Total Input Tokens: {response.usage.input_tokens}")`;

  const API_GUIDES = [
    {
      id: 'get_models',
      method: 'GET',
      path: '/v1/models',
      title: t('proxy.guides.api_models_title', 'List Models API'),
      desc: t(
        'proxy.guides.api_models_desc',
        'Returns a list of all models available in the gateway (OpenAI compatible format).',
      ),
      curl: `curl -s "${baseUrl}/v1/models" \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}"`,
      response: JSON.stringify(
        {
          object: 'list',
          data: [
            {
              id: selectedModelId,
              object: 'model',
              created: 1700000000,
              owned_by: 'antigravity-gateway',
            },
            {
              id: 'gemini-3-flash',
              object: 'model',
              created: 1700000000,
              owned_by: 'antigravity-gateway',
            },
            {
              id: 'claude-sonnet-4-6-thinking',
              object: 'model',
              created: 1700000000,
              owned_by: 'antigravity-gateway',
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      id: 'get_model_detail',
      method: 'GET',
      path: `/v1/models/${selectedModelId}`,
      title: t('proxy.guides.api_model_detail_title', 'Retrieve Model Detail API'),
      desc: t(
        'proxy.guides.api_model_detail_desc',
        'Retrieve the standard OpenAI model identity for a specific model.',
      ),
      curl: `curl -s "${baseUrl}/v1/models/${selectedModelId}" \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}"`,
      response: JSON.stringify(
        {
          id: selectedModelId,
          object: 'model',
          created: 1700000000,
          owned_by: 'antigravity-gateway',
        },
        null,
        2,
      ),
    },
    {
      id: 'get_quote',
      method: 'GET',
      path: '/v1/models/quote',
      title: t('proxy.guides.api_quote_title', 'Model Pricing & Quote API'),
      desc: t(
        'proxy.guides.api_quote_desc',
        'Returns administrator-configured pricing and observed quota when those values are available.',
      ),
      curl: `curl -s "${baseUrl}/v1/models/quote" \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}"`,
      response: JSON.stringify(
        [
          {
            id: selectedModelId,
            object: 'model_quote',
            pricing: {
              prompt_price_per_m: 2.5,
              completion_price_per_m: 10.0,
              request_price: 0.0,
            },
            quota: {
              available_percentage: 100,
              active_accounts: 3,
              rate_limited_accounts: 0,
            },
          },
        ],
        null,
        2,
      ),
    },
    {
      id: 'get_quota',
      method: 'GET',
      path: '/v1/gateway/quota',
      title: t('proxy.guides.api_quota_title', 'Account Pool Quota API'),
      desc: t(
        'proxy.guides.api_quota_desc',
        'Admin-only inspection of pooled quota, account status, and load balancer health.',
      ),
      curl: `curl -s "${baseUrl}/v1/gateway/quota" \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}"`,
      response: JSON.stringify(
        {
          object: 'quota_summary',
          timestamp: 1710892800000,
          scheduling_mode: 'round-robin',
          account_selection_mode: 'all',
          models: {
            [selectedModelId]: {
              available_percentage: 100,
              active_accounts: 3,
              rate_limited_accounts: 0,
            },
          },
          accounts: [
            {
              account_id: 'acc_01',
              status: 'healthy',
              quota_percentage: 100,
            },
          ],
        },
        null,
        2,
      ),
    },
    {
      id: 'post_chat',
      method: 'POST',
      path: '/v1/chat/completions',
      title: t('proxy.guides.api_chat_title', 'Chat Completions API'),
      desc: t(
        'proxy.guides.api_chat_desc',
        'OpenAI-compatible chat completion endpoint supporting streaming and tool calls.',
      ),
      curl: `curl -X POST "${baseUrl}/v1/chat/completions" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || 'YOUR_API_KEY'}" \\
  -d '{
    "model": "${selectedModelId}",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in simple terms"}
    ],
    "temperature": 0.7
  }'`,
      response: JSON.stringify(
        {
          id: 'chatcmpl-01h',
          object: 'chat.completion',
          created: 1710892800,
          model: selectedModelId,
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Quantum computing uses quantum mechanics to solve complex problems...',
              },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 45,
            total_tokens: 57,
          },
        },
        null,
        2,
      ),
    },
    {
      id: 'post_anthropic',
      method: 'POST',
      path: '/v1/messages',
      title: t('proxy.guides.api_anthropic_title', 'Anthropic Messages API'),
      desc: t(
        'proxy.guides.api_anthropic_desc',
        'Native Anthropic messages endpoint; gateway transparently handles schema mapping.',
      ),
      curl: `curl -X POST "${baseUrl}/v1/messages" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey || 'YOUR_API_KEY'}" \\
  -H "anthropic-version: 2023-06-01" \\
  -d '{
    "model": "${selectedModelId}",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Write a clean TypeScript debounce hook"}
    ]
  }'`,
      response: JSON.stringify(
        {
          id: 'msg_01h',
          type: 'message',
          role: 'assistant',
          model: selectedModelId,
          content: [
            {
              type: 'text',
              text: 'Here is an implementation of a debounce hook in TypeScript...',
            },
          ],
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 15,
            output_tokens: 60,
          },
        },
        null,
        2,
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* Unified Header Toolbar: Model Selector & Info */}
      <div className="bg-card flex flex-col gap-2.5 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
            <BookOpen className="size-4" />
          </div>
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              {t('proxy.guides.ide_title', 'AI Client & Gateway Guides')}
            </h3>
            <p className="text-muted-foreground text-[11px]">
              {t(
                'proxy.guides.ide_desc',
                'Copy preconfigured snippets into Cursor, VS Code (Cline/Roo Code/Continue), or custom AI tools.',
              )}
            </p>
          </div>
        </div>

        {/* Client Key & Model Selectors */}
        <div className="flex flex-wrap items-center gap-3 self-start sm:self-center">
          {apiKeys.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Label
                htmlFor="guide-client-select"
                className="text-muted-foreground text-xs font-medium whitespace-nowrap"
              >
                {t('proxy.guides.client_app', 'Client App:')}
              </Label>
              <Select
                value={
                  userSelectedKeyId || (apiKeys.find((k) => k.key === apiKey)?.id ?? apiKeys[0]?.id)
                }
                onValueChange={setUserSelectedKeyId}
              >
                <SelectTrigger
                  id="guide-client-select"
                  className="bg-background h-8 w-auto max-w-[220px] min-w-[140px] text-xs"
                >
                  <SelectValue placeholder={t('proxy.guides.select_client', 'Select client...')} />
                </SelectTrigger>
                <SelectContent>
                  {apiKeys.map((k) => (
                    <SelectItem key={k.id} value={k.id} className="text-xs">
                      {k.name} {!k.enabled && `(${t('proxy.keys.disabled', 'Disabled')})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Model Selector */}
          <div className="flex items-center gap-2">
            <Label
              htmlFor="guide-model-select"
              className="text-muted-foreground text-xs font-medium whitespace-nowrap"
            >
              {t('proxy.guides.target_model', 'Target Model:')}
            </Label>
            <Select value={selectedModelId} onValueChange={setUserSelectedModelId}>
              <SelectTrigger
                id="guide-model-select"
                className="bg-background h-8 w-auto max-w-[320px] min-w-[210px] font-mono text-xs"
              >
                <SelectValue placeholder={t('proxy.guides.select_model', 'Select a model...')} />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {geminiModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                      {t('proxy.guides.gemini_models', 'Google Gemini')}
                    </SelectLabel>
                    {geminiModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                        {m.name !== m.id ? `${m.name} (${m.id})` : m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {claudeModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                      {t('proxy.guides.claude_models', 'Anthropic Claude')}
                    </SelectLabel>
                    {claudeModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                        {m.name !== m.id ? `${m.name} (${m.id})` : m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {otherModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                      {t('proxy.guides.other_models', 'Other Models')}
                    </SelectLabel>
                    {otherModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="font-mono text-xs">
                        {m.name !== m.id ? `${m.name} (${m.id})` : m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {models.length === 0 && (
                  <SelectItem value={selectedModelId} className="font-mono text-xs">
                    {selectedModelId}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <Tabs defaultValue="ides" className="space-y-3">
        <TabsList className="bg-muted/60 grid h-9 w-full grid-cols-2 p-0.5 sm:grid-cols-3 md:grid-cols-5">
          <TabsTrigger
            value="ides"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
          >
            <Laptop className="size-3.5" />
            <span className="truncate">{t('proxy.guides.tab_ides', 'Clients & IDEs')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="sdks"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
          >
            <Code className="size-3.5" />
            <span className="truncate">{t('proxy.guides.tab_sdks', 'SDKs & Code')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="apis"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
          >
            <Terminal className="size-3.5" />
            <span className="truncate">{t('proxy.guides.tab_apis', 'Gateway REST APIs')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="caching"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
          >
            <Zap className="size-3.5 text-amber-500" />
            <span className="truncate">{t('proxy.guides.tab_caching', 'Context Caching')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="prompts"
            className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium"
          >
            <Sparkles className="size-3.5" />
            <span className="truncate">{t('proxy.guides.tab_prompts', 'System Prompts')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Clients & IDEs */}
        <TabsContent value="ides" className="mt-0 space-y-3">
          <OpenCodeSyncCard baseUrl={baseUrl} models={models} />

          {/* Cursor Configuration */}
          <div className="bg-card space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCode className="text-primary size-4" />
                <div>
                  <h4 className="text-xs font-semibold">Cursor IDE (.cursorrules & Models)</h4>
                  <p className="text-muted-foreground text-[11px]">
                    Set Base URL to <code className="font-mono">{baseUrl}/v1</code>
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => copyText(CURSOR_CONFIG, 'cursor')}
              >
                {copiedSection === 'cursor' ? (
                  <CheckCircle2 className="mr-1 size-3 text-green-500" />
                ) : (
                  <Copy className="mr-1 size-3" />
                )}
                {copiedSection === 'cursor'
                  ? t('proxy.copied', 'Copied')
                  : t('proxy.copy', 'Copy .cursorrules')}
              </Button>
            </div>
            <pre className="bg-muted/50 text-foreground max-h-40 overflow-x-auto rounded p-2 font-mono text-[11px]">
              {CURSOR_CONFIG}
            </pre>
          </div>

          {/* VS Code (Cline / Roo Code / Continue) */}
          <div className="bg-card space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileCode className="text-primary size-4" />
                <div>
                  <h4 className="text-xs font-semibold">
                    VS Code (Cline / Roo Code / Continue.dev)
                  </h4>
                  <p className="text-muted-foreground text-[11px]">
                    Paste into OpenAI-compatible provider config:
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => copyText(VSCODE_CLINE_CONFIG, 'cline')}
              >
                {copiedSection === 'cline' ? (
                  <CheckCircle2 className="mr-1 size-3 text-green-500" />
                ) : (
                  <Copy className="mr-1 size-3" />
                )}
                {copiedSection === 'cline'
                  ? t('proxy.copied', 'Copied')
                  : t('proxy.copy', 'Copy JSON')}
              </Button>
            </div>
            <pre className="bg-muted/50 text-foreground max-h-40 overflow-x-auto rounded p-2 font-mono text-[11px]">
              {VSCODE_CLINE_CONFIG}
            </pre>
          </div>
        </TabsContent>

        {/* Tab 2: SDKs & Code Snippets */}
        <TabsContent value="sdks" className="mt-0 space-y-3">
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {/* cURL */}
            <div className="bg-card space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Terminal className="text-primary size-3.5" />
                  <h4 className="text-xs font-semibold">
                    {t('proxy.guides.curl_title', 'cURL (REST API)')}
                  </h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyText(CURL_EXAMPLE, 'curl')}
                >
                  {copiedSection === 'curl' ? (
                    <CheckCircle2 className="mr-1 size-3 text-green-500" />
                  ) : (
                    <Copy className="mr-1 size-3" />
                  )}
                  {copiedSection === 'curl' ? t('proxy.copied', 'Copied') : t('proxy.copy', 'Copy')}
                </Button>
              </div>
              <pre className="bg-muted/50 text-foreground max-h-40 overflow-x-auto rounded p-2 font-mono text-[11px]">
                {CURL_EXAMPLE}
              </pre>
            </div>

            {/* Node.js */}
            <div className="bg-card space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Code className="text-primary size-3.5" />
                  <h4 className="text-xs font-semibold">
                    {t('proxy.guides.node_title', 'Node.js (OpenAI SDK)')}
                  </h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyText(NODE_OPENAI_EXAMPLE, 'node_openai')}
                >
                  {copiedSection === 'node_openai' ? (
                    <CheckCircle2 className="mr-1 size-3 text-green-500" />
                  ) : (
                    <Copy className="mr-1 size-3" />
                  )}
                  {copiedSection === 'node_openai'
                    ? t('proxy.copied', 'Copied')
                    : t('proxy.copy', 'Copy')}
                </Button>
              </div>
              <pre className="bg-muted/50 text-foreground max-h-40 overflow-x-auto rounded p-2 font-mono text-[11px]">
                {NODE_OPENAI_EXAMPLE}
              </pre>
            </div>

            {/* OpenAI Python */}
            <div className="bg-card space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Code className="text-primary size-3.5" />
                  <h4 className="text-xs font-semibold">OpenAI Python SDK</h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyText(PYTHON_OPENAI_EXAMPLE, 'py_openai')}
                >
                  {copiedSection === 'py_openai' ? (
                    <CheckCircle2 className="mr-1 size-3 text-green-500" />
                  ) : (
                    <Copy className="mr-1 size-3" />
                  )}
                  {copiedSection === 'py_openai'
                    ? t('proxy.copied', 'Copied')
                    : t('proxy.copy', 'Copy')}
                </Button>
              </div>
              <pre className="bg-muted/50 text-foreground max-h-40 overflow-x-auto rounded p-2 font-mono text-[11px]">
                {PYTHON_OPENAI_EXAMPLE}
              </pre>
            </div>

            {/* Anthropic Python */}
            <div className="bg-card space-y-1.5 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Code className="text-primary size-3.5" />
                  <h4 className="text-xs font-semibold">Anthropic Python SDK</h4>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => copyText(PYTHON_ANTHROPIC_EXAMPLE, 'py_anthropic')}
                >
                  {copiedSection === 'py_anthropic' ? (
                    <CheckCircle2 className="mr-1 size-3 text-green-500" />
                  ) : (
                    <Copy className="mr-1 size-3" />
                  )}
                  {copiedSection === 'py_anthropic'
                    ? t('proxy.copied', 'Copied')
                    : t('proxy.copy', 'Copy')}
                </Button>
              </div>
              <pre className="bg-muted/50 text-foreground max-h-40 overflow-x-auto rounded p-2 font-mono text-[11px]">
                {PYTHON_ANTHROPIC_EXAMPLE}
              </pre>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Gateway REST APIs */}
        <TabsContent value="apis" className="mt-0 space-y-3">
          <div className="grid grid-cols-1 gap-2.5">
            {API_GUIDES.map((api) => (
              <div key={api.id} className="bg-card space-y-2 rounded-md border p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                        api.method === 'GET'
                          ? 'border border-blue-500/20 bg-blue-500/10 text-blue-500'
                          : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                      }`}
                    >
                      {api.method}
                    </span>
                    <code className="text-foreground font-mono text-xs font-semibold">
                      {api.path}
                    </code>
                    <span className="text-muted-foreground hidden text-xs font-medium md:inline">
                      — {api.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => toggleResponse(api.id)}
                    >
                      <Eye className="mr-1 size-3" />
                      {expandedResponses[api.id]
                        ? t('proxy.guides.hide_response', 'Hide Response')
                        : t('proxy.guides.view_response', 'Response Preview')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => copyText(api.curl, `curl_${api.id}`)}
                    >
                      {copiedSection === `curl_${api.id}` ? (
                        <CheckCircle2 className="mr-1 size-3 text-green-500" />
                      ) : (
                        <Copy className="mr-1 size-3" />
                      )}
                      {copiedSection === `curl_${api.id}`
                        ? t('proxy.copied', 'Copied')
                        : t('proxy.copy', 'Copy cURL')}
                    </Button>
                  </div>
                </div>

                <p className="text-muted-foreground text-[11px]">{api.desc}</p>

                <div className="space-y-1">
                  <pre className="bg-muted/50 text-foreground max-h-36 overflow-x-auto rounded p-2 font-mono text-[11px]">
                    {api.curl}
                  </pre>
                </div>

                {expandedResponses[api.id] && (
                  <div className="animate-in fade-in-50 space-y-1 duration-200">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                        {t('proxy.guides.api_response_preview', 'Response Preview')}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1.5 text-[10px]"
                        onClick={() => copyText(api.response, `resp_${api.id}`)}
                      >
                        {copiedSection === `resp_${api.id}` ? (
                          <CheckCircle2 className="mr-1 size-2.5 text-green-500" />
                        ) : (
                          <Copy className="mr-1 size-2.5" />
                        )}
                        {copiedSection === `resp_${api.id}`
                          ? t('proxy.copied', 'Copied')
                          : t('proxy.copy', 'Copy')}
                      </Button>
                    </div>
                    <pre className="bg-muted/40 text-muted-foreground max-h-48 overflow-x-auto rounded p-2 font-mono text-[10px]">
                      {api.response}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: Context Caching */}
        <TabsContent value="caching" className="mt-0 space-y-3">
          <Card>
            <CardHeader className="bg-muted/20 border-b px-4 py-2.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
                    <Zap className="size-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">
                      {t(
                        'proxy.guides.caching_title',
                        'Gemini Context Caching (Transparent & Automatic)',
                      )}
                    </CardTitle>
                    <p className="text-muted-foreground text-[11px]">
                      {t(
                        'proxy.guides.caching_desc',
                        'Zero client configuration needed. The Gateway automatically provisions and reuses upstream Gemini cachedContents for static prompts and tools.',
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 self-start sm:self-center">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                    <CheckCircle2 className="size-3" />
                    Active by Default
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 p-3 sm:p-4">
              {/* How it Works - 4 Step Flow */}
              <div>
                <h4 className="text-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <Database className="text-primary size-3.5" />
                  {t('proxy.guides.caching_how_it_works', 'How Context Caching Works')}
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="bg-card space-y-1 rounded-md border p-2.5">
                    <span className="text-primary block text-[11px] font-semibold">
                      {t('proxy.guides.caching_step1_title', '1. Static Prefix Detection')}
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {t(
                        'proxy.guides.caching_step1_desc',
                        'Analyzes system instructions and tools. When static content is >= 8,192 characters, it qualifies for caching.',
                      )}
                    </p>
                  </div>
                  <div className="bg-card space-y-1 rounded-md border p-2.5">
                    <span className="text-primary block text-[11px] font-semibold">
                      {t('proxy.guides.caching_step2_title', '2. Upstream Creation')}
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {t(
                        'proxy.guides.caching_step2_desc',
                        'Provisions a cachedContents resource in Google Vertex AI with 1-hour TTL and stores the handle in LRU memory.',
                      )}
                    </p>
                  </div>
                  <div className="bg-card space-y-1 rounded-md border p-2.5">
                    <span className="text-primary block text-[11px] font-semibold">
                      {t('proxy.guides.caching_step3_title', '3. Request Trimming')}
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {t(
                        'proxy.guides.caching_step3_desc',
                        'Subsequent requests omit repeated static instructions, sending the cachedContent handle to slash TTFT and token costs.',
                      )}
                    </p>
                  </div>
                  <div className="bg-card space-y-1 rounded-md border p-2.5">
                    <span className="text-primary block text-[11px] font-semibold">
                      {t('proxy.guides.caching_step4_title', '4. Resilient Failover')}
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {t(
                        'proxy.guides.caching_step4_desc',
                        'If cache expires or upstream returns 404/400, Gateway auto-invalidates and retries once with the full payload.',
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Code Verification Snippets */}
              <div>
                <h4 className="text-foreground mb-2 flex items-center gap-1.5 text-xs font-semibold">
                  <Code className="text-primary size-3.5" />
                  {t(
                    'proxy.guides.caching_observability_title',
                    'Token Accounting & Client Verification',
                  )}
                </h4>
                <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                  {/* OpenAI Snippet */}
                  <div className="bg-card space-y-1.5 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Terminal className="text-primary size-3.5" />
                        <span className="text-xs font-semibold">
                          OpenAI Format (Cursor, Cline, OpenAI SDK)
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => copyText(OPENAI_CACHE_EXAMPLE, 'openai_cache')}
                      >
                        {copiedSection === 'openai_cache' ? (
                          <CheckCircle2 className="mr-1 size-3 text-green-500" />
                        ) : (
                          <Copy className="mr-1 size-3" />
                        )}
                        {copiedSection === 'openai_cache'
                          ? t('proxy.copied', 'Copied')
                          : t('proxy.copy', 'Copy')}
                      </Button>
                    </div>
                    <pre className="bg-muted/50 text-foreground max-h-48 overflow-x-auto rounded p-2 font-mono text-[11px]">
                      {OPENAI_CACHE_EXAMPLE}
                    </pre>
                  </div>

                  {/* Claude Snippet */}
                  <div className="bg-card space-y-1.5 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Terminal className="text-primary size-3.5" />
                        <span className="text-xs font-semibold">
                          Anthropic Format (Claude Code, Anthropic SDK)
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => copyText(CLAUDE_CACHE_EXAMPLE, 'claude_cache')}
                      >
                        {copiedSection === 'claude_cache' ? (
                          <CheckCircle2 className="mr-1 size-3 text-green-500" />
                        ) : (
                          <Copy className="mr-1 size-3" />
                        )}
                        {copiedSection === 'claude_cache'
                          ? t('proxy.copied', 'Copied')
                          : t('proxy.copy', 'Copy')}
                      </Button>
                    </div>
                    <pre className="bg-muted/50 text-foreground max-h-48 overflow-x-auto rounded p-2 font-mono text-[11px]">
                      {CLAUDE_CACHE_EXAMPLE}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Best Practices & Optimization */}
              <div className="bg-muted/20 space-y-2 rounded-md border p-3">
                <h4 className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                  <ShieldCheck className="size-3.5 text-green-500" />
                  {t(
                    'proxy.guides.caching_best_practices_title',
                    'Best Practices for Maximizing Cache Hits',
                  )}
                </h4>
                <div className="text-muted-foreground grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                  <div className="bg-card/60 space-y-1 rounded border p-2">
                    <strong className="text-foreground block font-medium">
                      Stable System Prompts
                    </strong>
                    Keep instructions and tool definitions identical between sessions. Avoid
                    altering wording across turns.
                  </div>
                  <div className="bg-card/60 space-y-1 rounded border p-2">
                    <strong className="text-foreground block font-medium">
                      Omit Volatile Timestamps
                    </strong>
                    Avoid appending dynamic timestamps or random request IDs to system messages.
                    Gateway auto-sanitizes common formats.
                  </div>
                  <div className="bg-card/60 space-y-1 rounded border p-2">
                    <strong className="text-foreground block font-medium">
                      Prompt Cache First Routing
                    </strong>
                    In Proxy Settings &gt; Account Routing, select <em>Prompt Cache First</em> to
                    prioritize routing to the same Google account.
                  </div>
                </div>
              </div>

              {/* Configuration Environment Variables */}
              <div className="space-y-1.5">
                <h4 className="text-foreground flex items-center gap-1.5 text-xs font-semibold">
                  <Layers className="text-primary size-3.5" />
                  {t('proxy.guides.caching_env_title', 'Environment Variables & Advanced Tuning')}
                </h4>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-muted/40 text-muted-foreground border-b">
                      <tr>
                        <th className="px-3 py-1.5 font-medium">Environment Variable</th>
                        <th className="px-3 py-1.5 font-medium">Default</th>
                        <th className="px-3 py-1.5 font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-border divide-y">
                      <tr>
                        <td className="text-foreground px-3 py-1.5 font-mono font-semibold">
                          PROXY_CONTEXT_CACHE_ENABLED
                        </td>
                        <td className="text-muted-foreground px-3 py-1.5 font-mono">true</td>
                        <td className="text-muted-foreground px-3 py-1.5">
                          Set to &apos;false&apos; to disable context caching entirely.
                        </td>
                      </tr>
                      <tr>
                        <td className="text-foreground px-3 py-1.5 font-mono font-semibold">
                          PROXY_CONTEXT_CACHE_MIN_CHARACTERS
                        </td>
                        <td className="text-muted-foreground px-3 py-1.5 font-mono">8192</td>
                        <td className="text-muted-foreground px-3 py-1.5">
                          Minimum static prefix length (characters) to qualify for caching.
                        </td>
                      </tr>
                      <tr>
                        <td className="text-foreground px-3 py-1.5 font-mono font-semibold">
                          PROXY_CONTEXT_CACHE_TTL_SECONDS
                        </td>
                        <td className="text-muted-foreground px-3 py-1.5 font-mono">3600</td>
                        <td className="text-muted-foreground px-3 py-1.5">
                          TTL (in seconds) assigned to provisioned upstream cache resources.
                        </td>
                      </tr>
                      <tr>
                        <td className="text-foreground px-3 py-1.5 font-mono font-semibold">
                          PROXY_CONTEXT_CACHE_LOCATION
                        </td>
                        <td className="text-muted-foreground px-3 py-1.5 font-mono">us-central1</td>
                        <td className="text-muted-foreground px-3 py-1.5">
                          Google Cloud / Vertex AI region for cachedContents endpoints.
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 5: System Prompts */}
        <TabsContent value="prompts" className="mt-0 space-y-3">
          <Card>
            <CardHeader className="bg-muted/20 border-b px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="text-primary size-4" />
                <CardTitle className="text-sm font-semibold">
                  {t('proxy.prompts.title', 'AI Gateway Integration System Prompts')}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {PROMPTS.map((prompt) => (
                  <div
                    key={prompt.id}
                    className="flex flex-col justify-between space-y-2 rounded-md border p-2.5"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between gap-1.5">
                        <h4 className="text-primary text-xs font-semibold">{prompt.title}</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => copyText(prompt.content, prompt.id)}
                        >
                          {copiedSection === prompt.id ? (
                            <CheckCircle2 className="mr-1 size-2.5 text-green-500" />
                          ) : (
                            <Copy className="mr-1 size-2.5" />
                          )}
                          {copiedSection === prompt.id
                            ? t('proxy.copied', 'Copied')
                            : t('proxy.copy', 'Copy')}
                        </Button>
                      </div>
                      <p className="text-muted-foreground text-[11px]">{prompt.desc}</p>
                    </div>
                    <pre className="bg-muted/40 text-muted-foreground line-clamp-3 rounded p-2 font-mono text-[10px]">
                      {prompt.content}
                    </pre>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
