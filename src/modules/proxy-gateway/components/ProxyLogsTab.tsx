import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc } from '@/ipc/manager';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { ProxyConfig } from '@/modules/config/types';
import type {
  ProxyUsageRecord,
  ProxyUsageStatsResult,
  UsageTimeRange,
} from '../server/shared/services/proxy-usage.types';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Check,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  Trash2,
  UserCheck,
  XCircle,
  Zap,
} from 'lucide-react';

interface ProxyLogsTabProps {
  proxyConfig: ProxyConfig;
  selectedClientKeyId?: string;
  onClearSelectedKeyId?: () => void;
}

type StatusCategory = 'all' | 'success' | 'error' | 'auth';

export function ProxyLogsTab({
  proxyConfig,
  selectedClientKeyId,
  onClearSelectedKeyId,
}: ProxyLogsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [timeRange, setTimeRange] = useState<UsageTimeRange>('24h');
  const [statusFilter, setStatusFilter] = useState<StatusCategory>('all');
  const [clientFilter, setClientFilter] = useState<string>(selectedClientKeyId || 'all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [protocolFilter, setProtocolFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Pagination
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(50);

  // Modals & Interactivity
  const [selectedLogRecord, setSelectedLogRecord] = useState<ProxyUsageRecord | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState<boolean>(false);
  const [copiedLogId, setCopiedLogId] = useState<number | null>(null);

  // Sync external client filter if provided
  useEffect(() => {
    if (selectedClientKeyId) {
      setClientFilter(selectedClientKeyId);
      setPageIndex(0);
    }
  }, [selectedClientKeyId]);

  // Reset page index on filter change
  useEffect(() => {
    setPageIndex(0);
  }, [timeRange, statusFilter, clientFilter, accountFilter, modelFilter, protocolFilter]);

  const effectiveKeyId = clientFilter !== 'all' ? clientFilter : undefined;
  const effectiveAccountId = accountFilter !== 'all' ? accountFilter : undefined;
  const effectiveModel = modelFilter !== 'all' ? modelFilter : undefined;
  const effectiveStatus = statusFilter !== 'all' ? statusFilter : undefined;

  // Query usage stats for the quick metric summary
  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ['proxy', 'logsTabStats', timeRange, effectiveKeyId, effectiveAccountId],
    queryFn: async () => {
      try {
        const res = await ipc.client.gateway.usageStats({
          timeRange,
          keyId: effectiveKeyId,
          accountId: effectiveAccountId,
        });
        return res as ProxyUsageStatsResult;
      } catch (err) {
        console.error('Failed to load usage stats:', err);
        return null;
      }
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  // Query paginated access logs
  const {
    data: logsData,
    isLoading: isLogsLoading,
    isRefetching: isLogsRefetching,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: [
      'proxy',
      'detailedAccessLogs',
      timeRange,
      effectiveKeyId,
      effectiveAccountId,
      effectiveModel,
      effectiveStatus,
      pageSize,
      pageIndex,
    ],
    queryFn: async () => {
      try {
        const res = await ipc.client.gateway.accessLogs({
          timeRange,
          keyId: effectiveKeyId,
          accountId: effectiveAccountId,
          model: effectiveModel,
          status: effectiveStatus,
          limit: pageSize,
          offset: pageIndex * pageSize,
        });
        return res as { total: number; logs: ProxyUsageRecord[] };
      } catch (err) {
        console.error('Failed to load access logs:', err);
        return { total: 0, logs: [] };
      }
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const rawLogs = logsData?.logs || [];
  const totalCount = logsData?.total || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Client-side text search & protocol filtering
  const displayLogs = useMemo(() => {
    let result = rawLogs;

    if (protocolFilter !== 'all') {
      result = result.filter((l) => l.protocol?.toLowerCase() === protocolFilter.toLowerCase());
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (log) =>
          log.keyName?.toLowerCase().includes(q) ||
          log.accountEmail?.toLowerCase().includes(q) ||
          log.accountId?.toLowerCase().includes(q) ||
          log.model?.toLowerCase().includes(q) ||
          log.endpoint?.toLowerCase().includes(q) ||
          log.errorMessage?.toLowerCase().includes(q) ||
          log.ip?.toLowerCase().includes(q) ||
          String(log.statusCode).includes(q) ||
          log.protocol?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [rawLogs, protocolFilter, searchQuery]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([refetchStats(), refetchLogs()]);
    toast({ title: t('proxy.logs.refreshed', 'Logs refreshed') });
  }, [refetchStats, refetchLogs, t, toast]);

  const handleClearLogs = async () => {
    try {
      await ipc.client.gateway.clearUsage();
      setIsClearDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['proxy'] });
      toast({ title: t('proxy.logs.cleared', 'All proxy logs cleared') });
    } catch {
      toast({
        title: t('proxy.error', 'Error'),
        description: 'Failed to clear logs',
        variant: 'destructive',
      });
    }
  };

  const handleCopyJson = (record: ProxyUsageRecord) => {
    navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopiedLogId(record.id);
    toast({ title: t('proxy.logs.copied_json', 'Log details copied to clipboard') });
    setTimeout(() => setCopiedLogId(null), 2000);
  };

  // Formatters
  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return tokens.toLocaleString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const getModelBadge = (model: string | null) => {
    if (!model) return <span className="text-muted-foreground">-</span>;
    const m = model.toLowerCase();
    let style = 'bg-muted text-muted-foreground border-border';
    if (m.includes('claude')) {
      style = 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30';
    } else if (m.includes('gemini')) {
      style = 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30';
    } else if (m.includes('gpt') || m.includes('o1') || m.includes('o3') || m.includes('davinci')) {
      style = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';
    }
    return (
      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono border truncate max-w-[130px] ${style}`} title={model}>
        {model}
      </span>
    );
  };

  const getStatusBadge = (code: number) => {
    if (code >= 200 && code < 300) {
      return (
        <Badge
          variant="outline"
          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-mono text-[10px] px-1.5 py-0 h-4 flex items-center gap-1"
        >
          <CheckCircle2 className="size-2.5" />
          <span>{code} OK</span>
        </Badge>
      );
    }
    if (code === 401 || code === 403) {
      return (
        <Badge
          variant="outline"
          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-mono text-[10px] px-1.5 py-0 h-4 flex items-center gap-1"
        >
          <ShieldAlert className="size-2.5" />
          <span>{code} Auth</span>
        </Badge>
      );
    }
    if (code === 429) {
      return (
        <Badge
          variant="outline"
          className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-mono text-[10px] px-1.5 py-0 h-4 flex items-center gap-1"
        >
          <AlertCircle className="size-2.5" />
          <span>429 Quota</span>
        </Badge>
      );
    }
    return (
      <Badge
        variant="outline"
        className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-mono text-[10px] px-1.5 py-0 h-4 flex items-center gap-1"
      >
        <XCircle className="size-2.5" />
        <span>{code} Err</span>
      </Badge>
    );
  };

  const summary = statsData?.summary;
  const successCount = summary?.successRequests || 0;
  const failedCount = summary?.failedRequests || 0;
  const totalRequests = summary?.totalRequests || 0;
  const successRate = totalRequests > 0 ? ((successCount / totalRequests) * 100).toFixed(1) : '100.0';

  return (
    <div className="space-y-3">
      {/* Top Quick Status Bar */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {/* Metric 1: Total Requests */}
        <div className="rounded-lg border bg-card p-2.5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">
              {t('proxy.logs.total_requests', 'Total Requests')}
            </div>
            <div className="text-lg font-bold tracking-tight">{totalRequests.toLocaleString()}</div>
          </div>
          <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
            <Activity className="size-4" />
          </div>
        </div>

        {/* Metric 2: Successful Requests */}
        <div className="rounded-lg border bg-card p-2.5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
              <CheckCircle2 className="size-3" />
              {t('proxy.logs.successful', 'Successful (2xx)')}
            </div>
            <div className="text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {successCount.toLocaleString()}{' '}
              <span className="text-xs font-normal text-muted-foreground">({successRate}%)</span>
            </div>
          </div>
          <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Zap className="size-4" />
          </div>
        </div>

        {/* Metric 3: Failed Requests */}
        <div className="rounded-lg border bg-card p-2.5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
              <XCircle className="size-3" />
              {t('proxy.logs.failed', 'Failed / Errors')}
            </div>
            <div className="text-lg font-bold tracking-tight text-red-600 dark:text-red-400">
              {failedCount.toLocaleString()}
            </div>
          </div>
          <div className="rounded-md bg-red-500/10 p-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="size-4" />
          </div>
        </div>

        {/* Metric 4: Avg Latency */}
        <div className="rounded-lg border bg-card p-2.5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] text-muted-foreground font-medium">
              {t('proxy.logs.avg_latency', 'Avg Latency')}
            </div>
            <div className="text-lg font-bold tracking-tight">
              {summary ? formatDuration(summary.avgDurationMs) : '0ms'}
            </div>
          </div>
          <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">
            <Clock className="size-4" />
          </div>
        </div>
      </div>

      {/* Main Filter & Action Toolbar */}
      <Card className="shadow-xs">
        <CardHeader className="py-2.5 px-3 sm:px-4 border-b bg-muted/20">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Status Category Segmented Filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="inline-flex rounded-md bg-muted/60 p-0.5 border text-xs">
                <button
                  type="button"
                  className={`rounded px-2.5 py-1 font-medium transition-colors ${
                    statusFilter === 'all'
                      ? 'bg-background text-foreground shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setStatusFilter('all')}
                >
                  {t('proxy.logs.all_status', 'All Requests')}
                </button>
                <button
                  type="button"
                  className={`rounded px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                    statusFilter === 'success'
                      ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-emerald-600'
                  }`}
                  onClick={() => setStatusFilter('success')}
                >
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  <span>{t('proxy.logs.only_success', 'Success (2xx)')}</span>
                </button>
                <button
                  type="button"
                  className={`rounded px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                    statusFilter === 'error'
                      ? 'bg-red-500/20 text-red-700 dark:text-red-300 shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-red-600'
                  }`}
                  onClick={() => setStatusFilter('error')}
                >
                  <XCircle className="size-3 text-red-500" />
                  <span>{t('proxy.logs.only_errors', 'Errors (4xx/5xx)')}</span>
                </button>
                <button
                  type="button"
                  className={`rounded px-2.5 py-1 font-medium transition-colors flex items-center gap-1 ${
                    statusFilter === 'auth'
                      ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 shadow-xs font-semibold'
                      : 'text-muted-foreground hover:text-amber-600'
                  }`}
                  onClick={() => setStatusFilter('auth')}
                >
                  <ShieldAlert className="size-3 text-amber-500" />
                  <span>{t('proxy.logs.only_auth', 'Auth (401/403)')}</span>
                </button>
              </div>

              {/* Time Range Pills */}
              <div className="inline-flex rounded-md bg-muted/60 p-0.5 border text-xs">
                {(['today', '24h', '7d', '30d', 'all'] as UsageTimeRange[]).map((range) => (
                  <button
                    key={range}
                    type="button"
                    className={`rounded px-2 py-1 font-medium transition-colors ${
                      timeRange === range
                        ? 'bg-background text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setTimeRange(range)}
                  >
                    {range === 'today'
                      ? t('proxy.dashboard.today', 'Today')
                      : range === '24h'
                        ? '24h'
                        : range === '7d'
                          ? '7d'
                          : range === '30d'
                            ? '30d'
                            : t('proxy.dashboard.all', 'All')}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Auto-Refresh & Actions */}
            <div className="flex items-center gap-2 self-end lg:self-auto">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2 py-1 rounded-md border">
                <span className="text-[11px]">{t('proxy.logs.live_auto', 'Live (10s)')}</span>
                <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1"
                onClick={handleRefresh}
                disabled={isLogsRefetching}
              >
                <RefreshCw className={`size-3 ${isLogsRefetching ? 'animate-spin' : ''}`} />
                <span>{t('common.refresh', 'Refresh')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => setIsClearDialogOpen(true)}
                title={t('proxy.logs.clear_tooltip', 'Clear all recorded logs')}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>

          {/* Secondary Filter Row: Client, Account, Protocol, Search */}
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 pt-2 border-t">
            {/* Filter: Client Key */}
            <div className="flex items-center gap-1.5">
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="h-7 text-xs w-full">
                  <Filter className="size-3 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder={t('proxy.dashboard.all_clients', 'All Clients')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    {t('proxy.dashboard.all_clients', 'All Clients')}
                  </SelectItem>
                  {(proxyConfig.api_keys || []).map((k) => (
                    <SelectItem key={k.id} value={k.id} className="text-xs">
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {clientFilter !== 'all' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[10px] text-muted-foreground"
                  onClick={() => {
                    setClientFilter('all');
                    onClearSelectedKeyId?.();
                  }}
                >
                  Reset
                </Button>
              )}
            </div>

            {/* Filter: Cloud Account */}
            <div className="flex items-center gap-1.5">
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger className="h-7 text-xs w-full">
                  <UserCheck className="size-3 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder={t('proxy.dashboard.all_accounts', 'All Accounts')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    {t('proxy.dashboard.all_accounts', 'All Accounts')}
                  </SelectItem>
                  {(statsData?.accountBreakdown || []).map((acc) => (
                    <SelectItem key={acc.accountId} value={acc.accountId} className="text-xs">
                      {acc.accountEmail || acc.accountId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountFilter !== 'all' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-1.5 text-[10px] text-muted-foreground"
                  onClick={() => setAccountFilter('all')}
                >
                  Reset
                </Button>
              )}
            </div>

            {/* Filter: Protocol */}
            <Select value={protocolFilter} onValueChange={setProtocolFilter}>
              <SelectTrigger className="h-7 text-xs w-full">
                <Terminal className="size-3 mr-1 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All Protocols" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Protocols</SelectItem>
                <SelectItem value="openai" className="text-xs">OpenAI</SelectItem>
                <SelectItem value="anthropic" className="text-xs">Anthropic</SelectItem>
                <SelectItem value="gemini" className="text-xs">Gemini</SelectItem>
              </SelectContent>
            </Select>

            {/* Filter: Search Query */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-3 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('proxy.logs.search_placeholder', 'Search endpoint, model, error...')}
                className="h-7 pl-7 text-xs"
              />
            </div>
          </div>
        </CardHeader>

        {/* Request Logs Table */}
        <CardContent className="p-0">
          {displayLogs.length === 0 ? (
            <div className="p-12 text-center text-xs text-muted-foreground">
              {isLogsLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="size-5 animate-spin text-primary" />
                  <span>{t('proxy.logs.loading', 'Loading request logs...')}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <FileText className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="font-medium text-sm text-foreground">
                    {t('proxy.logs.no_logs_found', 'No request logs found')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'proxy.logs.no_logs_hint',
                      'No requests match your current filters, or no traffic has been received by the proxy yet.',
                    )}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[580px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b sticky top-0 bg-background z-10 backdrop-blur-xs">
                  <tr>
                    <th className="px-3 py-2 w-20 text-center">Status</th>
                    <th className="px-3 py-2 w-20">Time</th>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Client App</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2 text-right">Latency</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2">Error / Diagnostic</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]">
                  {displayLogs.map((log) => {
                    const isError = log.statusCode >= 400;
                    return (
                      <tr
                        key={log.id}
                        className={`transition-colors cursor-pointer hover:bg-muted/40 ${
                          isError ? 'bg-red-500/[0.03]' : ''
                        }`}
                        onClick={() => setSelectedLogRecord(log)}
                      >
                        {/* Status */}
                        <td className="px-3 py-2 text-center">{getStatusBadge(log.statusCode)}</td>

                        {/* Time */}
                        <td className="px-3 py-2 text-muted-foreground font-mono" title={new Date(log.timestamp).toISOString()}>
                          {formatTime(log.timestamp)}
                        </td>

                        {/* Endpoint */}
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 max-w-[170px]" title={log.endpoint}>
                            <Badge variant="secondary" className="font-mono text-[9px] px-1 py-0 uppercase shrink-0">
                              {log.protocol}
                            </Badge>
                            <span className="truncate text-foreground font-sans font-medium text-xs">
                              {log.endpoint}
                            </span>
                          </div>
                        </td>

                        {/* Model */}
                        <td className="px-3 py-2">{getModelBadge(log.model)}</td>

                        {/* Client App */}
                        <td className="px-3 py-2 font-sans font-medium text-xs">
                          <span className="truncate max-w-[120px] block" title={log.keyName || 'Unknown Client'}>
                            {log.keyName || 'Unknown Client'}
                          </span>
                        </td>

                        {/* Account */}
                        <td className="px-3 py-2 font-sans text-xs">
                          {log.accountEmail ? (
                            <div className="flex items-center gap-1 max-w-[140px]" title={log.accountEmail}>
                              <UserCheck className="size-3 text-teal-500 shrink-0" />
                              <span className="truncate text-muted-foreground">{log.accountEmail}</span>
                            </div>
                          ) : log.accountId ? (
                            <span className="truncate max-w-[100px] block font-mono text-[10px] text-muted-foreground" title={log.accountId}>
                              {log.accountId}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* Latency */}
                        <td className="px-3 py-2 text-right">{formatDuration(log.durationMs)}</td>

                        {/* Tokens */}
                        <td className="px-3 py-2 text-right">
                          {log.totalTokens > 0 ? (
                            <span title={`Prompt: ${log.promptTokens} / Completion: ${log.completionTokens}`}>
                              {formatTokens(log.totalTokens)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>

                        {/* Error / Diagnostic snippet */}
                        <td className="px-3 py-2 font-sans">
                          {log.errorMessage ? (
                            <div className="flex items-center gap-1 text-red-500 max-w-[220px]" title={log.errorMessage}>
                              <AlertCircle className="size-3 shrink-0" />
                              <span className="truncate text-[11px] font-medium">{log.errorMessage}</span>
                            </div>
                          ) : isError ? (
                            <span className="text-red-500 text-[11px]">HTTP {log.statusCode} Error</span>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">-</span>
                          )}
                        </td>

                        {/* Action Details */}
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLogRecord(log);
                            }}
                          >
                            <ChevronRight className="size-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-2.5 border-t bg-muted/10 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>
                {t('proxy.logs.showing', 'Showing')}{' '}
                <strong className="text-foreground">
                  {totalCount === 0 ? 0 : pageIndex * pageSize + 1}-
                  {Math.min((pageIndex + 1) * pageSize, totalCount)}
                </strong>{' '}
                {t('proxy.logs.of', 'of')} <strong className="text-foreground">{totalCount}</strong>{' '}
                {t('proxy.logs.records', 'requests')}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val));
                  setPageIndex(0);
                }}
              >
                <SelectTrigger className="h-6 w-16 text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25" className="text-xs">25</SelectItem>
                  <SelectItem value="50" className="text-xs">50</SelectItem>
                  <SelectItem value="100" className="text-xs">100</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Page navigation buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={pageIndex === 0 || isLogsLoading}
                onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="size-3 mr-1" />
                <span>{t('common.previous', 'Previous')}</span>
              </Button>
              <span className="px-2 font-mono text-xs">
                {pageIndex + 1} / {Math.max(1, totalPages)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={pageIndex + 1 >= totalPages || isLogsLoading}
                onClick={() => setPageIndex((p) => p + 1)}
              >
                <span>{t('common.next', 'Next')}</span>
                <ChevronRight className="size-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLogRecord} onOpenChange={(open) => !open && setSelectedLogRecord(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-4">
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4 text-primary" />
                <span>{t('proxy.logs.detail_title', 'Request & Response Diagnostic')}</span>
              </DialogTitle>
              {selectedLogRecord && getStatusBadge(selectedLogRecord.statusCode)}
            </div>
            <DialogDescription className="text-xs">
              {t('proxy.logs.detail_desc', 'Complete metadata, token accounting, and response diagnostics.')}
            </DialogDescription>
          </DialogHeader>

          {selectedLogRecord && (
            <div className="space-y-3 py-2 text-xs">
              {/* Error banner if failed */}
              {selectedLogRecord.statusCode >= 400 && (
                <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-red-600 dark:text-red-400">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>Response Failed (HTTP {selectedLogRecord.statusCode})</span>
                  </div>
                  {selectedLogRecord.errorMessage ? (
                    <p className="text-red-700 dark:text-red-300 font-mono text-[11px] break-all">
                      {selectedLogRecord.errorMessage}
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-[11px]">
                      No detailed error message was returned by the upstream service.
                    </p>
                  )}
                </div>
              )}

              {/* Main Metadata Grid */}
              <div className="grid grid-cols-2 gap-2 border p-3 rounded-md bg-muted/20">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">
                    Client App
                  </span>
                  <span className="font-semibold text-xs">{selectedLogRecord.keyName || 'Unknown'}</span>
                  {selectedLogRecord.keyId && (
                    <span className="font-mono text-[10px] text-muted-foreground block">
                      ID: {selectedLogRecord.keyId}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">
                    Cloud Account
                  </span>
                  <span className="font-semibold text-xs truncate block" title={selectedLogRecord.accountEmail || 'N/A'}>
                    {selectedLogRecord.accountEmail || selectedLogRecord.accountId || 'N/A'}
                  </span>
                  {selectedLogRecord.accountId && (
                    <span className="font-mono text-[10px] text-muted-foreground block truncate">
                      ID: {selectedLogRecord.accountId}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">Model</span>
                  <div className="mt-0.5">{getModelBadge(selectedLogRecord.model)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">Protocol</span>
                  <span className="font-mono text-xs uppercase">{selectedLogRecord.protocol}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">Duration</span>
                  <span className="font-mono text-xs font-semibold">{formatDuration(selectedLogRecord.durationMs)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase font-semibold block">Timestamp</span>
                  <span className="font-mono text-[11px]">{new Date(selectedLogRecord.timestamp).toLocaleString()}</span>
                </div>
              </div>

              {/* Token Usage & Cost Diagnostic */}
              <div className="border p-3 rounded-md space-y-1.5 font-mono text-[11px]">
                <div className="font-sans font-semibold text-xs text-foreground pb-1 border-b flex items-center justify-between">
                  <span>Token Accounting</span>
                  {selectedLogRecord.cost > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Est. Cost: {formatCost(selectedLogRecord.cost)}
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prompt Tokens:</span>
                  <span>{selectedLogRecord.promptTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completion Tokens:</span>
                  <span>{selectedLogRecord.completionTokens.toLocaleString()}</span>
                </div>
                {selectedLogRecord.cachedTokens > 0 && (
                  <div className="flex justify-between text-blue-600 dark:text-blue-400">
                    <span>Cached Tokens:</span>
                    <span>{selectedLogRecord.cachedTokens.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total Tokens:</span>
                  <span>{selectedLogRecord.totalTokens.toLocaleString()}</span>
                </div>
              </div>

              {/* Network & Client Diagnostics */}
              <div className="border p-3 rounded-md space-y-1 font-mono text-[11px] bg-muted/10">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <span className="font-semibold">{selectedLogRecord.endpoint}</span>
                </div>
                {selectedLogRecord.ip && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client IP:</span>
                    <span>{selectedLogRecord.ip}</span>
                  </div>
                )}
                {selectedLogRecord.userAgent && (
                  <div className="text-[10px] text-muted-foreground break-all pt-1 border-t">
                    User-Agent: {selectedLogRecord.userAgent}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            {selectedLogRecord && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => handleCopyJson(selectedLogRecord)}
              >
                {copiedLogId === selectedLogRecord.id ? (
                  <Check className="size-3 text-emerald-500" />
                ) : (
                  <Copy className="size-3" />
                )}
                <span>{copiedLogId === selectedLogRecord.id ? 'Copied JSON' : 'Copy Log JSON'}</span>
              </Button>
            )}
            <Button size="sm" onClick={() => setSelectedLogRecord(null)}>
              {t('common.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Logs Confirmation Dialog */}
      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-4 text-destructive" />
              <span>{t('proxy.logs.clear_confirm_title', 'Clear All Request Logs?')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t(
                'proxy.logs.clear_confirm_desc',
                'This will permanently wipe all recorded request access logs and metrics from SQLite. This action cannot be undone.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsClearDialogOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearLogs}>
              {t('common.confirm', 'Confirm Clear')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
