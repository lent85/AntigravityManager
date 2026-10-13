import React from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import type { CloudAccountView } from '@/modules/cloud-account/services/cloud-account-view';
import type { ServiceConfigSnapshot } from '@/modules/config/service-config.schema';
type ProxyConfig = ServiceConfigSnapshot['proxy'];
import {
  Shuffle,
  RotateCw,
  TrendingUp,
  ShieldAlert,
  Sparkles,
  Zap,
  Layers,
  Users,
  CheckSquare,
  Square,
  Cpu,
} from 'lucide-react';

interface ProxyAccountRoutingCardProps {
  proxyConfig: ProxyConfig;
  updateProxyConfig: (newConfig: ProxyConfig) => Promise<void>;
  cloudAccounts: CloudAccountView[];
}

export function ProxyAccountRoutingCard({
  proxyConfig,
  updateProxyConfig,
  cloudAccounts,
}: ProxyAccountRoutingCardProps) {
  const { t } = useTranslation();

  const isCustomAccounts = proxyConfig.account_selection_mode === 'custom';
  const selectedAccountIds = new Set(proxyConfig.selected_account_ids || []);

  const toggleAccountSelectionMode = (custom: boolean) => {
    updateProxyConfig({
      ...proxyConfig,
      account_selection_mode: custom ? 'custom' : 'all',
      // If switching to custom and none selected, select all as default
      selected_account_ids:
        custom && (proxyConfig.selected_account_ids?.length ?? 0) === 0
          ? cloudAccounts.map((a) => a.id)
          : proxyConfig.selected_account_ids,
    });
  };

  const toggleAccount = (accountId: string) => {
    const nextSelected = new Set(selectedAccountIds);
    if (nextSelected.has(accountId)) {
      nextSelected.delete(accountId);
    } else {
      nextSelected.add(accountId);
    }
    updateProxyConfig({
      ...proxyConfig,
      selected_account_ids: Array.from(nextSelected),
    });
  };

  const selectAllAccounts = () => {
    updateProxyConfig({
      ...proxyConfig,
      selected_account_ids: cloudAccounts.map((a) => a.id),
    });
  };

  const deselectAllAccounts = () => {
    updateProxyConfig({
      ...proxyConfig,
      selected_account_ids: [],
    });
  };

  const STRATEGY_DESCRIPTIONS: Record<string, { label: string; desc: string; icon: React.ReactNode }> = {
    'round-robin': {
      label: t('proxy.strategies.round_robin', 'Round Robin (Sequential)'),
      desc: t(
        'proxy.strategies.round_robin_desc',
        'Evenly and sequentially cycles requests across all eligible accounts.',
      ),
      icon: <RotateCw className="size-4 text-blue-500" />,
    },
    random: {
      label: t('proxy.strategies.random', 'Random Distribution'),
      desc: t(
        'proxy.strategies.random_desc',
        'Randomly selects an account for each request across the pool.',
      ),
      icon: <Shuffle className="size-4 text-purple-500" />,
    },
    'quota-priority': {
      label: t('proxy.strategies.quota_priority', 'Highest Quota First'),
      desc: t(
        'proxy.strategies.quota_priority_desc',
        'Automatically routes to the account with the highest remaining quota for the requested model.',
      ),
      icon: <TrendingUp className="size-4 text-emerald-500" />,
    },
    failover: {
      label: t('proxy.strategies.failover', 'Sequential Failover'),
      desc: t(
        'proxy.strategies.failover_desc',
        'Uses primary account and only shifts to subsequent accounts when rate-limited or exhausted.',
      ),
      icon: <ShieldAlert className="size-4 text-amber-500" />,
    },
    balance: {
      label: t('proxy.strategies.balance', 'Sticky Session Balance'),
      desc: t(
        'proxy.strategies.balance_desc',
        'Maintains conversation affinity for sticky sessions with balanced fallback.',
      ),
      icon: <Layers className="size-4 text-cyan-500" />,
    },
    'cache-first': {
      label: t('proxy.strategies.cache_first', 'Prompt Cache First'),
      desc: t(
        'proxy.strategies.cache_first_desc',
        'Prioritizes prompt cache affinity with brief wait tolerance before rotating.',
      ),
      icon: <Zap className="size-4 text-yellow-500" />,
    },
    'performance-first': {
      label: t('proxy.strategies.performance_first', 'Performance / Fast Rotation'),
      desc: t(
        'proxy.strategies.performance_first_desc',
        'Optimized for speed with immediate account rollover on saturation.',
      ),
      icon: <Sparkles className="size-4 text-rose-500" />,
    },
  };

  const currentStrategy = STRATEGY_DESCRIPTIONS[proxyConfig.scheduling_mode] || STRATEGY_DESCRIPTIONS['round-robin'];

  return (
    <div className="space-y-3">
      {/* Account Selection Card */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-primary" />
              <CardTitle className="text-sm font-semibold">
                {t('proxy.accounts.title', 'Account Selection & Pool')}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="custom-account-toggle" className="text-xs font-medium text-muted-foreground">
                {isCustomAccounts
                  ? t('proxy.accounts.mode_custom', 'Selected Accounts Only')
                  : t('proxy.accounts.mode_all', 'Use All Accounts')}
              </Label>
              <Switch
                id="custom-account-toggle"
                checked={isCustomAccounts}
                onCheckedChange={toggleAccountSelectionMode}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 space-y-2.5">
          {isCustomAccounts ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t('proxy.accounts.selected_count', {
                    selected: selectedAccountIds.size,
                    total: cloudAccounts.length,
                    defaultValue: `${selectedAccountIds.size} of ${cloudAccounts.length} accounts selected`,
                  })}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectAllAccounts}>
                    <CheckSquare className="mr-1 size-3" />
                    {t('proxy.accounts.select_all', 'Select All')}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={deselectAllAccounts}>
                    <Square className="mr-1 size-3" />
                    {t('proxy.accounts.deselect_all', 'Deselect All')}
                  </Button>
                </div>
              </div>

              {cloudAccounts.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {t('proxy.accounts.no_accounts', 'No cloud accounts connected. Please add an account in Cloud Accounts.')}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {cloudAccounts.map((account) => {
                    const isSelected = selectedAccountIds.has(account.id);
                    const isRateLimited = account.status === 'rate_limited';

                    return (
                      <div
                        key={account.id}
                        onClick={() => toggleAccount(account.id)}
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-2 text-xs transition-all ${
                          isSelected
                            ? 'border-primary/50 bg-primary/5 hover:border-primary'
                            : 'border-border bg-card opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleAccount(account.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="size-3.5"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{account.email}</p>
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="capitalize">{account.provider}</span>
                              {account.quota?.subscription_tier && (
                                <span className="rounded bg-muted px-1 py-0.2 font-mono text-[9px]">
                                  {account.quota.subscription_tier}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isRateLimited && (
                          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-500">
                            Rate Limited
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <Users className="size-3.5 text-primary shrink-0" />
                <span>
                  {t(
                    'proxy.accounts.all_enabled_notice',
                    'All active connected accounts are automatically pooled and rotated according to the load-balancing strategy below.',
                  )}
                </span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load Balancing & Routing Strategy Card */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center gap-2">
            <Shuffle className="size-4 text-primary" />
            <CardTitle className="text-sm font-semibold">
              {t('proxy.strategies.title', 'Account Switching & Load Balancing Strategy')}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* Strategy Dropdown */}
            <div className="space-y-1">
              <Label htmlFor="scheduling-strategy" className="text-xs font-medium text-muted-foreground">
                {t('proxy.strategies.select_label', 'Routing Strategy')}
              </Label>
              <Select
                value={proxyConfig.scheduling_mode}
                onValueChange={(val) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    scheduling_mode: val as any,
                  })
                }
              >
                <SelectTrigger id="scheduling-strategy" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STRATEGY_DESCRIPTIONS).map(([key, item]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      <div className="flex items-center gap-2">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preferred Account (Optional) */}
            <div className="space-y-1">
              <Label htmlFor="preferred-account" className="text-xs font-medium text-muted-foreground">
                {t('proxy.strategies.preferred_label', 'Preferred Primary Account (Optional)')}
              </Label>
              <Select
                value={proxyConfig.preferred_account_id || 'none'}
                onValueChange={(val) =>
                  updateProxyConfig({
                    ...proxyConfig,
                    preferred_account_id: val === 'none' ? '' : val,
                  })
                }
              >
                <SelectTrigger id="preferred-account" className="h-8 text-xs">
                  <SelectValue placeholder={t('proxy.strategies.no_preferred', 'None (Follow Strategy)')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">{t('proxy.strategies.no_preferred', 'None (Follow Strategy)')}</SelectItem>
                  {cloudAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id} className="text-xs">
                      {account.email} ({account.provider})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Strategy Description Callout */}
          <div className="flex items-center gap-2.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
            <div className="shrink-0">{currentStrategy.icon}</div>
            <div className="min-w-0">
              <span className="font-semibold mr-1.5">{currentStrategy.label}:</span>
              <span className="text-muted-foreground">{currentStrategy.desc}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
