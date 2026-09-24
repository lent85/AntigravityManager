import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crown,
  Fingerprint,
  FlaskConical,
  MoreVertical,
  Power,
  RefreshCw,
  Repeat2,
  Terminal,
  Trash,
  Users,
  UserMinus,
} from 'lucide-react';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useFamilyGroups,
  useUnlinkAccountFromFamily,
} from '@/modules/cloud-account/hooks/useFamilyGroups';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccountTierBadge } from '@/modules/cloud-account/components/AccountTierBadge';
import { QuotaIndicatorTooltip } from '@/modules/cloud-account/components/QuotaIndicatorTooltip';
import type { CloudAccount } from '@/modules/cloud-account/types';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';
import { aggregateVisibleQuotaModelFamilies } from '@/modules/cloud-account/utils/quota-model-families';
import { selectWeeklyQuotaItems } from '@/modules/cloud-account/utils/quota-groups';
import { CardVerticalRefreshProgress } from '@/modules/cloud-account/components/CardVerticalRefreshProgress';
import {
  formatAiCreditsAmount,
  formatResetTimeLabel,
  formatResetTimeTitle,
} from '@/modules/cloud-account/utils/quota-display';
import { getValidationBlockedStatusLabel } from '@/modules/cloud-account/utils/accountValidationStatus';
import {
  maskEmail,
  maskInitial,
  maskName,
} from '@/modules/cloud-account/utils/identity-masking';
import { cn } from '@/shared/ui/utils';

function formatCreditsExpiry(expiryDate: string): string {
  if (!expiryDate) {
    return '';
  }

  try {
    const date = new Date(expiryDate);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return expiryDate;
  }
}

interface DualCompactCloudAccountCardProps {
  account: CloudAccount;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onSwitch: (id: string, appTarget?: AntigravityAppTarget) => void;
  onMarkActive?: (id: string, appTarget?: AntigravityAppTarget) => void;
  onManageIdentity: (id: string) => void;
  isSelected?: boolean;
  onToggleSelection?: (id: string, selected: boolean) => void;
  onManageFamily?: (id: string) => void;
  isRefreshing?: boolean;
  isDeleting?: boolean;
  isSwitching?: boolean;
  switchingTarget?: AntigravityAppTarget;
}

