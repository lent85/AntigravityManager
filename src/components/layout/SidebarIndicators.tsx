import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsFetching, useIsMutating, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  HeartPulse,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { useAppConfig, useAppConfigSaveStatus } from '@/modules/config/hooks/useAppConfig';
import {
  QUERY_KEYS,
  useMetricsPollInterval,
  useSetMetricsPollInterval,
  useSyncingAccountId,
} from '@/modules/cloud-account/hooks/useCloudAccounts';
import { isProcessRunning } from '@/modules/antigravity-runtime/actions/process';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/shared/ui/utils';

interface SidebarIndicatorsProps {
  isCollapsed?: boolean;
}

interface CadenceOption {
  value: number;
  label: string;
  isDefault?: boolean;
}

interface ProcessCadenceOption {
  value: number;
  label: string;
  isDefault?: boolean;
}

const CADENCE_OPTIONS: readonly CadenceOption[] = [
  { value: 1, label: '1m' },
  { value: 2, label: '2m' },
  { value: 5, label: '5m', isDefault: true },
  { value: 10, label: '10m' },
  { value: 15, label: '15m' },
  { value: 30, label: '30m' },
  { value: 60, label: '1h' },
  { value: 0, label: 'Manual' },
];

const PROCESS_CADENCE_OPTIONS: readonly ProcessCadenceOption[] = [
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s', isDefault: true },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 300, label: '5m' },
  { value: 0, label: 'Manual' },
];

