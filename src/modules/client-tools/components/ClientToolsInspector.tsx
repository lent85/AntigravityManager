import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Activity,
  Check,
  Clock,
  Code,
  Copy,
  ExternalLink,
  FileJson,
  Terminal,
  Zap,
} from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { ExecutionResult } from '../types';

interface ClientToolsInspectorProps {
  executionResult: ExecutionResult | null;
  isLoading?: boolean;
}

export function ClientToolsInspector({
  executionResult,
  isLoading: _isLoading,
}: ClientToolsInspectorProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'response' | 'payload' | 'curl'>('response');
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const handleCopy = (text: string, tabKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tabKey);
    setTimeout(() => setCopiedTab(null), 2000);
  };

  if (!executionResult) {
    return (
      <Card className="flex h-36 items-center justify-center border-dashed p-6 text-center text-muted-foreground text-xs">
        <div className="flex flex-col items-center gap-1.5">
          <Terminal className="size-5 opacity-40" />
          <span>{t('client-tools.inspector.no-data', 'Send a prompt or execute a tool to inspect gateway audit data.')}</span>
        </div>
      </Card>
    );
  }

  const { metrics, rawResponse, requestPayload, curlCommand } = executionResult;
  const rawResponseString = JSON.stringify(rawResponse, null, 2);
  const requestPayloadString = JSON.stringify(requestPayload, null, 2);

  const isSuccess = metrics.status >= 200 && metrics.status < 300;

  return (
    <Card className="overflow-hidden border text-xs shadow-sm">
      {/* Diagnostics / Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* HTTP Status */}
          <Badge
            variant={isSuccess ? 'secondary' : 'destructive'}
            className={
              isSuccess
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]'
                : 'font-mono text-[11px]'
            }
          >
            HTTP {metrics.status} {metrics.statusText}
          </Badge>

          {/* Latency */}
          <div className="flex items-center gap-1 text-muted-foreground font-mono text-[11px]">
            <Clock className="size-3" />
            <span>{metrics.durationMs}ms</span>
            {metrics.timeToFirstTokenMs !== undefined && (
              <span className="text-[10px] text-muted-foreground/80">
                (TTFT: {metrics.timeToFirstTokenMs}ms)
              </span>
            )}
          </div>

          {/* Tokens */}
          {metrics.totalTokens !== undefined && metrics.totalTokens > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground font-mono text-[11px]">
              <Zap className="size-3 text-amber-500" />
              <span>
                {metrics.promptTokens ?? 0} in / {metrics.completionTokens ?? 0} out ({metrics.totalTokens} tok)
              </span>
            </div>
          )}

          {/* Attribution */}
          {metrics.keyName && (
            <Badge variant="outline" className="font-mono text-[10px]">
              Key: {metrics.keyName}
            </Badge>
          )}
        </div>

        {/* Action: Open in Traffic Monitor */}
        <Link
          to="/traffic"
          search={{ page: 0, search: '', tab: 'model' }}
          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
        >
          <Activity className="size-3" />
          <span>{t('client-tools.inspector.view-traffic', 'View in Traffic Monitor')}</span>
          <ExternalLink className="size-3" />
        </Link>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (v === 'response' || v === 'payload' || v === 'curl') {
            setActiveTab(v);
          }
        }}
        className="w-full"
      >
        <div className="flex items-center justify-between border-b px-3 py-1 bg-muted/20">
          <TabsList className="h-7 bg-transparent p-0 gap-1">
            <TabsTrigger
              value="response"
              className="h-6 px-2.5 text-[11px] data-[state=active]:bg-background"
            >
              <FileJson className="mr-1.5 size-3" />
              {t('client-tools.inspector.tab-response', 'Response JSON')}
            </TabsTrigger>
            <TabsTrigger
              value="payload"
              className="h-6 px-2.5 text-[11px] data-[state=active]:bg-background"
            >
              <Code className="mr-1.5 size-3" />
              {t('client-tools.inspector.tab-payload', 'Request Payload')}
            </TabsTrigger>
            <TabsTrigger
              value="curl"
              className="h-6 px-2.5 text-[11px] data-[state=active]:bg-background"
            >
              <Terminal className="mr-1.5 size-3" />
              {t('client-tools.inspector.tab-curl', 'cURL Command')}
            </TabsTrigger>
          </TabsList>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              const textToCopy =
                activeTab === 'response'
                  ? rawResponseString
                  : activeTab === 'payload'
                    ? requestPayloadString
                    : curlCommand;
              handleCopy(textToCopy, activeTab);
            }}
          >
            {copiedTab === activeTab ? (
              <>
                <Check className="size-3 text-emerald-500" />
                <span>{t('common.copied', 'Copied')}</span>
              </>
            ) : (
              <>
                <Copy className="size-3" />
                <span>{t('common.copy', 'Copy')}</span>
              </>
            )}
          </Button>
        </div>

        <TabsContent value="response" className="m-0 p-3">
          <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2.5 font-mono text-[11px] text-foreground border border-border/50">
            {rawResponseString}
          </pre>
        </TabsContent>

        <TabsContent value="payload" className="m-0 p-3">
          <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2.5 font-mono text-[11px] text-foreground border border-border/50">
            {requestPayloadString}
          </pre>
        </TabsContent>

        <TabsContent value="curl" className="m-0 p-3">
          <pre className="max-h-60 overflow-auto rounded bg-muted/40 p-2.5 font-mono text-[11px] text-foreground border border-border/50 whitespace-pre-wrap break-all">
            {curlCommand}
          </pre>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
