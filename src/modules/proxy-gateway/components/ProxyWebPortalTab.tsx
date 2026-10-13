import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import type { ServiceConfigSnapshot } from '@/modules/config/service-config.schema';
type ProxyConfig = ServiceConfigSnapshot['proxy'];
import { Globe, ExternalLink, Copy, CheckCircle2, Shield, Network, Terminal } from 'lucide-react';

interface ProxyWebPortalTabProps {
  proxyConfig: ProxyConfig;
  updateProxyConfig: (newConfig: ProxyConfig) => Promise<void>;
  selectedIp: string;
}

export function ProxyWebPortalTab({
  proxyConfig,
  updateProxyConfig,
  selectedIp,
}: ProxyWebPortalTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const port = proxyConfig.port || 8045;
  const localPortalUrl = `http://localhost:${port}`;
  const lanPortalUrl = `http://${selectedIp || '127.0.0.1'}:${port}`;

  const openPortal = () => {
    window.open(localPortalUrl, '_blank');
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: t('proxy.copied', 'Copied URL to clipboard!') });
  };

  return (
    <div className="space-y-3">
      {/* Portal Activation Card */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                {t('proxy.portal.title', 'Public Web Landing Portal')}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="portal-enabled" className="text-xs font-medium text-muted-foreground">
                {proxyConfig.public_landing_enabled
                  ? t('proxy.portal.enabled', 'Portal Enabled')
                  : t('proxy.portal.disabled', 'Portal Disabled')}
              </Label>
              <Switch
                id="portal-enabled"
                checked={proxyConfig.public_landing_enabled}
                onCheckedChange={(checked) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    public_landing_enabled: checked,
                  })
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 space-y-3">
          {/* Quick Access URLs */}
          <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <h4 className="font-semibold text-xs">Access Home URLs</h4>
                <p className="text-[11px] text-muted-foreground">
                  Interactive documentation dashboard and live model directory.
                </p>
              </div>
              <Button onClick={openPortal} size="sm" className="h-7 px-2.5 text-xs" disabled={!proxyConfig.enabled}>
                <ExternalLink className="mr-1 size-3.5" />
                {t('proxy.portal.open_browser', 'Open Web Portal')}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-md bg-background p-2 border">
                <div className="overflow-hidden min-w-0">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">Localhost</span>
                  <code className="text-xs font-semibold truncate block">{localPortalUrl}</code>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyUrl(localPortalUrl)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-md bg-background p-2 border">
                <div className="overflow-hidden min-w-0">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block">LAN Network</span>
                  <code className="text-xs font-semibold truncate block">{lanPortalUrl}</code>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => copyUrl(lanPortalUrl)}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Portal Branding Customization */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="portal-title" className="text-xs font-medium text-muted-foreground">
                {t('proxy.portal.custom_title', 'Portal Header Title')}
              </Label>
              <Input
                id="portal-title"
                className="h-8 text-xs"
                value={proxyConfig.public_landing_title || ''}
                placeholder="Antigravity AI Gateway"
                onChange={(e) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    public_landing_title: e.target.value,
                  })
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="portal-desc" className="text-xs font-medium text-muted-foreground">
                {t('proxy.portal.custom_desc', 'Portal Subtitle / Description')}
              </Label>
              <Input
                id="portal-desc"
                className="h-8 text-xs"
                value={proxyConfig.public_landing_description || ''}
                placeholder="High-performance OpenAI, Anthropic & Gemini unified proxy gateway"
                onChange={(e) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    public_landing_description: e.target.value,
                  })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ngrok & Public Tunneling Guide */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              {t('proxy.portal.tunnel_title', 'Expose Gateway with Ngrok or Cloudflare')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 space-y-2.5">
          <div className="rounded-md border p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-xs">Option 1: Ngrok Tunnel</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => copyUrl(`ngrok http ${port}`)}
              >
                <Copy className="mr-1 size-3" />
                Copy Command
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Run this in terminal to expose an HTTPS URL directly to your Web Portal & OpenAI APIs.
            </p>
            <pre className="rounded bg-muted/50 p-1.5 font-mono text-[11px] text-foreground">
              ngrok http {port}
            </pre>
          </div>

          <div className="rounded-md border p-2.5 space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-xs">Option 2: Cloudflare Tunnel</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => copyUrl(`cloudflared tunnel --url http://localhost:${port}`)}
              >
                <Copy className="mr-1 size-3" />
                Copy Command
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Create a free temporary Cloudflare tunnel without authentication:
            </p>
            <pre className="rounded bg-muted/50 p-1.5 font-mono text-[11px] text-foreground">
              cloudflared tunnel --url http://localhost:{port}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