export function DualCompactCloudAccountCard({
  account,
  onRefresh,
  onDelete,
  onSwitch,
  onMarkActive,
  onManageIdentity,
  isSelected = false,
  onToggleSelection,
  onManageFamily,
  isRefreshing,
  isDeleting,
  isSwitching,
}: DualCompactCloudAccountCardProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { data: familyGroups = [] } = useFamilyGroups();
  const unlinkMutation = useUnlinkAccountFromFamily();
  const [menuOpen, setMenuOpen] = useState(false);

  const familyGroup = familyGroups.find((g) => g.accountIds.includes(account.id));
  const isFamilyOwner = familyGroup?.primaryAccountId === account.id;

  const isMasked = !!config?.mask_account_info;
  const displayName = maskName(account.name, isMasked, t('cloud.card.unknown', 'Unknown'));
  const displayEmail = maskEmail(account.email, isMasked);
  const avatarInitial = maskInitial(account.name, account.email, isMasked);

  const isActiveAnywhere = !!(
    account.is_active_classic ||
    account.is_active_ide ||
    account.is_active_agy
  );

  const mergedModelQuotas = aggregateVisibleQuotaModelFamilies(
    account.quota?.models || {},
    config?.model_visibility || {},
  );

  const compactModels = Object.entries(mergedModelQuotas).sort(
    (a, b) => b[1].percentage - a[1].percentage,
  );
  const weeklyQuotaItems = selectWeeklyQuotaItems(account.quota?.quota_groups);

  // Calculate earliest 5h reset time across all visible 5h models
  const earliest5hResetTime = (() => {
    const times = Object.values(mergedModelQuotas)
      .map((m) => m.resetTime)
      .filter((time): time is string => Boolean(time) && !Number.isNaN(new Date(time).getTime()));
    if (times.length === 0) return undefined;
    return times.reduce((earliest, curr) =>
      new Date(curr).getTime() < new Date(earliest).getTime() ? curr : earliest,
    );
  })();

  // Calculate earliest weekly reset time across weekly items
  const earliestWeeklyResetTime = (() => {
    const times = weeklyQuotaItems
      .map((item) => item.resetTime)
      .filter((time): time is string => Boolean(time) && !Number.isNaN(new Date(time).getTime()));
    if (times.length === 0) return undefined;
    return times.reduce((earliest, curr) =>
      new Date(curr).getTime() < new Date(earliest).getTime() ? curr : earliest,
    );
  })();

  const aiCredits = account.quota?.ai_credits;
  const shouldShowAiCredits =
    !!aiCredits && Number.isFinite(aiCredits.credits) && aiCredits.credits >= 0;

  const validationBlockedStatusLabel = getValidationBlockedStatusLabel(
    account.status,
    account.status_reason,
    t,
  );

  const gemini5hModels = compactModels.filter(([name]) => !name.toLowerCase().includes('claude'));
  const claude5hModels = compactModels.filter(([name]) => name.toLowerCase().includes('claude'));

  const geminiWeeklyItems = weeklyQuotaItems.filter(
    (item) => !item.groupName.toLowerCase().includes('claude'),
  );
  const claudeWeeklyItems = weeklyQuotaItems.filter((item) =>
    item.groupName.toLowerCase().includes('claude'),
  );

  return (
    <div
      className={cn(
        "group bg-card hover:border-primary/40 grid w-full items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 relative overflow-hidden",
        isRefreshing && "border-blue-500/40 dark:border-blue-400/30"
      )}
      style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr' }}
    >
      <CardVerticalRefreshProgress isRefreshing={isRefreshing} />
      {/* Column 1: Account Identity & Badges (Ratio: 2) */}
      <div className="flex min-w-0 items-center gap-2.5">
        {onToggleSelection && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelection(account.id, Boolean(checked))}
            className="shrink-0 cursor-pointer"
          />
        )}
        {account.avatar_url && !isMasked ? (
          <img
            src={account.avatar_url}
            alt={displayName}
            className="bg-muted h-7 w-7 shrink-0 rounded-full border"
          />
        ) : (
          <div
            className={cn(
              'bg-primary/10 text-primary flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
              isMasked && 'bg-muted text-muted-foreground',
            )}
          >
            {avatarInitial}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center text-xs" style={{ gap: '5px' }}>
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="text-muted-foreground truncate text-[11px]">
              {displayEmail}
            </span>
            {familyGroup && (
              <span
                className={cn(
                  'rounded border px-1 text-[9px] font-semibold flex items-center gap-0.5 shrink-0',
                  isFamilyOwner
                    ? 'border-amber-500/30 bg-amber-500/15 text-amber-500'
                    : 'border-blue-500/30 bg-blue-500/15 text-blue-400',
                )}
                title={familyGroup.name}
              >
                {isFamilyOwner ? (
                  <>
                    <Crown className="h-2.5 w-2.5" />
                    {familyGroup.name} ({t('cloud.family.ownerBadge', 'Chủ gói')})
                  </>
                ) : (
                  <>
                    <Users className="h-2.5 w-2.5" />
                    {familyGroup.name}
                  </>
                )}
              </span>
            )}
            <Badge
              variant={
                account.status === 'rate_limited' || account.status === 'expired'
                  ? 'destructive'
                  : 'outline'
              }
              className="shrink-0 text-[9px] px-1 py-0"
            >
              {account.provider.toUpperCase()}
            </Badge>
            <AccountTierBadge
              account={account}
              unknownLabel={t('cloud.tierFilter.unknown')}
              className="h-4 max-w-24 px-1 text-[9px]"
            />
            {Boolean(config?.show_emulation_ui) && account.is_emulated && !isMasked && (
              <span
                className="rounded border border-purple-500/30 bg-purple-500/15 px-1 text-[9px] font-bold text-purple-400 flex items-center gap-0.5"
                title={
                  account.emulation_strategy
                    ? `Strategy: ${account.emulation_strategy.type}`
                    : 'Emulated Account'
                }
              >
                <FlaskConical className="h-2.5 w-2.5" />
                {t('cloud.emulation.badgeShort', 'Emulated')}
              </span>
            )}
            {account.is_active_classic && (
              <span className="rounded border border-green-500/20 bg-green-500/10 px-1 text-[9px] font-bold text-green-600 dark:text-green-400">
                App
              </span>
            )}
            {account.is_active_ide && (
              <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                IDE
              </span>
            )}
            {account.is_active_agy && (
              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                CLI
              </span>
            )}
            {validationBlockedStatusLabel && (
              <span className="text-destructive shrink-0 font-medium text-[10px]">
                {validationBlockedStatusLabel}
              </span>
            )}

            {shouldShowAiCredits && aiCredits && (
              <span className="shrink-0 text-[11px] text-blue-500">
                {t('cloud.card.aiCreditsValue', {
                  amount: formatAiCreditsAmount(aiCredits.credits),
                })}
                {aiCredits.expiryDate && (
                  <span className="text-muted-foreground text-[10px]">
                    {' '}· {t('cloud.card.creditsExpiry', {
                      date: formatCreditsExpiry(aiCredits.expiryDate),
                    })}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Column 2: 5-Hour Window Quota Block (Ratio: 3) */}
      <div className="bg-muted/30 flex min-w-0 flex-col justify-center rounded-md border border-border/50 px-2.5 py-1.5 gap-1.5">
        <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-1">
          <div className="flex items-center gap-1">
            <Clock3 className="text-muted-foreground h-3 w-3" />
            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              {t('cloud.quota-window.five-hours-short', '5h')}
            </span>
          </div>
          {earliest5hResetTime ? (
            <span
              className="text-muted-foreground text-[10px] font-mono"
              title={formatResetTimeTitle(earliest5hResetTime, t('cloud.card.resetTime'))}
            >
              {formatResetTimeLabel(earliest5hResetTime, {
                prefix: '⏳',
                unknown: '',
              })}
            </span>
          ) : (
            <span className="text-muted-foreground/60 text-[9px]">
              {compactModels.length > 0 ? '100%' : '—'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 pt-0.5">
          {gemini5hModels.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/70 text-[9px] font-bold uppercase tracking-wide shrink-0 w-11">
                Gemini
              </span>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {gemini5hModels.map(([modelName, info]) => (
                  <QuotaIndicatorTooltip
                    key={modelName}
                    name={modelName}
                    percentage={info.percentage}
                    periodType="5h"
                    resetTime={info.resetTime}
                    barWidth="w-7 sm:w-8"
                    barHeight="h-1.5"
                  />
                ))}
              </div>
            </div>
          )}

          {claude5hModels.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/70 text-[9px] font-bold uppercase tracking-wide shrink-0 w-11">
                Claude
              </span>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {claude5hModels.map(([modelName, info]) => (
                  <QuotaIndicatorTooltip
                    key={modelName}
                    name={modelName}
                    percentage={info.percentage}
                    periodType="5h"
                    resetTime={info.resetTime}
                    barWidth="w-7 sm:w-8"
                    barHeight="h-1.5"
                  />
                ))}
              </div>
            </div>
          )}

          {compactModels.length === 0 && (
            <div className="text-muted-foreground/60 text-[10px] italic">
              {t('cloud.quota-window.no-5h-quota', 'No 5h quota data')}
            </div>
          )}
        </div>
      </div>

      {/* Column 3: Weekly Window Quota Block (Ratio: 1) */}
      <div className="bg-muted/30 flex min-w-0 flex-col justify-center rounded-md border border-border/50 px-2 py-1.5 gap-1.5">
        <div className="flex items-center justify-between gap-1 border-b border-border/30 pb-1">
          <div className="flex items-center gap-1">
            <CalendarDays className="text-muted-foreground h-3 w-3" />
            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
              {t('cloud.quota-window.weekly-short', 'Week')}
            </span>
          </div>
          {earliestWeeklyResetTime ? (
            <span
              className="text-muted-foreground text-[9px] font-mono truncate"
              title={formatResetTimeTitle(earliestWeeklyResetTime, t('cloud.card.resetTime'))}
            >
              {formatResetTimeLabel(earliestWeeklyResetTime, {
                prefix: '⏳',
                unknown: '',
              })}
            </span>
          ) : (
            <span className="text-muted-foreground/60 text-[9px]">
              {weeklyQuotaItems.length > 0 ? '100%' : '—'}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5 pt-0.5">
          {geminiWeeklyItems.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/70 text-[9px] font-bold uppercase tracking-wide shrink-0 w-10">
                Gemini
              </span>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {geminiWeeklyItems.map((item) => (
                  <QuotaIndicatorTooltip
                    key={item.id}
                    name={item.groupName || item.bucketLabel}
                    displayName={`${item.groupName}: ${item.bucketLabel}`}
                    percentage={item.percentage}
                    periodType="weekly"
                    resetTime={item.resetTime}
                    barWidth="w-6 sm:w-7"
                    barHeight="h-1.5"
                  />
                ))}
              </div>
            </div>
          )}

          {claudeWeeklyItems.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground/70 text-[9px] font-bold uppercase tracking-wide shrink-0 w-10">
                Claude
              </span>
              <div className="flex flex-wrap items-center gap-1 flex-1">
                {claudeWeeklyItems.map((item) => (
                  <QuotaIndicatorTooltip
                    key={item.id}
                    name={item.groupName || item.bucketLabel}
                    displayName={`${item.groupName}: ${item.bucketLabel}`}
                    percentage={item.percentage}
                    periodType="weekly"
                    resetTime={item.resetTime}
                    barWidth="w-6 sm:w-7"
                    barHeight="h-1.5"
                  />
                ))}
              </div>
            </div>
          )}

          {weeklyQuotaItems.length === 0 && (
            <div className="text-muted-foreground/60 text-[10px] italic">
              {t('cloud.quota-window.no-weekly-quota', 'No weekly quota data')}
            </div>
          )}
        </div>
      </div>

      {/* Column 4: Status + Action (Ratio: 1) */}
      <div className="flex min-w-0 items-center justify-end gap-1">
        <div
          onMouseEnter={() => setMenuOpen(true)}
          onMouseLeave={() => setMenuOpen(false)}
          className="relative"
        >
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isActiveAnywhere ? 'ghost' : 'secondary'}
                size="sm"
                className={cn(
                  'h-7 cursor-pointer px-2.5 text-[11px] font-semibold transition-all duration-200',
                  isActiveAnywhere
                    ? 'bg-green-500/10 text-green-600 hover:bg-green-500/15 dark:text-green-500'
                    : '',
                )}
              >
                {isSwitching ? (
                  <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                ) : isActiveAnywhere ? (
                  <span className="relative mr-1.5 flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  </span>
                ) : (
                  <Power className="mr-1 h-3 w-3" />
                )}
                {isActiveAnywhere ? t('cloud.card.active', 'Active') : t('cloud.card.use', 'Use')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="animate-in fade-in zoom-in-95 w-72 min-w-[18rem] duration-100"
              onMouseEnter={() => setMenuOpen(true)}
            >
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[10px] tracking-wider uppercase">
                {t('cloud.card.switchTarget', 'Switch Environment')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => onSwitch(account.id)}
                disabled={isSwitching}
                className="flex cursor-pointer items-center justify-between py-2 text-xs"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Power className="text-green-500 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {account.is_active_classic
                      ? t('account.forceApplyToAntigravity', 'Force Apply to Antigravity')
                      : t('account.switchToAntigravity', 'Switch to Antigravity')}
                  </span>
                </span>
                {account.is_active_classic && (
                  <Badge className="h-4 shrink-0 border-none bg-green-500/20 px-1 text-[9px] font-semibold text-green-600 hover:bg-green-500/20">
                    {t('account.active', 'Active')}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSwitch(account.id, 'ide')}
                disabled={isSwitching}
                className="flex cursor-pointer items-center justify-between py-2 text-xs"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Repeat2 className="text-indigo-500 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {account.is_active_ide
                      ? t('account.forceApplyToIde', 'Force Apply to Antigravity IDE')
                      : t('account.switchToIde', 'Switch to Antigravity IDE')}
                  </span>
                </span>
                {account.is_active_ide && (
                  <Badge className="h-4 shrink-0 border-none bg-indigo-500/20 px-1 text-[9px] font-semibold text-indigo-600 hover:bg-indigo-500/20">
                    {t('account.active', 'Active')}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onSwitch(account.id, 'agy')}
                disabled={isSwitching}
                className="flex cursor-pointer items-center justify-between py-2 text-xs"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Terminal className="text-emerald-500 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {account.is_active_agy
                      ? t('account.forceApplyToAgy', 'Force Apply to Antigravity CLI')
                      : t('account.switchToAgy', 'Switch to Antigravity CLI')}
                  </span>
                </span>
                {account.is_active_agy && (
                  <Badge className="h-4 shrink-0 border-none bg-emerald-500/20 px-1 text-[9px] font-semibold text-emerald-600 hover:bg-emerald-500/20">
                    {t('account.active', 'Active')}
                  </Badge>
                )}
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[10px] tracking-wider uppercase">
                {t('cloud.markActive.title', 'Mark as In-Use (No restart)')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => onMarkActive?.(account.id, 'classic')}
                disabled={isSwitching}
                className="flex cursor-pointer items-center justify-between py-2 text-xs"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <CheckCircle2 className="text-green-500 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t('cloud.markActive.antigravity', 'Mark as in-use for Antigravity')}</span>
                </span>
                {account.is_active_classic && (
                  <Badge className="h-4 shrink-0 border-none bg-green-500/20 px-1 text-[9px] font-semibold text-green-600 hover:bg-green-500/20">
                    {t('account.active', 'Active')}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMarkActive?.(account.id, 'ide')}
                disabled={isSwitching}
                className="flex cursor-pointer items-center justify-between py-2 text-xs"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <CheckCircle2 className="text-indigo-500 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t('cloud.markActive.ide', 'Mark as in-use for Antigravity IDE')}</span>
                </span>
                {account.is_active_ide && (
                  <Badge className="h-4 shrink-0 border-none bg-indigo-500/20 px-1 text-[9px] font-semibold text-indigo-600 hover:bg-indigo-500/20">
                    {t('account.active', 'Active')}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMarkActive?.(account.id, 'agy')}
                disabled={isSwitching}
                className="flex cursor-pointer items-center justify-between py-2 text-xs"
              >
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <CheckCircle2 className="text-emerald-500 h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t('cloud.markActive.agy', 'Mark as in-use for Antigravity CLI')}</span>
                </span>
                {account.is_active_agy && (
                  <Badge className="h-4 shrink-0 border-none bg-emerald-500/20 px-1 text-[9px] font-semibold text-emerald-600 hover:bg-emerald-500/20">
                    {t('account.active', 'Active')}
                  </Badge>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer rounded-full">
              <MoreVertical className="h-3.5 w-3.5" />
              <span className="sr-only">Menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="animate-in fade-in zoom-in-95 w-72 min-w-[18rem] max-h-[calc(100vh-4rem)] overflow-y-auto duration-100"
          >
            <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[10px] tracking-wider uppercase">
              {t('cloud.card.switchTarget', 'Switch Environment')}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onSwitch(account.id)}
              disabled={isSwitching}
              className="flex cursor-pointer items-center justify-between py-2 text-xs"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <Power className="text-green-500 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {account.is_active_classic
                    ? t('account.forceApplyToAntigravity', 'Force Apply to Antigravity')
                    : t('account.switchToAntigravity', 'Switch to Antigravity')}
                </span>
              </span>
              {account.is_active_classic && (
                <Badge className="h-4 shrink-0 border-none bg-green-500/20 px-1 text-[9px] font-semibold text-green-600 hover:bg-green-500/20">
                  {t('account.active', 'Active')}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSwitch(account.id, 'ide')}
              disabled={isSwitching}
              className="flex cursor-pointer items-center justify-between py-2 text-xs"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <Repeat2 className="text-indigo-500 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {account.is_active_ide
                    ? t('account.forceApplyToIde', 'Force Apply to Antigravity IDE')
                    : t('account.switchToIde', 'Switch to Antigravity IDE')}
                </span>
              </span>
              {account.is_active_ide && (
                <Badge className="h-4 shrink-0 border-none bg-indigo-500/20 px-1 text-[9px] font-semibold text-indigo-600 hover:bg-indigo-500/20">
                  {t('account.active', 'Active')}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onSwitch(account.id, 'agy')}
              disabled={isSwitching}
              className="flex cursor-pointer items-center justify-between py-2 text-xs"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <Terminal className="text-emerald-500 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">
                  {account.is_active_agy
                    ? t('account.forceApplyToAgy', 'Force Apply to Antigravity CLI')
                    : t('account.switchToAgy', 'Switch to Antigravity CLI')}
                </span>
              </span>
              {account.is_active_agy && (
                <Badge className="h-4 shrink-0 border-none bg-emerald-500/20 px-1 text-[9px] font-semibold text-emerald-600 hover:bg-emerald-500/20">
                  {t('account.active', 'Active')}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[10px] tracking-wider uppercase">
              {t('cloud.markActive.title', 'Mark as In-Use (No restart)')}
            </DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onMarkActive?.(account.id, 'classic')}
              disabled={isSwitching}
              className="flex cursor-pointer items-center justify-between py-2 text-xs"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <CheckCircle2 className="text-green-500 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('cloud.markActive.antigravity', 'Mark as in-use for Antigravity')}</span>
              </span>
              {account.is_active_classic && (
                <Badge className="h-4 shrink-0 border-none bg-green-500/20 px-1 text-[9px] font-semibold text-green-600 hover:bg-green-500/20">
                  {t('account.active', 'Active')}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onMarkActive?.(account.id, 'ide')}
              disabled={isSwitching}
              className="flex cursor-pointer items-center justify-between py-2 text-xs"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <CheckCircle2 className="text-indigo-500 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('cloud.markActive.ide', 'Mark as in-use for Antigravity IDE')}</span>
              </span>
              {account.is_active_ide && (
                <Badge className="h-4 shrink-0 border-none bg-indigo-500/20 px-1 text-[9px] font-semibold text-indigo-600 hover:bg-indigo-500/20">
                  {t('account.active', 'Active')}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onMarkActive?.(account.id, 'agy')}
              disabled={isSwitching}
              className="flex cursor-pointer items-center justify-between py-2 text-xs"
            >
              <span className="flex items-center gap-2 whitespace-nowrap">
                <CheckCircle2 className="text-emerald-500 h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t('cloud.markActive.agy', 'Mark as in-use for Antigravity CLI')}</span>
              </span>
              {account.is_active_agy && (
                <Badge className="h-4 shrink-0 border-none bg-emerald-500/20 px-1 text-[9px] font-semibold text-emerald-600 hover:bg-emerald-500/20">
                  {t('account.active', 'Active')}
                </Badge>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[10px] tracking-wider uppercase">
              {t('cloud.card.actions', 'Actions')}
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onRefresh(account.id)} disabled={isRefreshing} className="flex cursor-pointer items-center py-2 text-xs">
              <RefreshCw className={cn('mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground', isRefreshing && 'animate-spin')} />
              <span className="whitespace-nowrap">{t('cloud.card.refresh', 'Refresh Quota')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onManageIdentity(account.id)} className="flex cursor-pointer items-center py-2 text-xs">
              <Fingerprint className="mr-2 h-3.5 w-3.5 shrink-0 text-purple-400" />
              <span className="whitespace-nowrap">{t('cloud.card.identityProfile', 'Identity Profile')}</span>
            </DropdownMenuItem>
            {onManageFamily && (
              <DropdownMenuItem onClick={() => onManageFamily(account.id)} className="flex cursor-pointer items-center py-2 text-xs">
                <Users className="mr-2 h-3.5 w-3.5 shrink-0 text-blue-400" />
                <span className="whitespace-nowrap">
                  {familyGroup
                    ? t('cloud.family.manageFamilyGroup', 'Quản lý gia đình')
                    : t('cloud.family.linkFamilyGroup', 'Gộp vào gia đình')}
                </span>
              </DropdownMenuItem>
            )}
            {familyGroup && (
              <DropdownMenuItem
                onClick={() => unlinkMutation.mutate(account.id)}
                disabled={unlinkMutation.isPending}
                className="text-amber-500 focus:text-amber-500 flex cursor-pointer items-center py-2 text-xs"
              >
                <UserMinus className="mr-2 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-nowrap">
                  {t('cloud.family.unlinkMember', 'Gỡ khỏi gia đình')}
                </span>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(account.id)}
              className="text-destructive focus:text-destructive flex cursor-pointer items-center py-2 text-xs"
              disabled={isDeleting}
            >
              <Trash className="mr-2 h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">{t('cloud.card.delete', 'Delete Account')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
