import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { ipc } from '@/ipc/manager';
import type { ServiceConfigSnapshot } from '@/modules/config/service-config.schema';
type ProxyConfig = ServiceConfigSnapshot['proxy'];
import { Copy, Eye, EyeOff, RefreshCw, Zap } from 'lucide-react';
import { ProxyServiceControl } from '@/modules/proxy-gateway/components/ProxyServiceControl';

interface ProxyServiceCardProps {
  proxyConfig: ProxyConfig;
  updateProxyConfig: (newConfig: ProxyConfig) => Promise<void>;
  localIps?: { address: string; name: string; isRecommended: boolean }[];
  selectedIp: string;
  setSelectedIp: (ip: string) => void;
}

export function ProxyServiceCard({
  proxyConfig,
  updateProxyConfig,
  localIps = [],
  selectedIp,
  setSelectedIp,
}: ProxyServiceCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showKey, setShowKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  const updateGatewayPort = (value: string) => {
    const port = Number.parseInt(value, 10);
    const nextPort = Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 8045;
    setGatewayError(null);
    updateProxyConfig({ ...proxyConfig, port: nextPort });
  };

  const copyApiKey = async () => {
    try {
      let keyToCopy = revealedKey;
      if (!keyToCopy) {
        const result = await ipc.client.config.service.revealSecret({ name: 'api-key' });
        keyToCopy = result.value;
        setRevealedKey(result.value);
      }
      if (keyToCopy) {
        await navigator.clipboard.writeText(keyToCopy);
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
        toast({ title: t('proxy.copied', 'Copied to clipboard!') });
      }
    } catch {
      toast({
        title: t('proxy.error', 'Error'),
        description: 'Failed to copy API key',
        variant: 'destructive',
      });
    }
  };

  const toggleShowKey = async () => {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (revealedKey) {
      setShowKey(true);
      return;
    }
    try {
      const result = await ipc.client.config.service.revealSecret({ name: 'api-key' });
      setRevealedKey(result.value);
      setShowKey(true);
    } catch {
      toast({
        title: t('proxy.error', 'Error'),
        description: 'Failed to reveal API key',
        variant: 'destructive',
      });
    }
  };

  const regenerateApiKey = async () => {
    try {
      await ipc.client.config.service.generateKey();
      setRevealedKey(null);
      setShowKey(false);
      setIsRegenerateDialogOpen(false);
      toast({ title: t('proxy.regenerated', 'API key regenerated') });
    } catch {
      toast({
        title: t('proxy.error', 'Error'),
        description: 'Failed to regenerate API key',
        variant: 'destructive',
      });
    }
  };


  return (
    <div className="space-y-3">
      {/* Local Access Banner */}
      {proxyConfig.enabled && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-900 dark:text-blue-200">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
              <Zap className="size-3.5" />
              <span>{t('proxy.config.local_access', 'Local Access:')}</span>
            </div>
            <code className="rounded bg-background/90 px-2 py-0.5 font-mono text-xs font-semibold select-all border border-blue-500/20">
              http://{selectedIp || 'localhost'}:{proxyConfig.port}/v1
            </code>
            {localIps.length > 1 && (
              <Select value={selectedIp} onValueChange={setSelectedIp}>
                <SelectTrigger className="h-6 w-auto min-w-[140px] px-2 text-[11px]">
                  <SelectValue placeholder={t('proxy.config.select_ip', 'Select IP')} />
                </SelectTrigger>
                <SelectContent>
                  {localIps.map((ip) => (
                    <SelectItem key={ip.address} value={ip.address} className="text-xs">
                      {ip.address} ({ip.name}){ip.isRecommended && ' ★'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!proxyConfig.api_key_configured && (!proxyConfig.api_keys || proxyConfig.api_keys.length === 0) && (
            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              {t('proxy.config.no_token_warning', '⚠️ API key is empty. Proxy is open without authentication.')}
            </p>
          )}
        </div>
      )}

      {/* Main Service Card */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-sm font-semibold">{t('proxy.service.title', 'Service Status')}</CardTitle>
              <div className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
                <div
                  className={`size-2 rounded-full ${
                    proxyConfig.enabled ? 'animate-pulse bg-green-500 shadow-[0_0_6px_#22c55e]' : 'bg-muted-foreground/40'
                  }`}
                />
                <span className={proxyConfig.enabled ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-muted-foreground'}>
                  {proxyConfig.enabled
                    ? t('proxy.service.running', 'Running')
                    : t('proxy.service.stopped', 'Stopped')}
                </span>
              </div>
            </div>

            {/* Start/Stop Button directly in Header with risk acknowledgement */}
            <div className="flex items-center">
              <ProxyServiceControl
                config={proxyConfig}
                onConfigChange={updateProxyConfig}
                onError={setGatewayError}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 space-y-3">
          {gatewayError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              {gatewayError}
            </div>
          )}

          {/* Unified Compact Grid: Port, Timeout, API Key */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
            {/* Listen Port */}
            <div className="sm:col-span-3 space-y-1">
              <Label htmlFor="gateway-port" className="text-xs font-medium text-muted-foreground">
                {t('proxy.config.port', 'Listen Port')}
              </Label>
              <Input
                id="gateway-port"
                type="number"
                value={proxyConfig.port}
                min={1024}
                max={65535}
                className="h-8 text-xs font-mono"
                onChange={(e) => updateGatewayPort(e.target.value)}
                disabled={proxyConfig.enabled}
              />
            </div>

            {/* Request Timeout */}
            <div className="sm:col-span-3 space-y-1">
              <Label htmlFor="gateway-timeout" className="text-xs font-medium text-muted-foreground">
                {t('proxy.config.timeout', 'Request Timeout (s)')}
              </Label>
              <Input
                id="gateway-timeout"
                type="number"
                value={proxyConfig.request_timeout}
                className="h-8 text-xs font-mono"
                onChange={(e) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    request_timeout: parseInt(e.target.value) || 120,
                  })
                }
              />
            </div>

            {/* API Key */}
            <div className="sm:col-span-6 space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                {t('proxy.config.api_key', 'API Key (Bearer Auth)')}
              </Label>
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Input
                    value={
                      showKey
                        ? (revealedKey ?? '')
                        : proxyConfig.api_key_configured
                          ? '••••••••••••••••'
                          : ''
                    }
                    readOnly
                    type={showKey ? 'text' : 'password'}
                    className="h-8 pr-8 font-mono text-xs"
                    placeholder="sk-antigravity-..."
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-0 right-0 h-8 w-8 p-0 text-muted-foreground hover:bg-transparent"
                    onClick={toggleShowKey}
                  >
                    {showKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </Button>
                </div>
                <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" onClick={copyApiKey} title="Copy Key">
                  <Copy className="size-3.5" />
                  <span className="ml-1 hidden md:inline">{copiedKey ? t('proxy.copied', 'Copied') : t('proxy.copy', 'Copy')}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setIsRegenerateDialogOpen(true)}
                  title="Regenerate Key"
                >
                  <RefreshCw className="size-3.5" />
                  <span className="ml-1 hidden md:inline">{t('proxy.regenerate', 'Regenerate')}</span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regenerate Confirmation Dialog */}
      <Dialog open={isRegenerateDialogOpen} onOpenChange={setIsRegenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('proxy.regenerateConfirm.title', 'Regenerate API Key?')}</DialogTitle>
            <DialogDescription>
              {t(
                'proxy.regenerateConfirm.description',
                'This will invalidate the current API key immediately. Any active AI clients or IDEs using the old key will need to be updated.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRegenerateDialogOpen(false)}>
              {t('proxy.regenerateConfirm.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" onClick={regenerateApiKey}>
              {t('proxy.regenerateConfirm.confirm', 'Regenerate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
