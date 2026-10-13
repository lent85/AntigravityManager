/**
 * API Proxy Service Page
 * Modern AI Gateway management with multi-account routing, setup guides, token pricing, and public web portal.
 */
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ipc } from '@/ipc/manager';
import { useEffect, useMemo, useState } from 'react';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import { useCloudAccounts } from '@/modules/cloud-account/hooks/useCloudAccounts';
import type { ServiceConfigSnapshot } from '@/modules/config/service-config.schema';
type ProxyConfig = ServiceConfigSnapshot['proxy'];
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Loader2, Server, BookOpen, DollarSign, Globe, FileText } from 'lucide-react';
import { buildProxyExampleModels } from '@/modules/proxy-gateway/components/proxy-example-models';
import { ProxyServiceCard } from '@/modules/proxy-gateway/components/ProxyServiceCard';
import { ProxyApiKeysCard } from '@/modules/proxy-gateway/components/ProxyApiKeysCard';
import { ProxyAccountRoutingCard } from '@/modules/proxy-gateway/components/ProxyAccountRoutingCard';
import { ProxyDashboardTab } from '@/modules/proxy-gateway/components/ProxyDashboardTab';
import { ProxyLogsTab } from '@/modules/proxy-gateway/components/ProxyLogsTab';
import { ProxyDocsPromptsTab } from '@/modules/proxy-gateway/components/ProxyDocsPromptsTab';
import { ProxyGatewayPricingTab } from '@/modules/proxy-gateway/components/ProxyGatewayPricingTab';
import { ProxyWebPortalTab } from '@/modules/proxy-gateway/components/ProxyWebPortalTab';
import { GlobalSystemPromptCard } from '@/modules/proxy-gateway/components/GlobalSystemPromptCard';
import { AuditAndThoughtStoreCard } from '@/modules/proxy-gateway/components/AuditAndThoughtStoreCard';
import { OpenCodeSyncCard } from '@/modules/proxy-gateway/components/OpenCodeSyncCard';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { FeedbackState } from '@/components/ui/feedback-state';

export const Route = createFileRoute('/proxy')({
  component: ProxyPage,
});

