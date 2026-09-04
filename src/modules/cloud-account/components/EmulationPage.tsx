import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import {
  CheckCircle2,
  FlaskConical,
  Gauge,
  Layers,
  LayoutDashboard,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/shared/ui/utils';
import { clampQuotaPercentage } from '@/modules/cloud-account/utils/quota-display';
import {
  useEmulationState,
  useSetEmulationEnabled,
  useSetEmulationTickInterval,
  useGenerateEmulatedAccounts,
  useResetEmulatedQuotas,
  useClearEmulatedAccounts,
  useDeleteCloudAccount,
  useSwitchCloudAccount,
  useRefreshQuota,
} from '@/modules/cloud-account/hooks/useCloudAccounts';
import {
  type EmulationPresetType,
  formatTickInterval,
} from '@/modules/cloud-account/emulation/types';

export function EmulationPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: emulationState, isLoading } = useEmulationState(2000);
  const setEnabledMutation = useSetEmulationEnabled();
  const setTickIntervalMutation = useSetEmulationTickInterval();
  const generateMutation = useGenerateEmulatedAccounts();
  const resetMutation = useResetEmulatedQuotas();
  const clearMutation = useClearEmulatedAccounts();
  const deleteAccountMutation = useDeleteCloudAccount();
  const switchMutation = useSwitchCloudAccount();
  const refreshMutation = useRefreshQuota();

  const [count, setCount] = useState<number>(3);
  const [selectedPreset, setSelectedPreset] = useState<EmulationPresetType>('drain_demo');
  const [randomizeModels, setRandomizeModels] = useState<boolean>(true);

  const isEnabled = !!emulationState?.enabled;
  const tickInterval = emulationState?.tickIntervalSeconds || 10;
  const accounts = emulationState?.accounts || [];

  const [overrideInterval, setOverrideInterval] = useState<number | null>(null);
  const [prevTickInterval, setPrevTickInterval] = useState<number>(tickInterval);

  if (prevTickInterval !== tickInterval) {
    setPrevTickInterval(tickInterval);
    setOverrideInterval(null);
  }

  const localInterval = overrideInterval ?? Math.max(10, Math.min(600, tickInterval));

  const handleCommitInterval = () => {
    if (localInterval !== tickInterval) {
      setTickIntervalMutation.mutate({ seconds: localInterval });
    }
  };

  const handleToggleEnabled = (checked: boolean) => {
    setEnabledMutation.mutate(
      { enabled: checked },
      {
        onSuccess: () => {
          toast({
            title: checked
              ? t('cloud.emulation.toast.enabled', 'Emulation Mode Activated')
              : t('cloud.emulation.toast.disabled', 'Emulation Mode Deactivated'),
            description: checked
              ? t(
                  'cloud.emulation.toast.enabledDesc',
                  'Simulated accounts and live quota consumption are now active.',
                )
              : t(
                  'cloud.emulation.toast.disabledDesc',
                  'Simulated accounts hidden. Real accounts protected.',
                ),
          });
        },
      },
    );
  };

  const handleGenerate = () => {
    generateMutation.mutate(
      {
        count,
        preset: selectedPreset,
        randomizeModels: selectedPreset === 'random_modern_mix' || randomizeModels,
      },
      {
        onSuccess: () => {
          toast({
            title: t('cloud.emulation.toast.generated', 'Accounts Generated'),
            description: t('cloud.emulation.toast.generatedDesc', {
              count,
              defaultValue: `Successfully generated ${count} emulated account(s).`,
            }),
          });
        },
      },
    );
  };

  const handleResetQuotas = () => {
    resetMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: t('cloud.emulation.toast.reset', 'Quotas Restored'),
          description: t(
            'cloud.emulation.toast.resetDesc',
            'All emulated accounts restored to 100% quota.',
          ),
        });
      },
    });
  };

  const handleClearAccounts = () => {
    clearMutation.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: t('cloud.emulation.toast.cleared', 'Emulated Accounts Cleared'),
          description: t(
            'cloud.emulation.toast.clearedDesc',
            'All simulated accounts have been removed.',
          ),
        });
      },
    });
  };

  const handleDeleteOne = (id: string) => {
    deleteAccountMutation.mutate(
      { accountId: id },
      {
        onSuccess: () => {
          toast({
            title: t('cloud.emulation.toast.deleted', 'Account Removed'),
          });
        },
      },
    );
  };

  const handleSwitchAccount = (id: string) => {
    switchMutation.mutate(
      { accountId: id },
      {
        onSuccess: () => {
          toast({
            title: t('cloud.toast.switched.title', 'Account Switched'),
            description: t('cloud.toast.switched.description', 'Active cloud account updated successfully.'),
          });
        },
      },
    );
  };

  const handleRefreshAccount = (id: string) => {
    refreshMutation.mutate(
      { accountId: id },
      {
        onSuccess: () => {
          toast({
            title: t('cloud.toast.quotaRefreshed', 'Quota Refreshed'),
          });
        },
      },
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/15 text-purple-400 border border-purple-500/30 shadow-xs">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight">
                {t('cloud.emulation.title', 'Account Emulation & Quota Simulation')}
              </h1>
              <Badge
                variant={isEnabled ? 'default' : 'outline'}
                className={cn(
                  'text-xs font-semibold px-2 py-0.5',
                  isEnabled
                    ? 'bg-purple-600 hover:bg-purple-700 text-white'
                    : 'text-muted-foreground border-muted-foreground/30',
                )}
              >
                {isEnabled ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    {t('cloud.emulation.badge.active', 'ACTIVE')}
                  </span>
                ) : (
                  t('cloud.emulation.badge.inactive', 'OFF')
                )}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                'cloud.emulation.description',
                'Spawn fake accounts with realistic consumption patterns to test switching and UI without consuming real API quota.',
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <Button variant="outline" size="sm" asChild className="cursor-pointer">
            <Link to="/">
              <LayoutDashboard className="h-4 w-4 mr-1.5 text-muted-foreground" />
              {t('nav.accounts', 'Accounts')}
            </Link>
          </Button>
        </div>
      </div>

      {/* Master Enable Card */}
      <Card className={cn('transition-colors', isEnabled && 'border-purple-500/40 bg-purple-500/[0.03]')}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base font-semibold">
                  {t('cloud.emulation.masterSwitch', 'Enable Emulation Mode')}
                </CardTitle>
                {isEnabled && (
                  <span className="flex h-2.5 w-2.5 rounded-full bg-purple-500 animate-pulse" />
                )}
              </div>
              <CardDescription className="text-xs">
                {t(
                  'cloud.emulation.masterSwitchDesc',
                  'When enabled, emulated accounts appear on your Account Management page with active quota tickers.',
                )}
              </CardDescription>
            </div>
            <Switch
              id="master-emulation-switch"
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={setEnabledMutation.isPending || isLoading}
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{t('cloud.emulation.safeNote', 'Sandbox isolated — IDE state & database untouched.')}</span>
          </div>
        </CardContent>
      </Card>

      {/* Control Grid: Generator & Simulation Ticker */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Generator Card (7 cols) */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                {t('cloud.emulation.generatorTitle', 'Generate Mock Accounts')}
              </CardTitle>
              <Badge variant="secondary" className="text-xs font-normal">
                {t('cloud.emulation.accountCount', {
                  count: accounts.length,
                  defaultValue: `${accounts.length} active mock account(s)`,
                })}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              {t(
                'cloud.emulation.generatorDesc',
                'Select a usage pattern preset and quantity to immediately spawn emulated accounts.',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {t('cloud.emulation.presetLabel', 'Consumption Strategy Preset')}
              </Label>
              <Select
                value={selectedPreset}
                onValueChange={(val) => setSelectedPreset(val as EmulationPresetType)}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="drain_demo" className="text-xs">
                    ⚡ {t('cloud.emulation.presets.drainDemo', 'Live Drain Demo (Linear -4%/tick)')}
                  </SelectItem>
                  <SelectItem value="auto_switch_test_bench" className="text-xs">
                    🎯 {t('cloud.emulation.presets.autoSwitch', 'Auto-Switch Benchmark (1 Critical, 2 Ready, 1 Rate-Limited)')}
                  </SelectItem>
                  <SelectItem value="bursty_workload" className="text-xs">
                    🎲 {t('cloud.emulation.presets.bursty', 'Bursty Usage (Random Workload Spikes)')}
                  </SelectItem>
                  <SelectItem value="rate_limited_test" className="text-xs">
                    🛑 {t('cloud.emulation.presets.rateLimited', 'Rate Limit Simulation (429 Spike)')}
                  </SelectItem>
                  <SelectItem value="balanced_pool" className="text-xs">
                    ⚖️ {t('cloud.emulation.presets.balanced', 'Balanced Development Pool (Mixed Quotas)')}
                  </SelectItem>
                  <SelectItem value="random_modern_mix" className="text-xs">
                    🌈 {t('cloud.emulation.presets.randomModernMix', 'Random Modern Mix (Variable Models & Quotas)')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20">
              <div className="space-y-0.5 pr-2">
                <Label htmlFor="randomize-models-switch" className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  {t('cloud.emulation.randomizeModels', 'Randomize Modern Models')}
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {t('cloud.emulation.randomizeModelsDesc', 'Assign 2–6 random modern models per account with diverse quota levels.')}
                </p>
              </div>
              <Switch
                id="randomize-models-switch"
                checked={randomizeModels || selectedPreset === 'random_modern_mix'}
                onCheckedChange={(checked) => setRandomizeModels(checked)}
                disabled={selectedPreset === 'random_modern_mix'}
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="w-32 space-y-1.5">
                <Label className="text-xs font-medium">
                  {t('cloud.emulation.quantity', 'Quantity')}
                </Label>
                <Select
                  value={String(count)}
                  onValueChange={(val) => setCount(Number(val))}
                >
                  <SelectTrigger className="text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1" className="text-xs">1 account</SelectItem>
                    <SelectItem value="3" className="text-xs">3 accounts</SelectItem>
                    <SelectItem value="5" className="text-xs">5 accounts</SelectItem>
                    <SelectItem value="10" className="text-xs">10 accounts</SelectItem>
                    <SelectItem value="20" className="text-xs">20 accounts</SelectItem>
                    <SelectItem value="50" className="text-xs">50 accounts</SelectItem>
                    <SelectItem value="100" className="text-xs">100 accounts</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 flex items-end">
                <Button
                  className="w-full text-xs bg-purple-600 hover:bg-purple-700 text-white cursor-pointer font-medium"
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                >
                  <Plus className="h-4 w-4 mr-1.5" />
                  {t('cloud.emulation.generateBtn', 'Generate')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ticker & Operations Card (5 cols) */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Gauge className="h-4 w-4 text-purple-400" />
                {t('cloud.emulation.speedTitle', 'Simulation Ticker Speed')}
              </CardTitle>
              <span className="text-xs font-bold font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                {formatTickInterval(localInterval)}
              </span>
            </div>
            <CardDescription className="text-xs">
              {t(
                'cloud.emulation.speedDesc',
                'Adjust how frequently simulated consumption ticks drain quota across mock accounts (10s – 10m).',
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {/* Range Slider: min 10s -> max 600s (10m) */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={10}
                max={600}
                step={5}
                value={localInterval}
                onChange={(e) => setOverrideInterval(Number(e.target.value))}
                onMouseUp={handleCommitInterval}
                onTouchEnd={handleCommitInterval}
                onKeyUp={handleCommitInterval}
                aria-label={t('cloud.emulation.speedTitle', 'Simulation Ticker Speed')}
                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono px-0.5">
                <span>10s</span>
                <span>1m</span>
                <span>3m</span>
                <span>5m</span>
                <span>10m</span>
              </div>
            </div>

            {/* Quick preset chips */}
            <div className="flex items-center gap-1">
              {[
                { label: '10s', value: 10 },
                { label: '30s', value: 30 },
                { label: '1m', value: 60 },
                { label: '2m', value: 120 },
                { label: '5m', value: 300 },
                { label: '10m', value: 600 },
              ].map((preset) => (
                <Button
                  key={preset.value}
                  variant={localInterval === preset.value ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-6 px-1.5 text-[10px] font-mono cursor-pointer flex-1',
                    localInterval === preset.value &&
                      'border border-purple-500/40 text-purple-400 font-semibold bg-purple-500/10',
                  )}
                  onClick={() => {
                    setOverrideInterval(preset.value);
                    setTickIntervalMutation.mutate({ seconds: preset.value });
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="border-t pt-3 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 cursor-pointer text-xs"
                onClick={handleResetQuotas}
                disabled={resetMutation.isPending || accounts.length === 0}
                title={t('cloud.emulation.resetAll', 'Reset all quotas to 100%')}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1 text-emerald-500" />
                {t('cloud.emulation.resetBtn', 'Reset Quotas')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex-1 cursor-pointer text-xs text-destructive hover:text-destructive"
                onClick={handleClearAccounts}
                disabled={clearMutation.isPending || accounts.length === 0}
                title={t('cloud.emulation.clearAll', 'Remove all mock accounts')}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t('cloud.emulation.clearBtn', 'Clear All')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Mock Accounts Pool View */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-purple-400" />
            <h2 className="text-base font-semibold tracking-tight">
              {t('cloud.emulation.poolTitle', 'Active Mock Accounts')}
            </h2>
            <Badge variant="outline" className="text-xs">
              {accounts.length}
            </Badge>
          </div>
          {accounts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('cloud.emulation.tickerRunningNotice', 'Quota dynamically drains on each tick')}
            </span>
          )}
        </div>

        {accounts.length === 0 ? (
          <Card className="border-dashed bg-muted/10">
            <CardContent className="py-12 text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <FlaskConical className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {t('cloud.emulation.empty', 'No mock accounts created yet. Use the generator above to spawn some!')}
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {t(
                    'cloud.emulation.emptyDesc',
                    'Once generated, mock accounts will appear here and on your Accounts page with full quota simulations.',
                  )}
                </p>
              </div>
              <Button
                size="sm"
                className="text-xs bg-purple-600 hover:bg-purple-700 text-white cursor-pointer font-medium"
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('cloud.emulation.generateInitialBtn', 'Spawn Sample Accounts')}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {accounts.map((acc) => {
              const modelEntries = Object.entries(acc.quota?.models ?? {});
              const isRateLimited = acc.status === 'rate_limited';

              return (
                <Card
                  key={acc.id}
                  className={cn(
                    'overflow-hidden transition-all duration-200 hover:shadow-xs',
                    isRateLimited && 'border-red-500/30 bg-red-500/[0.02]',
                  )}
                >
                  <CardHeader className="p-4 pb-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center font-bold text-xs text-purple-400 shrink-0">
                          {acc.name[0] || 'M'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-semibold text-xs truncate">{acc.name}</span>
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 border-purple-500/30 text-purple-400 font-medium"
                            >
                              {acc.tier}
                            </Badge>
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 h-4 font-mono text-muted-foreground"
                            >
                              {t('cloud.emulation.modelCount', {
                                count: modelEntries.length,
                                defaultValue: `${modelEntries.length} models`,
                              })}
                            </Badge>
                            {isRateLimited && (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                                429
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {acc.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                          onClick={() => handleRefreshAccount(acc.id)}
                          title={t('cloud.checkQuota', 'Refresh Quota')}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
                          onClick={() => handleDeleteOne(acc.id)}
                          title={t('common.delete', 'Delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 pt-1.5 space-y-3">
                    {/* Strategy description badge */}
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {t('cloud.emulation.strategyLabel', 'Strategy')}:
                      </span>
                      <span className="font-mono text-xs font-medium text-foreground">
                        {acc.strategy.type === 'linear'
                          ? `Linear (-${acc.strategy.drainStepPercent}%/tick)`
                          : acc.strategy.type === 'bursty'
                            ? `Bursty (p=${acc.strategy.rateLimitProbability ?? 0.3})`
                            : acc.strategy.type === 'rate_limited'
                              ? 'Rate Limited (429)'
                              : acc.strategy.type === 'random_walk'
                                ? 'Random Walk'
                                : acc.strategy.type === 'auto_recover'
                                  ? 'Auto Recover'
                                  : 'Static'}
                      </span>
                    </div>

                    {/* Quota Progress Meters (Dynamic) */}
                    <div className="space-y-2 border-t pt-2.5 max-h-56 overflow-y-auto pr-1">
                      {modelEntries.length === 0 ? (
                        <div className="text-xs text-muted-foreground italic py-1">
                          No models configured
                        </div>
                      ) : (
                        modelEntries.map(([modelId, modelInfo]) => {
                          const pct = modelInfo?.percentage ?? 0;
                          const displayName = modelInfo?.display_name || modelId;

                          return (
                            <div key={modelId} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-muted-foreground truncate max-w-[200px]" title={modelId}>
                                  {displayName}
                                </span>
                                <span
                                  className={cn(
                                    'font-mono font-semibold',
                                    pct <= 5
                                      ? 'text-red-500'
                                      : pct <= 25
                                        ? 'text-amber-500'
                                        : 'text-emerald-500',
                                  )}
                                >
                                  {pct}%
                                </span>
                              </div>
                              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all duration-300',
                                    pct <= 5
                                      ? 'bg-red-500'
                                      : pct <= 25
                                        ? 'bg-amber-500'
                                        : 'bg-emerald-500',
                                  )}
                                  style={{ width: `${clampQuotaPercentage(pct)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Bottom action: Switch */}
                    <div className="border-t pt-2.5 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {acc.id}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-[11px] px-2 cursor-pointer hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/30"
                        onClick={() => handleSwitchAccount(acc.id)}
                        disabled={switchMutation.isPending}
                      >
                        <Zap className="h-3 w-3 mr-1 text-purple-400" />
                        {t('cloud.emulation.switchBtn', 'Switch to Account')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