export const SidebarIndicators: React.FC<SidebarIndicatorsProps> = ({ isCollapsed = false }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { status: saveStatus } = useAppConfigSaveStatus();
  const { config, saveConfig } = useAppConfig();
  const { data: pollIntervalFromIpc } = useMetricsPollInterval();
  const setPollIntervalMutation = useSetMetricsPollInterval();

  const currentInterval = pollIntervalFromIpc ?? config?.sync_interval ?? 5;
  const currentProcessInterval = config?.process_poll_interval ?? 30;
  const processPollIntervalMs = currentProcessInterval > 0 ? currentProcessInterval * 1000 : false;

  const isFetchingAccounts = useIsFetching({ queryKey: QUERY_KEYS.cloudAccounts });
  const isFetchingGateway = useIsFetching({ queryKey: ['gateway', 'modelAvailability'] });
  const isMutatingQuota = useIsMutating({ mutationKey: ['refreshAccountQuota'] });
  const isMutatingPoll = useIsMutating({ mutationKey: ['forcePollCloudMonitor'] });
  const isMutatingSync = useIsMutating({ mutationKey: ['syncLocalAccount'] });
  const syncingAccountId = useSyncingAccountId();

  const isReloading =
    isFetchingAccounts > 0 ||
    isFetchingGateway > 0 ||
    isMutatingQuota > 0 ||
    isMutatingPoll > 0 ||
    isMutatingSync > 0 ||
    Boolean(syncingAccountId);

  const isConfigSaving = saveStatus === 'saving';
  const isConfigError = saveStatus === 'error';

  const configText = isConfigSaving
    ? t('nav.indicators.configSaving', 'Saving configuration...')
    : isConfigError
      ? t('nav.indicators.configError', 'Save failed')
      : t('nav.indicators.configSaved', 'Configuration saved');

  const metricsText = isReloading
    ? t('nav.indicators.metricsReloading', 'Reloading metrics...')
    : t('nav.indicators.metricsSynced', 'Metrics synced');

  const currentCadenceLabel = useMemo(() => {
    if (currentInterval === 0) {
      return t('nav.indicators.manual', 'Manual');
    }
    if (currentInterval >= 60 && currentInterval % 60 === 0) {
      return `${currentInterval / 60}h`;
    }
    return `${currentInterval}m`;
  }, [currentInterval, t]);

  const currentProcessCadenceLabel = useMemo(() => {
    if (currentProcessInterval === 0) {
      return t('nav.indicators.manual', 'Manual');
    }
    if (currentProcessInterval >= 60 && currentProcessInterval % 60 === 0) {
      return `${currentProcessInterval / 60}m`;
    }
    return `${currentProcessInterval}s`;
  }, [currentProcessInterval, t]);

  const { data: isClassicRunning, isFetching: isFetchingClassic } = useQuery({
    queryKey: ['process', 'status', 'classic'],
    queryFn: () => isProcessRunning('classic'),
    refetchInterval: processPollIntervalMs,
  });
  const { data: isIdeRunning, isFetching: isFetchingIde } = useQuery({
    queryKey: ['process', 'status', 'ide'],
    queryFn: () => isProcessRunning('ide'),
    refetchInterval: processPollIntervalMs,
  });

  const isScanningProcesses = isFetchingClassic || isFetchingIde;
  const runningProcessCount = (isClassicRunning ? 1 : 0) + (isIdeRunning ? 1 : 0);

  const processStatusText = isScanningProcesses
    ? t('nav.indicators.processesScanning', 'Scanning processes...')
    : runningProcessCount > 0
      ? t('nav.indicators.processesRunning', '{{count}} processes running', {
          count: runningProcessCount,
        })
      : t('nav.indicators.processesStopped', 'Processes stopped');

  const handleReloadMetrics = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    queryClient.invalidateQueries({ queryKey: ['gateway', 'modelAvailability'] });
  }, [queryClient]);

  const handleRescanProcesses = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['process', 'status'] });
  }, [queryClient]);

  const handleSelectCadence = useCallback(
    (minutes: number) => {
      setPollIntervalMutation.mutate({ intervalMinutes: minutes });
      if (config) {
        saveConfig({ ...config, sync_interval: minutes });
      }
      handleReloadMetrics();
    },
    [config, handleReloadMetrics, saveConfig, setPollIntervalMutation],
  );

  const handleSelectProcessCadence = useCallback(
    (seconds: number) => {
      if (config) {
        saveConfig({ ...config, process_poll_interval: seconds });
      }
      handleRescanProcesses();
    },
    [config, handleRescanProcesses, saveConfig],
  );

  useEffect(() => {
    if (currentInterval <= 0) {
      return;
    }
    const intervalMs = currentInterval * 60 * 1000;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      handleReloadMetrics();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReloadMetrics();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      clearInterval(timer);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [currentInterval, handleReloadMetrics]);

  if (isCollapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col items-center gap-2 py-1">
          {/* Configuration Saved Tooltip Icon */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                role="status"
                aria-label={configText}
                className="hover:bg-accent/50 text-muted-foreground flex h-9 w-9 items-center justify-center rounded-md transition-colors"
              >
                {isConfigSaving ? (
                  <Loader2 className="text-primary h-4 w-4 animate-spin" />
                ) : isConfigError ? (
                  <AlertCircle className="text-destructive h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">{configText}</TooltipContent>
          </Tooltip>

          {/* Metrics Heartbeat Tooltip Button with Cadence Menu */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${metricsText} (${currentCadenceLabel}) - ${t('nav.indicators.clickToReload', 'Click to reload metrics')}`}
                    className="hover:bg-accent/50 text-muted-foreground hover:text-foreground relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors"
                  >
                    {isReloading ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-emerald-400" />
                    ) : (
                      <div className="relative flex items-center justify-center">
                        <HeartPulse className="h-4 w-4 text-emerald-500 transition-transform hover:scale-110" />
                        <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                {metricsText} • {currentCadenceLabel}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-48" side="right" sideOffset={8}>
              <DropdownMenuItem
                onClick={handleReloadMetrics}
                className="cursor-pointer font-medium"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t('nav.indicators.clickToReload', 'Reload metrics now')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-wider uppercase">
                {t('nav.indicators.cadenceTitle', 'Update frequency')}
              </DropdownMenuLabel>
              {CADENCE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between text-xs"
                  onClick={() => handleSelectCadence(option.value)}
                >
                  <span className="flex items-center gap-1.5">
                    {option.value === 0 ? t('nav.indicators.manual', 'Manual only') : option.label}
                    {option.isDefault && (
                      <span className="text-muted-foreground text-[10px]">
                        ({t('nav.indicators.default', 'Default')})
                      </span>
                    )}
                  </span>
                  {currentInterval === option.value && (
                    <Check className="text-primary h-3.5 w-3.5" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Process Status Tooltip Button with Cadence Menu */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${processStatusText} (${currentProcessCadenceLabel}) - ${t('nav.indicators.clickToScan', 'Click to re-scan processes')}`}
                    className="hover:bg-accent/50 text-muted-foreground hover:text-foreground relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-md transition-colors"
                  >
                    {isScanningProcesses ? (
                      <RefreshCw className="h-4 w-4 animate-spin text-sky-400" />
                    ) : (
                      <div className="relative flex items-center justify-center">
                        <Activity
                          className={cn(
                            'h-4 w-4 transition-transform hover:scale-110',
                            runningProcessCount > 0 ? 'text-emerald-500' : 'text-muted-foreground',
                          )}
                        />
                        <span
                          className={cn(
                            'absolute -top-0.5 -right-0.5 flex h-2 w-2 rounded-full',
                            runningProcessCount > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/50',
                          )}
                        />
                      </div>
                    )}
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">
                {processStatusText} • {currentProcessCadenceLabel}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-48" side="right" sideOffset={8}>
              <DropdownMenuItem
                onClick={handleRescanProcesses}
                className="cursor-pointer font-medium"
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5" />
                {t('nav.indicators.clickToScan', 'Re-scan processes now')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-wider uppercase">
                {t('nav.indicators.processCadenceTitle', 'Process scan frequency')}
              </DropdownMenuLabel>
              {PROCESS_CADENCE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between text-xs"
                  onClick={() => handleSelectProcessCadence(option.value)}
                >
                  <span className="flex items-center gap-1.5">
                    {option.value === 0 ? t('nav.indicators.manual', 'Manual only') : option.label}
                    {option.isDefault && (
                      <span className="text-muted-foreground text-[10px]">
                        ({t('nav.indicators.default', 'Default')})
                      </span>
                    )}
                  </span>
                  {currentProcessInterval === option.value && (
                    <Check className="text-primary h-3.5 w-3.5" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {/* Configuration Status Row */}
      <div
        role="status"
        className="text-muted-foreground hover:text-foreground flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors"
      >
        <div className="flex h-4 w-4 shrink-0 items-center justify-center">
          {isConfigSaving ? (
            <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
          ) : isConfigError ? (
            <AlertCircle className="text-destructive h-3.5 w-3.5" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </div>
        <span className="truncate font-medium">{configText}</span>
      </div>

      {/* Metrics Heartbeat Status Row */}
      <div className="hover:bg-accent/40 group/metric flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-1 text-left transition-colors">
        {/* Left: Ping status & text -> clicking reloads metrics */}
        <button
          type="button"
          onClick={handleReloadMetrics}
          title={t('nav.indicators.clickToReload', 'Click to reload metrics')}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5"
        >
          <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            {isReloading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            ) : (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </div>
          <span className="truncate font-medium">{metricsText}</span>
        </button>

        {/* Right: Cadence Badge Dropdown + HeartPulse Icon */}
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="bg-muted/70 hover:bg-accent border-border/40 text-muted-foreground hover:text-foreground inline-flex h-5 cursor-pointer items-center gap-0.5 rounded border px-1.5 text-[10px] font-semibold transition-colors"
                title={t('nav.indicators.cadenceTooltip', 'Change metrics update frequency')}
              >
                <span>{currentCadenceLabel}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" side="top" sideOffset={6}>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-wider uppercase">
                {t('nav.indicators.cadenceTitle', 'Update frequency')}
              </DropdownMenuLabel>
              {CADENCE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between text-xs"
                  onClick={() => handleSelectCadence(option.value)}
                >
                  <span className="flex items-center gap-1.5">
                    {option.value === 0 ? t('nav.indicators.manual', 'Manual only') : option.label}
                    {option.isDefault && (
                      <span className="text-muted-foreground text-[10px]">
                        ({t('nav.indicators.default', 'Default')})
                      </span>
                    )}
                  </span>
                  {currentInterval === option.value && (
                    <Check className="text-primary h-3.5 w-3.5" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={handleReloadMetrics}
            title={t('nav.indicators.clickToReload', 'Click to reload metrics')}
            className="text-muted-foreground hover:text-emerald-400 cursor-pointer p-0.5 transition-colors"
          >
            <HeartPulse
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                isReloading
                  ? 'animate-pulse text-emerald-400'
                  : 'group-hover/metric:scale-110 group-hover/metric:text-emerald-400',
              )}
            />
          </button>
        </div>
      </div>

      {/* Process Scan Status Row */}
      <div className="hover:bg-accent/40 group/process flex w-full items-center justify-between gap-1.5 rounded-md px-2.5 py-1 text-left transition-colors">
        {/* Left: Status dot & text -> clicking rescans processes */}
        <button
          type="button"
          onClick={handleRescanProcesses}
          title={t('nav.indicators.clickToScan', 'Click to re-scan processes')}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5"
        >
          <div className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            {isScanningProcesses ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-sky-400" />
            ) : runningProcessCount > 0 ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            )}
          </div>
          <span className="truncate font-medium">{processStatusText}</span>
        </button>

        {/* Right: Cadence Badge Dropdown + Activity Icon */}
        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="bg-muted/70 hover:bg-accent border-border/40 text-muted-foreground hover:text-foreground inline-flex h-5 cursor-pointer items-center gap-0.5 rounded border px-1.5 text-[10px] font-semibold transition-colors"
                title={t('nav.indicators.processCadenceTooltip', 'Change process scan frequency')}
              >
                <span>{currentProcessCadenceLabel}</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48" side="top" sideOffset={6}>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-wider uppercase">
                {t('nav.indicators.processCadenceTitle', 'Process scan frequency')}
              </DropdownMenuLabel>
              {PROCESS_CADENCE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="flex cursor-pointer items-center justify-between text-xs"
                  onClick={() => handleSelectProcessCadence(option.value)}
                >
                  <span className="flex items-center gap-1.5">
                    {option.value === 0 ? t('nav.indicators.manual', 'Manual only') : option.label}
                    {option.isDefault && (
                      <span className="text-muted-foreground text-[10px]">
                        ({t('nav.indicators.default', 'Default')})
                      </span>
                    )}
                  </span>
                  {currentProcessInterval === option.value && (
                    <Check className="text-primary h-3.5 w-3.5" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            onClick={handleRescanProcesses}
            title={t('nav.indicators.clickToScan', 'Click to re-scan processes')}
            className="text-muted-foreground hover:text-sky-400 cursor-pointer p-0.5 transition-colors"
          >
            <Activity
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                isScanningProcesses
                  ? 'animate-pulse text-sky-400'
                  : runningProcessCount > 0
                    ? 'text-emerald-500 group-hover/process:scale-110 group-hover/process:text-emerald-400'
                    : 'text-muted-foreground/60 group-hover/process:scale-110 group-hover/process:text-foreground',
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
};


