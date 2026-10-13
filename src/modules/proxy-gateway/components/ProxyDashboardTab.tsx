import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ipc } from '@/ipc/manager';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { ServiceConfigSnapshot } from '@/modules/config/service-config.schema';
type ProxyConfig = ServiceConfigSnapshot['proxy'];
import type {
  ProxyUsageRecord,
  ProxyUsageStatsResult,
  UsageTimeRange,
} from '../server/shared/services/proxy-usage.types';
import {
  Activity,
  Layers,
  DollarSign,
  Clock,
  RefreshCw,
  Trash2,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AppWindow,
  Cpu,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Info,
  Server,
  Zap,
  UserCheck,
  Users,
  ArrowRight,
} from 'lucide-react';

interface ProxyDashboardTabProps {
  proxyConfig: ProxyConfig;
  selectedClientKeyId?: string;
  onClearSelectedKeyId?: () => void;
  onNavigateToLogs?: () => void;
}

export function ProxyDashboardTab({
  proxyConfig,
  selectedClientKeyId,
  onClearSelectedKeyId,
  onNavigateToLogs,
}: ProxyDashboardTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [timeRange, setTimeRange] = useState<UsageTimeRange>('24h');
  const [clientFilter, setClientFilter] = useState<string>(selectedClientKeyId || 'all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [searchLogText, setSearchLogText] = useState<string>('');

  // Modals
  const [isClearDialogOpen, setIsClearDialogOpen] = useState<boolean>(false);
  const [selectedLogRecord, setSelectedLogRecord] = useState<ProxyUsageRecord | null>(null);

  // Sync external client filter if provided
  useEffect(() => {
    if (selectedClientKeyId) {
      setClientFilter(selectedClientKeyId);
    }
  }, [selectedClientKeyId]);

  // Query usage stats
  const effectiveKeyId = clientFilter !== 'all' ? clientFilter : undefined;
  const effectiveAccountId = accountFilter !== 'all' ? accountFilter : undefined;

  const {
    data: statsData,
    isLoading: isStatsLoading,
    refetch: refetchStats,
    isRefetching: isStatsRefetching,
  } = useQuery({
    queryKey: ['proxy', 'usageStats', timeRange, effectiveKeyId, effectiveAccountId],
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
    refetchInterval: autoRefresh ? 15000 : false,
  });

  // Query access logs
  const {
    data: logsData,
    isLoading: isLogsLoading,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ['proxy', 'accessLogs', timeRange, effectiveKeyId, effectiveAccountId],
    queryFn: async () => {
      try {
        const res = await ipc.client.gateway.accessLogs({
          timeRange,
          keyId: effectiveKeyId,
          accountId: effectiveAccountId,
          limit: 100,
        });
        return res as { total: number; logs: ProxyUsageRecord[] };
      } catch (err) {
        console.error('Failed to load access logs:', err);
        return { total: 0, logs: [] };
      }
    },
    refetchInterval: autoRefresh ? 15000 : false,
  });

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([refetchStats(), refetchLogs()]);
    toast({ title: t('proxy.dashboard.refreshed', 'Stats refreshed') });
  }, [refetchStats, refetchLogs, t, toast]);

  const handleClearStats = async () => {
    try {
      await ipc.client.gateway.clearUsage();
      setIsClearDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['proxy'] });
      toast({ title: t('proxy.dashboard.cleared', 'Usage data cleared') });
    } catch {
      toast({
        title: t('proxy.error', 'Error'),
        description: 'Failed to clear usage data',
        variant: 'destructive',
      });
    }
  };

  const summary = statsData?.summary;
  const timeline = statsData?.timeline || [];
  const clientBreakdown = statsData?.clientBreakdown || [];
  const accountBreakdown = statsData?.accountBreakdown || [];
  const modelBreakdown = statsData?.modelBreakdown || [];
  const protocolBreakdown = statsData?.protocolBreakdown || [];
  const statusBreakdown = statsData?.statusBreakdown || [];

  const rawLogs = logsData?.logs || [];
  const filteredLogs = useMemo(() => {
    if (!searchLogText.trim()) return rawLogs;
    const q = searchLogText.toLowerCase().trim();
    return rawLogs.filter(
      (log) =>
        log.keyName?.toLowerCase().includes(q) ||
        log.accountEmail?.toLowerCase().includes(q) ||
        log.accountId?.toLowerCase().includes(q) ||
        log.model?.toLowerCase().includes(q) ||
        log.endpoint?.toLowerCase().includes(q) ||
        String(log.statusCode).includes(q) ||
        log.protocol?.toLowerCase().includes(q),
    );
  }, [rawLogs, searchLogText]);

  // Number formatters
  const formatTokens = (tokens: number) => {
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
    return tokens.toLocaleString();
  };

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const successRate =
    summary && summary.totalRequests > 0
      ? ((summary.successRequests / summary.totalRequests) * 100).toFixed(1)
      : '100.0';

  // Find max request count in timeline for SVG scaling
  const maxTimelineRequests = useMemo(() => {
    if (timeline.length === 0) return 1;
    const max = Math.max(...timeline.map((b) => b.requests));
    return max > 0 ? max : 1;
  }, [timeline]);

  // Model color resolver
  const getModelColor = (model: string | null) => {
    const m = (model || '').toLowerCase();
    if (m.includes('claude')) return 'bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30';
    if (m.includes('gemini')) return 'bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/30';
    if (m.includes('gpt') || m.includes('o1') || m.includes('o3')) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  const getStatusBadge = (code: number) => {
    if (code >= 200 && code < 300) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30 font-mono text-[10px] px-1.5 py-0 h-4">
          {code} OK
        </Badge>
      );
    }
    if (code === 401 || code === 403) {
      return (
        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 font-mono text-[10px] px-1.5 py-0 h-4">
          {code} Auth
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30 font-mono text-[10px] px-1.5 py-0 h-4">
        {code} Err
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      {/* Top Filter & Toolbar */}
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-2.5 sm:flex-row sm:items-center sm:justify-between shadow-xs">
        {/* Left: Time range & Client picker */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Time Range */}
          <div className="flex items-center gap-1 rounded-md bg-muted/60 p-0.5 border">
            {(['today', '24h', '7d', '30d', 'all'] as UsageTimeRange[]).map((range) => (
              <button
                key={range}
                type="button"
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  timeRange === range
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setTimeRange(range)}
              >
                {range === 'today'
                  ? t('proxy.dashboard.today', 'Today')
                  : range === '24h'
                    ? t('proxy.dashboard.24h', '24h')
                    : range === '7d'
                      ? t('proxy.dashboard.7d', '7d')
                      : range === '30d'
                        ? t('proxy.dashboard.30d', '30d')
                        : t('proxy.dashboard.all', 'All')}
              </button>
            ))}
          </div>

          {/* Client Filter */}
          <div className="flex items-center gap-1.5">
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <Filter className="size-3 mr-1 text-muted-foreground" />
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
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setClientFilter('all');
                  onClearSelectedKeyId?.();
                }}
              >
                {t('proxy.dashboard.clear_filter', 'Reset')}
              </Button>
            )}
          </div>

          {/* Upstream Account Filter */}
          <div className="flex items-center gap-1.5">
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger className="h-7 w-[170px] text-xs">
                <UserCheck className="size-3 mr-1 text-muted-foreground" />
                <SelectValue placeholder={t('proxy.dashboard.all_accounts', 'All Accounts')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  {t('proxy.dashboard.all_accounts', 'All Accounts')}
                </SelectItem>
                {accountBreakdown.map((acc) => (
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
                className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={() => setAccountFilter('all')}
              >
                {t('proxy.dashboard.clear_filter', 'Reset')}
              </Button>
            )}
          </div>
        </div>

        {/* Right: Auto-refresh & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="text-[11px]">{t('proxy.dashboard.auto_refresh', 'Auto (15s)')}</span>
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} className="scale-75" />
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={handleRefreshAll}
            disabled={isStatsRefetching}
          >
            <RefreshCw className={`size-3 mr-1 ${isStatsRefetching ? 'animate-spin' : ''}`} />
            {t('common.refresh', 'Refresh')}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={() => setIsClearDialogOpen(true)}
            title={t('proxy.dashboard.clear_title', 'Clear Stats')}
          >
            <Trash2 className="size-3 mr-1" />
            <span className="hidden sm:inline">{t('proxy.dashboard.clear', 'Clear')}</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total Requests */}
        <Card className="p-3">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {t('proxy.dashboard.requests', 'Total Requests')}
            </span>
            <Activity className="size-3.5 text-primary" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight">
            {(summary?.totalRequests || 0).toLocaleString()}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[11px]">
            <span className="text-green-600 dark:text-green-400 font-semibold">{successRate}%</span>
            <span className="text-muted-foreground">
              ({(summary?.failedRequests || 0).toLocaleString()} {t('proxy.dashboard.errors', 'err')})
            </span>
          </div>
        </Card>

        {/* Total Tokens */}
        <Card className="p-3">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {t('proxy.dashboard.tokens', 'Total Tokens')}
            </span>
            <Layers className="size-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight">
            {formatTokens(summary?.totalTokens || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 truncate">
            In: {formatTokens(summary?.promptTokens || 0)} • Out: {formatTokens(summary?.completionTokens || 0)}
          </div>
        </Card>

        {/* Estimated Cost */}
        <Card className="p-3">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {t('proxy.dashboard.cost', 'Est. Cost')}
            </span>
            <DollarSign className="size-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
            {formatCost(summary?.estimatedCost || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('proxy.dashboard.cost_model', 'Based on model pricing')}
          </div>
        </Card>

        {/* Average Latency */}
        <Card className="p-3">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {t('proxy.dashboard.latency', 'Avg Latency')}
            </span>
            <Clock className="size-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight">
            {formatDuration(summary?.avgDurationMs || 0)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {summary?.avgDurationMs && summary.avgDurationMs > 3000 ? (
              <span className="text-amber-500 font-medium">Slow responses</span>
            ) : (
              <span className="text-green-600 dark:text-green-400 font-medium">Healthy latency</span>
            )}
          </div>
        </Card>

        {/* Active Clients */}
        <Card className="p-3">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {t('proxy.dashboard.active_clients', 'Active Clients')}
            </span>
            <AppWindow className="size-3.5 text-indigo-500" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight">
            {summary?.activeClientsCount || 0}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('proxy.dashboard.distinct_apps', 'Identified applications')}
          </div>
        </Card>

        {/* Active Accounts */}
        <Card className="p-3">
          <div className="flex items-center justify-between text-muted-foreground mb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider">
              {t('proxy.dashboard.active_accounts', 'Active Accounts')}
            </span>
            <UserCheck className="size-3.5 text-teal-500" />
          </div>
          <div className="text-xl font-bold font-mono tracking-tight">
            {summary?.activeAccountsCount || 0}
          </div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {t('proxy.dashboard.pool_accounts', 'Upstream pool accounts')}
          </div>
        </Card>
      </div>

      {/* Grid: Timeline Chart & Breakdowns */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Timeline Chart */}
        <Card className="lg:col-span-8">
          <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="size-3.5 text-primary" />
                {t('proxy.dashboard.traffic_timeline', 'Request Activity & Volume')}
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {timeline.length} {isStatsLoading ? 'loading...' : 'data points'}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4">
            {timeline.length === 0 ? (
              <div className="h-44 flex flex-col items-center justify-center text-muted-foreground text-xs border border-dashed rounded-lg">
                <Activity className="size-6 text-muted-foreground/40 mb-1" />
                <p>{t('proxy.dashboard.no_timeline_data', 'No request activity recorded in this time range.')}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Send API calls through the proxy to view timeline trends.
                </p>
              </div>
            ) : (
              <div className="h-44 w-full flex flex-col justify-end">
                {/* SVG Bar Chart */}
                <div className="flex-1 w-full flex items-end gap-1 sm:gap-2 px-1 pb-2 border-b">
                  {timeline.map((bucket, idx) => {
                    const heightPercent = Math.max(
                      8,
                      Math.round((bucket.requests / maxTimelineRequests) * 100),
                    );
                    const hasError = bucket.errors > 0;
                    return (
                      <div
                        key={idx}
                        className="group relative flex-1 flex flex-col items-center justify-end h-full"
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                          <div className="bg-popover text-popover-foreground border text-[11px] rounded shadow-md px-2 py-1 whitespace-nowrap">
                            <div className="font-semibold">{bucket.time}</div>
                            <div>Requests: <span className="font-mono font-medium">{bucket.requests}</span></div>
                            <div>Tokens: <span className="font-mono font-medium">{formatTokens(bucket.tokens)}</span></div>
                            {bucket.errors > 0 && (
                              <div className="text-red-500 font-medium">Errors: {bucket.errors}</div>
                            )}
                          </div>
                        </div>

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t transition-all group-hover:brightness-110 ${
                            hasError ? 'bg-amber-500/80 hover:bg-amber-500' : 'bg-primary/80 hover:bg-primary'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                {/* Time Axis Labels */}
                <div className="flex justify-between items-center px-1 pt-1.5 text-[10px] text-muted-foreground font-mono">
                  <span>{timeline[0]?.time}</span>
                  {timeline.length > 2 && (
                    <span>{timeline[Math.floor(timeline.length / 2)]?.time}</span>
                  )}
                  <span>{timeline[timeline.length - 1]?.time}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Protocol & Status Summary */}
        <Card className="lg:col-span-4 flex flex-col">
          <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Server className="size-3.5 text-blue-500" />
              {t('proxy.dashboard.protocols_status', 'Protocols & Status')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 space-y-3 flex-1 flex flex-col justify-between text-xs">
            {/* Protocol Distribution */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">
                {t('proxy.dashboard.protocol_split', 'By Protocol')}
              </span>
              {protocolBreakdown.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">No data</div>
              ) : (
                <div className="space-y-1">
                  {protocolBreakdown.map((p) => {
                    const totalReq = summary?.totalRequests || 1;
                    const percent = Math.round((p.requests / totalReq) * 100);
                    return (
                      <div key={p.protocol} className="space-y-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="font-medium capitalize">{p.protocol}</span>
                          <span className="font-mono text-muted-foreground">
                            {p.requests} ({percent}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Status Distribution */}
            <div className="space-y-1.5 pt-2 border-t">
              <span className="text-[11px] font-medium text-muted-foreground uppercase">
                {t('proxy.dashboard.status_distribution', 'Status Distribution')}
              </span>
              <div className="flex items-center gap-2">
                {statusBreakdown.map((s) => {
                  const is2xx = s.statusRange === '2xx';
                  const is4xx = s.statusRange === '4xx';
                  return (
                    <div
                      key={s.statusRange}
                      className={`flex-1 rounded p-1.5 text-center border ${
                        is2xx
                          ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300'
                          : is4xx
                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300'
                            : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold">{s.statusRange}</div>
                      <div className="text-sm font-bold font-mono">{s.count}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid: Client App Breakdown, Cloud Account Breakdown & Model Usage */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* Client App Breakdown */}
        <Card className="flex flex-col">
          <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <AppWindow className="size-3.5 text-indigo-500" />
                {t('proxy.dashboard.client_breakdown', 'Usage by Client / Application')}
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {clientBreakdown.length} {t('proxy.dashboard.clients', 'clients')}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {clientBreakdown.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {t('proxy.dashboard.no_clients_active', 'No client activity recorded yet.')}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b sticky top-0 bg-background z-10">
                    <tr>
                      <th className="px-3 py-2">Client / App</th>
                      <th className="px-3 py-2 text-right">Requests</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {clientBreakdown.map((client) => {
                      const totalReq = summary?.totalRequests || 1;
                      const sharePercent = Math.round((client.requests / totalReq) * 100);
                      const isSelected = clientFilter === client.keyId;

                      return (
                        <tr
                          key={client.keyId}
                          className={`hover:bg-muted/30 transition-colors ${
                            isSelected ? 'bg-primary/5 font-medium' : ''
                          }`}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <AppWindow className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold truncate max-w-[120px] block" title={client.keyName}>
                                {client.keyName}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <div>{client.requests}</div>
                            <div className="text-[10px] text-muted-foreground">{sharePercent}%</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {formatCost(client.cost)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-primary"
                              onClick={() => setClientFilter(isSelected ? 'all' : client.keyId)}
                            >
                              {isSelected ? t('proxy.dashboard.filtered', 'Active') : t('proxy.dashboard.filter', 'Filter')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cloud Account Breakdown */}
        <Card className="flex flex-col">
          <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <UserCheck className="size-3.5 text-teal-500" />
                {t('proxy.dashboard.account_breakdown', 'Usage by Cloud Account')}
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {accountBreakdown.length} {t('proxy.dashboard.accounts', 'accounts')}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {accountBreakdown.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {t('proxy.dashboard.no_accounts_active', 'No upstream account activity recorded yet.')}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b sticky top-0 bg-background z-10">
                    <tr>
                      <th className="px-3 py-2">Account</th>
                      <th className="px-3 py-2 text-right">Requests</th>
                      <th className="px-3 py-2 text-right">Cost</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {accountBreakdown.map((acc) => {
                      const totalReq = summary?.totalRequests || 1;
                      const sharePercent = Math.round((acc.requests / totalReq) * 100);
                      const isSelected = accountFilter === acc.accountId;

                      return (
                        <tr
                          key={acc.accountId}
                          className={`hover:bg-muted/30 transition-colors ${
                            isSelected ? 'bg-primary/5 font-medium' : ''
                          }`}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <UserCheck className="size-3.5 text-muted-foreground shrink-0" />
                              <div className="truncate max-w-[120px]">
                                <span className="font-semibold block truncate" title={acc.accountEmail || acc.accountId}>
                                  {acc.accountEmail || acc.accountId}
                                </span>
                                {acc.accountEmail && acc.accountId && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate block">
                                    {acc.accountId}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            <div>{acc.requests}</div>
                            <div className="text-[10px] text-muted-foreground">{sharePercent}%</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {formatCost(acc.cost)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-primary"
                              onClick={() => setAccountFilter(isSelected ? 'all' : acc.accountId)}
                            >
                              {isSelected ? t('proxy.dashboard.filtered', 'Active') : t('proxy.dashboard.filter', 'Filter')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Model Usage Breakdown */}
        <Card className="flex flex-col">
          <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Cpu className="size-3.5 text-primary" />
                {t('proxy.dashboard.model_breakdown', 'Usage by AI Model')}
              </CardTitle>
              <span className="text-[11px] text-muted-foreground">
                {modelBreakdown.length} models
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {modelBreakdown.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {t('proxy.dashboard.no_models_active', 'No model requests recorded yet.')}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[260px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b sticky top-0 bg-background z-10">
                    <tr>
                      <th className="px-3 py-2">Model</th>
                      <th className="px-3 py-2 text-right">Requests</th>
                      <th className="px-3 py-2 text-right">Tokens</th>
                      <th className="px-3 py-2 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {modelBreakdown.map((m) => (
                      <tr key={m.model} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium border truncate max-w-[120px] ${getModelColor(
                              m.model,
                            )}`}
                            title={m.model}
                          >
                            {m.model}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{m.requests}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatTokens(m.tokens)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                          {formatDuration(m.avgDurationMs)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Access Logs Table */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="size-3.5 text-primary" />
                {t('proxy.dashboard.recent_logs', 'Live Request Access Logs')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'proxy.dashboard.recent_logs_desc',
                  'Inspect individual calls, token consumption, latency, and status codes in real time.',
                )}
              </CardDescription>
            </div>
            {/* Right: Search Filter & View All Button */}
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-52">
                <Search className="absolute left-2.5 top-2 size-3 text-muted-foreground" />
                <Input
                  value={searchLogText}
                  onChange={(e) => setSearchLogText(e.target.value)}
                  placeholder={t('proxy.dashboard.search_logs', 'Search model, endpoint...')}
                  className="h-7 pl-7 text-xs"
                />
              </div>
              {onNavigateToLogs && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1 shrink-0 text-primary border-primary/30 hover:bg-primary/10"
                  onClick={onNavigateToLogs}
                >
                  <span>{t('proxy.dashboard.view_all_logs', 'Request Logs')}</span>
                  <ArrowRight className="size-3" />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground border-b">
              {isLogsLoading ? (
                <span>Loading access logs...</span>
              ) : (
                <span>{t('proxy.dashboard.no_logs_found', 'No access logs match current filters.')}</span>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b sticky top-0 bg-background z-10">
                  <tr>
                    <th className="px-3 py-2">Time</th>
                    <th className="px-3 py-2">Client App</th>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Model</th>
                    <th className="px-3 py-2">Endpoint</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2 text-right">Latency</th>
                    <th className="px-3 py-2 text-right">Tokens</th>
                    <th className="px-3 py-2 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y font-mono text-[11px]">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedLogRecord(log)}
                    >
                      {/* Time */}
                      <td className="px-3 py-2 text-muted-foreground font-mono">
                        {formatTimestamp(log.timestamp)}
                      </td>

                      {/* Client App */}
                      <td className="px-3 py-2 font-sans font-medium text-xs">
                        <span className="truncate max-w-[120px] block" title={log.keyName || 'Unknown'}>
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
                          <span className="truncate max-w-[90px] block font-mono text-[10px] text-muted-foreground" title={log.accountId}>
                            {log.accountId}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Model */}
                      <td className="px-3 py-2">
                        {log.model ? (
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border truncate max-w-[110px] ${getModelColor(
                              log.model,
                            )}`}
                            title={log.model}
                          >
                            {log.model}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>

                      {/* Endpoint */}
                      <td className="px-3 py-2 text-muted-foreground">
                        <span className="truncate max-w-[140px] block" title={log.endpoint}>
                          {log.endpoint}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2 text-center">{getStatusBadge(log.statusCode)}</td>

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

                      {/* Details Icon */}
                      <td className="px-3 py-2 text-right">
                        <ChevronRight className="size-3.5 text-muted-foreground inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog
        open={!!selectedLogRecord}
        onOpenChange={(open) => !open && setSelectedLogRecord(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="size-4 text-primary" />
              <span>Request Log Details</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Detailed metadata and token diagnostics for this request.
            </DialogDescription>
          </DialogHeader>
          {selectedLogRecord && (
            <div className="space-y-2 text-xs py-2">
              <div className="grid grid-cols-2 gap-2 border p-2.5 rounded-md bg-muted/20">
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase block">Client Name</span>
                  <span className="font-semibold text-xs">{selectedLogRecord.keyName || 'Unknown'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase block">Status</span>
                  <div>{getStatusBadge(selectedLogRecord.statusCode)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase block">Cloud Account</span>
                  <span className="font-semibold text-xs truncate block" title={selectedLogRecord.accountEmail || selectedLogRecord.accountId || 'N/A'}>
                    {selectedLogRecord.accountEmail || selectedLogRecord.accountId || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase block">Model</span>
                  <span className="font-mono text-xs">{selectedLogRecord.model || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase block">Duration</span>
                  <span className="font-mono text-xs">{formatDuration(selectedLogRecord.durationMs)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-[10px] uppercase block">Protocol</span>
                  <span className="font-mono text-xs capitalize">{selectedLogRecord.protocol}</span>
                </div>
              </div>

              <div className="border p-2.5 rounded-md space-y-1.5 font-mono text-[11px]">
                {selectedLogRecord.accountId && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account ID:</span>
                    <span className="truncate max-w-[200px]">{selectedLogRecord.accountId}</span>
                  </div>
                )}
                {selectedLogRecord.accountEmail && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Account Email:</span>
                    <span className="truncate max-w-[200px]">{selectedLogRecord.accountEmail}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Endpoint:</span>
                  <span>{selectedLogRecord.endpoint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Timestamp:</span>
                  <span>{new Date(selectedLogRecord.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Prompt Tokens:</span>
                  <span>{selectedLogRecord.promptTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completion Tokens:</span>
                  <span>{selectedLogRecord.completionTokens.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-1">
                  <span>Total Tokens:</span>
                  <span>{selectedLogRecord.totalTokens.toLocaleString()}</span>
                </div>
                {selectedLogRecord.cost > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                    <span>Estimated Cost:</span>
                    <span>{formatCost(selectedLogRecord.cost)}</span>
                  </div>
                )}
                {selectedLogRecord.errorMessage && (
                  <div className="border-t pt-1 text-red-500 font-sans text-xs">
                    <span className="font-semibold">Error:</span> {selectedLogRecord.errorMessage}
                  </div>
                )}
                {selectedLogRecord.ip && (
                  <div className="flex justify-between text-[10px] text-muted-foreground border-t pt-1">
                    <span>Client IP:</span>
                    <span>{selectedLogRecord.ip}</span>
                  </div>
                )}
                {selectedLogRecord.userAgent && (
                  <div className="text-[10px] text-muted-foreground break-all">
                    User-Agent: {selectedLogRecord.userAgent}
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => setSelectedLogRecord(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Stats Confirmation Dialog */}
      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('proxy.dashboard.clear_confirm_title', 'Clear Usage Stats?')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t(
                'proxy.dashboard.clear_confirm_desc',
                'This will reset all recorded request logs and usage metrics. Active API keys and configurations will remain unchanged.',
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsClearDialogOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearStats}>
              {t('common.confirm', 'Confirm Clear')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
