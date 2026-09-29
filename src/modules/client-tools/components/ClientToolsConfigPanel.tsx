import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  EyeOff,
  Key,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sliders,
  Trash2,
  Wrench,
} from 'lucide-react';
import type { ClientToolsConfig, ToolDefinition } from '../types';
import type { ProxyApiKey } from '@/modules/config/types';

interface ClientToolsConfigPanelProps {
  config: ClientToolsConfig;
  onChangeConfig: (patch: Partial<ClientToolsConfig>) => void;
  apiKeys: ProxyApiKey[];
  defaultApiKey: string;
  isGatewayRunning: boolean;
  onStartGateway: () => Promise<void>;
  onOpenAddTool: () => void;
  onOpenEditTool: (tool: ToolDefinition) => void;
  onDeleteTool: (toolId: string) => void;
  onResetTools: () => void;
}

export function ClientToolsConfigPanel({
  config,
  onChangeConfig,
  apiKeys,
  defaultApiKey,
  isGatewayRunning,
  onStartGateway,
  onOpenAddTool,
  onOpenEditTool,
  onDeleteTool,
  onResetTools,
}: ClientToolsConfigPanelProps) {
  const { t } = useTranslation();
  const [showApiKey, setShowApiKey] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      await onStartGateway();
    } finally {
      setIsStarting(false);
    }
  };

  const activeToolsCount = config.tools.filter((t) => t.enabled).length;

  return (
    <div className="space-y-3">
      {/* Gateway & API Key Card */}
      <Card className="border text-xs shadow-sm">
        <CardHeader className="py-2.5 px-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <Key className="size-3.5 text-primary" />
              <span>{t('client-tools.config.connection-title', 'Gateway Connection & Auth')}</span>
            </CardTitle>

            <div className="flex items-center gap-1.5">
              {isGatewayRunning ? (
                <Badge variant="secondary" className="gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px]">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {t('client-tools.gateway.online', 'Online')}
                </Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 px-2 text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30"
                  onClick={handleStart}
                  disabled={isStarting}
                >
                  <Play className="size-2.5 fill-current" />
                  {isStarting ? t('common.starting', 'Starting...') : t('client-tools.gateway.start', 'Start Gateway')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-3 space-y-3">
          {/* Base URL */}
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('client-tools.config.base-url', 'Gateway Base URL')}
            </Label>
            <Input
              value={config.baseUrl}
              onChange={(e) => onChangeConfig({ baseUrl: e.target.value })}
              className="h-7 font-mono text-xs"
              placeholder="http://127.0.0.1:8045"
            />
          </div>

          {/* API Key Selector */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground">
                {t('client-tools.config.api-key', 'API Key (Simulated Client)')}
              </Label>
              <Badge variant="outline" className="text-[9px] px-1 py-0">
                {config.keyId === 'custom'
                  ? t('client-tools.config.custom-key', 'Custom Key')
                  : t('client-tools.config.key-attributed', 'Logged as: {{name}}', { name: config.keyId || 'Default' })}
              </Badge>
            </div>

            <Select
              value={config.keyId}
              onValueChange={(val) => {
                if (val === 'custom') {
                  onChangeConfig({ keyId: 'custom' });
                } else if (val === 'default') {
                  onChangeConfig({ keyId: 'default', apiKey: defaultApiKey });
                } else {
                  const found = apiKeys.find((k) => k.id === val);
                  if (found) {
                    onChangeConfig({ keyId: found.name, apiKey: found.key });
                  }
                }
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select API Key" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default" className="text-xs">
                  {t('client-tools.config.default-client', 'Default Client')} ({defaultApiKey ? '***' + defaultApiKey.slice(-4) : 'Open Mode'})
                </SelectItem>
                {apiKeys.map((k) => (
                  <SelectItem key={k.id} value={k.id} className="text-xs">
                    {k.name} (***{k.key.slice(-4)})
                  </SelectItem>
                ))}
                <SelectItem value="custom" className="text-xs">
                  {t('client-tools.config.enter-custom-key', 'Custom API Key...')}
                </SelectItem>
              </SelectContent>
            </Select>

            {/* If custom or wants to inspect key */}
            <div className="relative mt-1">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => onChangeConfig({ apiKey: e.target.value, keyId: 'custom' })}
                placeholder="sk-..."
                className="h-7 pr-7 font-mono text-xs"
              />
              <button
                type="button"
                className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Model & Generation Parameters Card */}
      <Card className="border text-xs shadow-sm">
        <CardHeader className="py-2.5 px-3 border-b bg-muted/20">
          <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
            <Sliders className="size-3.5 text-primary" />
            <span>{t('client-tools.config.parameters-title', 'Generation Parameters')}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-3 space-y-3">
          {/* Temperature & Max Tokens */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] text-muted-foreground">
                  {t('client-tools.config.temperature', 'Temperature')}
                </Label>
                <span className="font-mono text-[10px]">{config.temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={config.temperature}
                onChange={(e) => onChangeConfig({ temperature: parseFloat(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">
                {t('client-tools.config.max-tokens', 'Max Output')}
              </Label>
              <Input
                type="number"
                min="64"
                max="32768"
                step="256"
                value={config.maxTokens}
                onChange={(e) => onChangeConfig({ maxTokens: parseInt(e.target.value, 10) || 2048 })}
                className="h-7 font-mono text-xs"
              />
            </div>
          </div>

          {/* Streaming & JSON Mode toggles */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] cursor-pointer" htmlFor="stream-toggle">
                {t('client-tools.config.stream-label', 'Stream Response (SSE)')}
              </Label>
              <Switch
                id="stream-toggle"
                checked={config.stream}
                onCheckedChange={(checked) => onChangeConfig({ stream: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-[11px] cursor-pointer" htmlFor="json-mode-toggle">
                {t('client-tools.config.json-mode', 'JSON Object Mode')}
              </Label>
              <Switch
                id="json-mode-toggle"
                checked={config.jsonMode}
                onCheckedChange={(checked) => onChangeConfig({ jsonMode: checked })}
              />
            </div>
          </div>

          {/* System Prompt */}
          <div className="space-y-1 pt-1">
            <Label className="text-[11px] text-muted-foreground">
              {t('client-tools.config.system-prompt', 'System Instructions')}
            </Label>
            <textarea
              rows={2}
              value={config.systemPrompt}
              onChange={(e) => onChangeConfig({ systemPrompt: e.target.value })}
              placeholder={t('client-tools.config.system-prompt-placeholder', 'You are a helpful assistant with function calling capabilities.')}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full resize-y rounded-md border p-2 text-xs focus-visible:ring-2 focus-visible:outline-none"
            />
          </div>
        </CardContent>
      </Card>

      {/* Function / Tools Card */}
      <Card className="border text-xs shadow-sm">
        <CardHeader className="py-2.5 px-3 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wrench className="size-3.5 text-primary" />
              <CardTitle className="text-xs font-semibold">
                {t('client-tools.tools.title', 'Client Tools (Functions)')}
              </CardTitle>
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {activeToolsCount} active
              </Badge>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                title={t('client-tools.tools.reset-defaults', 'Reset default tools')}
                onClick={onResetTools}
              >
                <RefreshCw className="size-3" />
              </Button>
              <Button
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={onOpenAddTool}
              >
                <Plus className="size-3" />
                <span>{t('client-tools.tools.add-tool', 'Add Tool')}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-2 space-y-1.5">
          {config.tools.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-xs">
              {t('client-tools.tools.no-tools', 'No functions defined. Click "Add Tool" or reset presets.')}
            </div>
          ) : (
            config.tools.map((tool) => (
              <div
                key={tool.id}
                className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 p-2 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                  <Switch
                    checked={tool.enabled}
                    onCheckedChange={(checked) => {
                      const updated = config.tools.map((t) =>
                        t.id === tool.id ? { ...t, enabled: checked } : t,
                      );
                      onChangeConfig({ tools: updated });
                    }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-medium text-xs truncate text-foreground">
                        {tool.name}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate max-w-xs">
                      {tool.description || 'No description provided'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => onOpenEditTool(tool)}
                  >
                    <Settings2 className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-destructive/70 hover:text-destructive"
                    onClick={() => onDeleteTool(tool.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