function ProxyPage() {
  const { t } = useTranslation();
  const { config, isLoading, saveConfig, serviceAvailable, serviceLoading, retryService } =
    useAppConfig();
  const { data: cloudAccounts = [] } = useCloudAccounts();

  // Query all available local IPs
  const { data: localIps } = useQuery({
    queryKey: ['system', 'localIps'],
    queryFn: async () => {
      try {
        const ips = await ipc.client.system.get_local_ips();
        return ips as { address: string; name: string; isRecommended: boolean }[];
      } catch (e) {
        console.error('Failed to get local IPs:', e);
        return [{ address: '127.0.0.1', name: 'localhost', isRecommended: false }];
      }
    },
    staleTime: Infinity,
    retry: 3,
  });

  // Selected IP for display (defaults to first recommended or first available)
  const [overrideSelectedIp, setSelectedIp] = useState<string | null>(null);
  const selectedIp =
    overrideSelectedIp ??
    localIps?.find((ip) => ip.isRecommended)?.address ??
    localIps?.[0]?.address ??
    '';

  // Local state for proxyConfig editing
  const [proxyConfig, setProxyConfig] = useState<ProxyConfig | undefined>(undefined);

  // Sync config.proxy to local state when loaded, and check actual server status
  useEffect(() => {
    if (config && serviceAvailable) {
      const syncServerStatus = async () => {
        try {
          const status = await ipc.client.gateway.status();
          const actualEnabled = status.running;

          if (config.proxy.enabled !== actualEnabled) {
            const syncedConfig = { ...config.proxy, enabled: actualEnabled };
            setProxyConfig(syncedConfig);
            await saveConfig({ ...config, proxy: syncedConfig });
          } else {
            setProxyConfig(config.proxy);
          }
        } catch {
          setProxyConfig(config.proxy);
        }
      };
      syncServerStatus();
    }
  }, [config, saveConfig, serviceAvailable]);

  // Helper to update proxyConfig and auto-save
  const updateProxyConfig = async (newProxyConfig: ProxyConfig) => {
    setProxyConfig(newProxyConfig);
    if (config) {
      await saveConfig({ ...config, proxy: newProxyConfig });
    }
  };

  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  useEffect(() => {
    if (proxyConfig?.api_key_configured && !revealedKey) {
      ipc.client.config.service
        .revealSecret({ name: 'api-key' })
        .then((res) => setRevealedKey(res.value))
        .catch(() => {});
    }
  }, [proxyConfig?.api_key_configured, revealedKey]);

  const exampleModels = useMemo(() => buildProxyExampleModels(cloudAccounts), [cloudAccounts]);
  const apiKey = revealedKey || '';
  const port = proxyConfig?.port || 8045;
  const baseUrl = `http://${selectedIp || 'localhost'}:${port}`;

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedClientKeyId, setSelectedClientKeyId] = useState<string | undefined>(undefined);

  const handleViewClientStats = (keyId: string) => {
    setSelectedClientKeyId(keyId);
    setActiveTab('dashboard');
  };

  if (isLoading || serviceLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!serviceAvailable || !proxyConfig) {
    return (
      <FeedbackState
        kind="error"
        title={t('settings.service-unavailable', 'Background Service Unavailable')}
        description={t(
          'settings.service-unavailable-description',
          'The core management service is not responding. Retry or restart the application.',
        )}
      >
        <Button onClick={() => void retryService()}>{t('settings.service-retry', 'Retry')}</Button>
      </FeedbackState>
    );
  }

  return (
    <div className="w-full max-w-none space-y-3 px-3 py-2.5 sm:px-6 sm:py-4">
      {/* Page Header */}
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('proxy.title', 'API Proxy & AI Gateway')}
          </h1>
          <p className="text-muted-foreground text-xs">
            {t(
              'proxy.description',
              'High-performance unified gateway for OpenAI, Anthropic, and Gemini models with multi-account routing.',
            )}
          </p>
        </div>
      </div>
      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
        <TabsList className="grid h-9 w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-6 bg-muted/60 p-0.5">
          <TabsTrigger value="dashboard" className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <Activity className="size-3.5" />
            <span className="truncate">{t('proxy.tabs.dashboard', 'Dashboard & Usage')}</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <FileText className="size-3.5" />
            <span className="truncate">{t('proxy.tabs.logs', 'Request Logs')}</span>
          </TabsTrigger>
          <TabsTrigger value="service" className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <Server className="size-3.5" />
            <span className="truncate">{t('proxy.tabs.service', 'Service & Accounts')}</span>
          </TabsTrigger>
          <TabsTrigger value="guides" className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <BookOpen className="size-3.5" />
            <span className="truncate">{t('proxy.tabs.guides', 'Guides & Prompts')}</span>
          </TabsTrigger>
          <TabsTrigger value="gateway" className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <DollarSign className="size-3.5" />
            <span className="truncate">{t('proxy.tabs.gateway', 'AI Gateway & Pricing')}</span>
          </TabsTrigger>
          <TabsTrigger value="portal" className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium">
            <Globe className="size-3.5" />
            <span className="truncate">{t('proxy.tabs.portal', 'Web Portal & Ngrok')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Real-time Dashboard & Usage Analytics */}
        <TabsContent value="dashboard" className="mt-0 space-y-3">
          <ProxyDashboardTab
            proxyConfig={proxyConfig}
            selectedClientKeyId={selectedClientKeyId}
            onClearSelectedKeyId={() => setSelectedClientKeyId(undefined)}
            onNavigateToLogs={() => setActiveTab('logs')}
          />
        </TabsContent>

        {/* Tab 2: Dedicated Request & Error Logs */}
        <TabsContent value="logs" className="mt-0 space-y-3">
          <ProxyLogsTab
            proxyConfig={proxyConfig}
            selectedClientKeyId={selectedClientKeyId}
            onClearSelectedKeyId={() => setSelectedClientKeyId(undefined)}
          />
        </TabsContent>

        {/* Tab 2: Service, API Keys & Accounts */}
        <TabsContent value="service" className="mt-0 space-y-3">
          <ProxyServiceCard
            proxyConfig={proxyConfig}
            updateProxyConfig={updateProxyConfig}
            localIps={localIps}
            selectedIp={selectedIp}
            setSelectedIp={setSelectedIp}
          />
          <GlobalSystemPromptCard
            config={proxyConfig.global_system_prompt}
            onChange={(global_system_prompt) =>
              updateProxyConfig({ ...proxyConfig, global_system_prompt })
            }
          />
          <AuditAndThoughtStoreCard
            config={proxyConfig}
            onChange={(patch) => updateProxyConfig({ ...proxyConfig, ...patch })}
          />
          <OpenCodeSyncCard baseUrl={baseUrl} models={exampleModels} />

          {/* Experimental Features Card */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">{t('proxy.config.experimental_features', 'Experimental Features')}</h3>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>{t('proxy.config.cloud_code_meta')}</Label>
                <p className="text-xs text-muted-foreground">{t('proxy.config.cloud_code_meta_desc')}</p>
              </div>
              <Switch
                checked={proxyConfig.experimental?.enable_cloud_code_meta ?? false}
                onCheckedChange={(checked) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    experimental: {
                      ...proxyConfig.experimental,
                      enable_cloud_code_meta: checked,
                    },
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="proxy-allow-local-video-paths">
                  {t('proxy.config.allow-local-video-paths')}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t('proxy.config.allow-local-video-paths-desc')}
                </p>
              </div>
              <Switch
                id="proxy-allow-local-video-paths"
                checked={proxyConfig.experimental?.allow_local_video_paths ?? false}
                onCheckedChange={(checked) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    experimental: {
                      ...proxyConfig.experimental,
                      allow_local_video_paths: checked,
                    },
                  })
                }
              />
            </div>
          </div>

          <ProxyApiKeysCard
            proxyConfig={proxyConfig}
            updateProxyConfig={updateProxyConfig}
            onViewClientStats={handleViewClientStats}
          />
          <ProxyAccountRoutingCard
            proxyConfig={proxyConfig}
            updateProxyConfig={updateProxyConfig}
            cloudAccounts={cloudAccounts}
          />
        </TabsContent>

        {/* Tab 3: Guides & Prompts */}
        <TabsContent value="guides" className="space-y-6 mt-0">
          <ProxyDocsPromptsTab
            baseUrl={baseUrl}
            apiKey={apiKey}
            apiKeys={proxyConfig.api_keys}
            models={exampleModels}
          />
        </TabsContent>

        {/* Tab 4: AI Gateway & Pricing */}
        <TabsContent value="gateway" className="space-y-6 mt-0">
          <ProxyGatewayPricingTab
            proxyConfig={proxyConfig}
            updateProxyConfig={updateProxyConfig}
            models={exampleModels}
            baseUrl={baseUrl}
          />
        </TabsContent>

        {/* Tab 5: Web Portal & Ngrok */}
        <TabsContent value="portal" className="space-y-6 mt-0">
          <ProxyWebPortalTab
            proxyConfig={proxyConfig}
            updateProxyConfig={updateProxyConfig}
            selectedIp={selectedIp}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
export default ProxyPage;
