import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ipc } from '@/ipc/manager';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import { useCloudAccounts } from '@/modules/cloud-account/hooks/useCloudAccounts';
import { buildProxyExampleModels } from '@/modules/proxy-gateway/components/proxy-example-models';
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
import { Wrench } from 'lucide-react';
import type {
  ChatMessage,
  ClientToolsConfig,
  ExecutionResult,
  ToolDefinition,
} from '../types';
import { DEFAULT_PRESET_TOOLS } from '../presets/default-tools';
import { executeClientToolsRequest } from '../services/client-tools-runner';
import { ClientToolsConfigPanel } from './ClientToolsConfigPanel';
import { ClientToolsChatArea } from './ClientToolsChatArea';
import { ClientToolsInspector } from './ClientToolsInspector';
import { ToolDefinitionDialog } from './ToolDefinitionDialog';

export function ClientToolsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { config: appConfig } = useAppConfig();
  const { data: cloudAccounts = [] } = useCloudAccounts();

  const exampleModels = useMemo(() => buildProxyExampleModels(cloudAccounts), [cloudAccounts]);
  const defaultPort = appConfig?.proxy?.port || 8045;
  const defaultApiKey = appConfig?.proxy?.api_keys?.[0]?.key || '';
  const configuredApiKeys = useMemo(() => appConfig?.proxy?.api_keys || [], [appConfig]);

  // Query actual gateway running status
  const { data: gatewayStatus, refetch: refetchGatewayStatus } = useQuery({
    queryKey: ['gateway', 'status'],
    queryFn: async () => {
      try {
        return await ipc.client.gateway.status();
      } catch {
        return { running: false, port: defaultPort, base_url: '', active_accounts: 0 };
      }
    },
    refetchInterval: 5000,
  });

  const isGatewayRunning = Boolean(gatewayStatus?.running);

  // Group models for selection
  const { geminiModels, claudeModels, otherModels } = useMemo(() => {
    const gemini: Array<{ id: string; name: string }> = [];
    const claude: Array<{ id: string; name: string }> = [];
    const other: Array<{ id: string; name: string }> = [];

    for (const m of exampleModels) {
      const lower = m.id.toLowerCase();
      if (lower.startsWith('gemini')) {
        gemini.push({ id: m.id, name: m.name });
      } else if (lower.startsWith('claude')) {
        claude.push({ id: m.id, name: m.name });
      } else {
        other.push({ id: m.id, name: m.name });
      }
    }

    if (gemini.length === 0) {
      gemini.push({ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' });
      gemini.push({ id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' });
    }

    return { geminiModels: gemini, claudeModels: claude, otherModels: other };
  }, [exampleModels]);

  // Initial config with sensible defaults
  const [config, setConfig] = useState<ClientToolsConfig>(() => {
    const saved = localStorage.getItem('client-tools-config');
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (typeof parsed === 'object' && parsed !== null) {
          return parsed as ClientToolsConfig;
        }
      } catch {
        // fallback
      }
    }
    return {
      apiKey: defaultApiKey,
      keyId: 'default',
      baseUrl: `http://127.0.0.1:${defaultPort}`,
      model: 'gemini-2.5-flash',
      protocol: 'openai',
      stream: true,
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: 'You are an intelligent assistant capable of calling client tools and functions.',
      jsonMode: false,
      tools: DEFAULT_PRESET_TOOLS,
    };
  });

  // Persist config to localStorage
  useEffect(() => {
    localStorage.setItem('client-tools-config', JSON.stringify(config));
  }, [config]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  // Dialog state for adding/editing tools
  const [toolModalOpen, setToolModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ToolDefinition | null>(null);

  const updateConfig = (patch: Partial<ClientToolsConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleStartGateway = async () => {
    try {
      const result = await ipc.client.gateway.start({ port: defaultPort });
      if (result.success) {
        toast({ title: t('client-tools.gateway.started-toast', 'API Proxy Gateway started successfully!') });
        await refetchGatewayStatus();
      } else {
        toast({
          title: t('client-tools.gateway.start-failed', 'Failed to start Gateway'),
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: t('error.generic', 'Error'),
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleOpenAddTool = () => {
    setEditingTool(null);
    setToolModalOpen(true);
  };

  const handleOpenEditTool = (tool: ToolDefinition) => {
    setEditingTool(tool);
    setToolModalOpen(true);
  };

  const handleSaveTool = (savedTool: ToolDefinition) => {
    setConfig((prev) => {
      const existingIdx = prev.tools.findIndex((t) => t.id === savedTool.id);
      let updatedTools: ToolDefinition[];
      if (existingIdx >= 0) {
        updatedTools = [...prev.tools];
        updatedTools[existingIdx] = savedTool;
      } else {
        updatedTools = [...prev.tools, savedTool];
      }
      return { ...prev, tools: updatedTools };
    });
  };

  const handleDeleteTool = (toolId: string) => {
    setConfig((prev) => ({
      ...prev,
      tools: prev.tools.filter((t) => t.id !== toolId),
    }));
  };

  const handleResetTools = () => {
    setConfig((prev) => ({
      ...prev,
      tools: DEFAULT_PRESET_TOOLS,
    }));
    toast({ title: t('client-tools.tools.reset-done', 'Preset tools reset to defaults') });
  };

  // Run execution
  const runWithMessages = async (msgs: ChatMessage[]) => {
    setIsLoading(true);

    const assistantMsgId = `asst_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages([...msgs, initialAssistantMsg]);

    try {
      const execution = await executeClientToolsRequest(config, msgs, {
        onChunk: ({ contentChunk, thinkingChunk }) => {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.id === assistantMsgId) {
              return [
                ...prev.slice(0, -1),
                {
                  ...last,
                  content: last.content + (contentChunk || ''),
                  thinking: (last.thinking || '') + (thinkingChunk || ''),
                },
              ];
            }
            return prev;
          });
        },
      });

      // Update final message
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === assistantMsgId) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: execution.content,
              tool_calls: execution.toolCalls,
              thinking: execution.thinking,
            },
          ];
        }
        return prev;
      });

      setExecutionResult(execution.result);
    } catch (err: unknown) {
      let errMsg = 'Failed to execute request against API Proxy';
      let resultData: ExecutionResult | null = null;

      if (typeof err === 'object' && err !== null) {
        const errObj = err as Record<string, unknown>;
        if (typeof errObj.message === 'string') {
          errMsg = errObj.message;
        }
        if (typeof errObj.result === 'object' && errObj.result !== null) {
          resultData = errObj.result as ExecutionResult;
        }
      }

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.id === assistantMsgId) {
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              content: `Error: ${errMsg}`,
              isError: true,
            },
          ];
        }
        return prev;
      });

      if (resultData) {
        setExecutionResult(resultData);
      }

      toast({
        title: t('client-tools.chat.error-title', 'Request Failed'),
        description: errMsg,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = (text: string) => {
    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    void runWithMessages(nextMessages);
  };

  const handleSubmitToolResult = (toolCallId: string, toolName: string, result: string) => {
    const toolMsg: ChatMessage = {
      id: `tool_${Date.now()}`,
      role: 'tool',
      tool_call_id: toolCallId,
      name: toolName,
      content: result,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, toolMsg];
    void runWithMessages(nextMessages);
  };

  const handleClearChat = () => {
    setMessages([]);
    setExecutionResult(null);
  };

  const handleCancelRequest = () => {
    setIsLoading(false);
  };

  const handleApplyPromptPreset = (promptText: string) => {
    handleSendMessage(promptText);
  };

  return (
    <div className="w-full max-w-none space-y-3 px-3 py-2.5 sm:px-6 sm:py-4">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Wrench className="size-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl text-foreground">
              {t('client-tools.title', 'Client Tools & Function Playground')}
            </h1>
          </div>
          <p className="text-muted-foreground text-xs mt-0.5">
            {t(
              'client-tools.description',
              'Test function calling, invoke models, and inspect real-time responses through the API Proxy as an external client application.',
            )}
          </p>
        </div>

        {/* Top Header Controls: Model Selector & Protocol */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Model Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
              {t('client-tools.top.model-label', 'Model')}:
            </span>
            <Select
              value={config.model}
              onValueChange={(model) => updateConfig({ model })}
            >
              <SelectTrigger className="h-8 w-64 text-xs font-medium">
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel className="text-[10px] text-muted-foreground">Google Gemini</SelectLabel>
                  {geminiModels.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <span>{m.name || m.id}</span>
                      {m.name && m.name.toLowerCase() !== m.id.toLowerCase() && (
                        <span className="text-[10px] text-muted-foreground font-mono ml-1.5 opacity-75">
                          ({m.id})
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {claudeModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">Anthropic Claude</SelectLabel>
                    {claudeModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        <span>{m.name || m.id}</span>
                        {m.name && m.name.toLowerCase() !== m.id.toLowerCase() && (
                          <span className="text-[10px] text-muted-foreground font-mono ml-1.5 opacity-75">
                            ({m.id})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {otherModels.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] text-muted-foreground">Other Aliases & Models</SelectLabel>
                    {otherModels.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">
                        <span>{m.name || m.id}</span>
                        {m.name && m.name.toLowerCase() !== m.id.toLowerCase() && (
                          <span className="text-[10px] text-muted-foreground font-mono ml-1.5 opacity-75">
                            ({m.id})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Left Column: Config Panel & Tools (4 cols on lg) */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-3">
          <ClientToolsConfigPanel
            config={config}
            onChangeConfig={updateConfig}
            apiKeys={configuredApiKeys}
            defaultApiKey={defaultApiKey}
            isGatewayRunning={isGatewayRunning}
            onStartGateway={handleStartGateway}
            onOpenAddTool={handleOpenAddTool}
            onOpenEditTool={handleOpenEditTool}
            onDeleteTool={handleDeleteTool}
            onResetTools={handleResetTools}
          />
        </div>

        {/* Right Column: Chat Canvas & Inspector (8 cols on lg) */}
        <div className="lg:col-span-8 xl:col-span-8 space-y-3">
          <ClientToolsChatArea
            messages={messages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onSubmitToolResult={handleSubmitToolResult}
            onClearChat={handleClearChat}
            onCancelRequest={handleCancelRequest}
            onApplyPromptPreset={handleApplyPromptPreset}
          />

          <ClientToolsInspector
            executionResult={executionResult}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* Tool Definition Modal */}
      <ToolDefinitionDialog
        open={toolModalOpen}
        onOpenChange={setToolModalOpen}
        tool={editingTool}
        onSave={handleSaveTool}
      />
    </div>
  );
}

export default ClientToolsPage;
