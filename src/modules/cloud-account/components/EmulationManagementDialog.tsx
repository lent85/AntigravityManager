import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  FlaskConical,
  Gauge,
  Layers,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  useEmulationState,
  useSetEmulationEnabled,
  useSetEmulationTickInterval,
  useGenerateEmulatedAccounts,
  useResetEmulatedQuotas,
  useClearEmulatedAccounts,
  useDeleteCloudAccount,
} from '@/modules/cloud-account/hooks/useCloudAccounts';
import {
  type EmulationPresetType,
  formatTickInterval,
} from '@/modules/cloud-account/emulation/types';

interface EmulationManagementDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
}

export function EmulationManagementDialog({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  trigger,
}: EmulationManagementDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setIsOpen = isControlled ? controlledOnOpenChange : setUncontrolledOpen;

  const { data: emulationState, isLoading } = useEmulationState(2000);
  const setEnabledMutation = useSetEmulationEnabled();
  const setTickIntervalMutation = useSetEmulationTickInterval();
  const generateMutation = useGenerateEmulatedAccounts();
  const resetMutation = useResetEmulatedQuotas();
  const clearMutation = useClearEmulatedAccounts();
  const deleteAccountMutation = useDeleteCloudAccount();

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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                {t('cloud.emulation.title', 'Account Emulation & Quota Simulation')}
                <Badge
                  variant={isEnabled ? 'default' : 'outline'}
                  className={
                    isEnabled
                      ? 'bg-purple-600 hover:bg-purple-700 text-xs'
                      : 'text-muted-foreground text-xs'
                  }
                >
                  {isEnabled
                    ? t('cloud.emulation.badge.active', 'ACTIVE')
                    : t('cloud.emulation.badge.inactive', 'OFF')}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs mt-0.5">
                {t(
                  'cloud.emulation.description',
                  'Spawn fake accounts with realistic consumption patterns to test switching and UI without consuming real API quota.',
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* Master Enable Card */}
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card/60 shadow-xs">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="master-emulation-switch" className="text-sm font-medium cursor-pointer">
                  {t('cloud.emulation.masterSwitch', 'Enable Emulation Mode')}
                </Label>
                {isEnabled && (
                  <span className="flex h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  'cloud.emulation.masterSwitchDesc',
                  'When enabled, emulated accounts appear on your Account Management page with active quota tickers.',
                )}
              </p>
            </div>
            <Switch
              id="master-emulation-switch"
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
              disabled={setEnabledMutation.isPending || isLoading}
            />
          </div>

          {/* Generator & Presets Section */}
          <div className="space-y-3 rounded-lg border p-4 bg-muted/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {t('cloud.emulation.generatorTitle', 'Generate Mock Accounts')}
              </span>
              <span className="text-xs text-muted-foreground">
                {t('cloud.emulation.accountCount', {
                  count: accounts.length,
                  defaultValue: `${accounts.length} active mock account(s)`,
                })}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              {/* Preset Selector */}
              <div className="sm:col-span-7 space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {t('cloud.emulation.presetLabel', 'Consumption Strategy Preset')}
                </Label>
                <Select
                  value={selectedPreset}
                  onValueChange={(val) => setSelectedPreset(val as EmulationPresetType)}
                >
                  <SelectTrigger className="h-8 text-xs">
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

              {/* Count Selector */}
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-[11px] text-muted-foreground">
                  {t('cloud.emulation.quantity', 'Quantity')}
                </Label>
                <Select
                  value={String(count)}
                  onValueChange={(val) => setCount(Number(val))}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1" className="text-xs">1</SelectItem>
                    <SelectItem value="3" className="text-xs">3</SelectItem>
                    <SelectItem value="5" className="text-xs">5</SelectItem>
                    <SelectItem value="10" className="text-xs">10</SelectItem>
                    <SelectItem value="20" className="text-xs">20</SelectItem>
                    <SelectItem value="50" className="text-xs">50</SelectItem>
                    <SelectItem value="100" className="text-xs">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Generate Button */}
              <div className="sm:col-span-3 flex items-end">
                <Button
                  size="sm"
                  className="h-8 w-full cursor-pointer text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium"
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('cloud.emulation.generateBtn', 'Generate')}
                </Button>
              </div>
            </div>

            {/* Randomize Modern Models Switch */}
            <div className="flex items-center justify-between pt-2 border-t border-muted/50 mt-1">
              <div className="space-y-0.5 pr-2">
                <Label htmlFor="dialog-randomize-models-switch" className="text-[11px] font-medium cursor-pointer flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  {t('cloud.emulation.randomizeModels', 'Randomize Modern Models')}
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  {t('cloud.emulation.randomizeModelsDesc', 'Assign 2–6 random modern models per account with diverse quota levels.')}
                </p>
              </div>
              <Switch
                id="dialog-randomize-models-switch"
                checked={randomizeModels || selectedPreset === 'random_modern_mix'}
                onCheckedChange={(checked) => setRandomizeModels(checked)}
                disabled={selectedPreset === 'random_modern_mix'}
              />
            </div>
          </div>

          {/* Simulation Ticker & Batch Controls */}
          <div className="space-y-3 p-3.5 rounded-lg border bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold">
                  {t('cloud.emulation.speedTitle', 'Simulation Ticker Speed')}
                </span>
              </div>
              <span className="text-xs font-bold font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                {formatTickInterval(localInterval)}
              </span>
            </div>

            <div className="space-y-1">
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

            <div className="border-t pt-2.5 flex items-center justify-end gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 cursor-pointer text-xs"
                onClick={handleResetQuotas}
                disabled={resetMutation.isPending || accounts.length === 0}
                title={t('cloud.emulation.resetAll', 'Reset all quotas to 100%')}
              >
                <RotateCcw className="h-3 w-3 mr-1 text-emerald-500" />
                {t('cloud.emulation.resetBtn', 'Reset Quotas')}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 cursor-pointer text-xs text-destructive hover:text-destructive"
                onClick={handleClearAccounts}
                disabled={clearMutation.isPending || accounts.length === 0}
                title={t('cloud.emulation.clearAll', 'Remove all mock accounts')}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                {t('cloud.emulation.clearBtn', 'Clear All')}
              </Button>
            </div>
          </div>

          {/* Emulated Accounts Table / Preview */}
          <div className="space-y-2">
            <span className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {t('cloud.emulation.poolTitle', 'Active Mock Accounts')}
            </span>

            {accounts.length === 0 ? (
              <div className="text-center py-6 border border-dashed rounded-lg text-xs text-muted-foreground">
                <FlaskConical className="h-6 w-6 mx-auto mb-1.5 text-muted-foreground/40" />
                {t('cloud.emulation.empty', 'No mock accounts created yet. Use the generator above to spawn some!')}
              </div>
            ) : (
              <div className="border rounded-md divide-y max-h-48 overflow-y-auto bg-card/40">
                {accounts.map((acc) => {
                  const modelEntries = Object.entries(acc.quota?.models ?? {});
                  const isRateLimited = acc.status === 'rate_limited';

                  return (
                    <div
                      key={acc.id}
                      className="flex items-center justify-between p-2.5 hover:bg-muted/40 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-purple-500/15 border border-purple-500/30 flex items-center justify-center font-bold text-[10px] text-purple-400 shrink-0">
                          {acc.name[0] || 'M'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-medium truncate">{acc.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-purple-500/30 text-purple-400">
                              {acc.tier}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 text-muted-foreground font-mono">
                              {modelEntries.length}m
                            </Badge>
                            {isRateLimited ? (
                              <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                                429
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {acc.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right text-[11px]">
                          <div className="flex items-center gap-1.5 font-mono justify-end">
                            {modelEntries.slice(0, 2).map(([mId, mInfo]) => {
                              const shortName = (mInfo?.display_name || mId)
                                .replace(/^(Gemini|Claude)\s*/i, '')
                                .replace(/\s*\(.*?\)/, '')
                                .trim();
                              const pct = mInfo?.percentage ?? 0;
                              return (
                                <span key={mId} className="inline-flex items-center gap-0.5">
                                  <span className="text-muted-foreground text-[10px]">{shortName}:</span>
                                  <span
                                    className={
                                      pct < 5
                                        ? 'text-red-500 font-bold'
                                        : pct < 25
                                          ? 'text-amber-500'
                                          : 'text-emerald-500'
                                    }
                                  >
                                    {pct}%
                                  </span>
                                </span>
                              );
                            })}
                            {modelEntries.length > 2 && (
                              <span
                                className="text-muted-foreground text-[10px] font-sans"
                                title={modelEntries
                                  .map(([id, info]) => `${info?.display_name || id}: ${info?.percentage}%`)
                                  .join('\n')}
                              >
                                +{modelEntries.length - 2}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {acc.strategy.type === 'linear'
                              ? `Linear (-${acc.strategy.drainStepPercent}%/tick)`
                              : acc.strategy.type === 'bursty'
                                ? 'Bursty'
                                : acc.strategy.type === 'rate_limited'
                                  ? 'Rate Limited'
                                  : 'Static'}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
                          onClick={() => handleDeleteOne(acc.id)}
                          title={t('common.delete', 'Delete')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 border-t bg-muted/20 flex items-center justify-between sm:justify-between">
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            {t('cloud.emulation.safeNote', 'Sandbox isolated — IDE state & database untouched.')}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs cursor-pointer"
            onClick={() => setIsOpen?.(false)}
          >
            {t('common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
