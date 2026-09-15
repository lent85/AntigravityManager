import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CalendarDays,
  Clock3,
  Crown,
  Fingerprint,
  MoreVertical,
  Power,
  RefreshCw,
  Repeat2,
  Terminal,
  Trash2,
  Users,
  UserMinus,
} from 'lucide-react';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import type { AccountFamilyGroup } from '@/modules/cloud-account/persistence/family-group-store';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';
import type { GridLayout } from '@/modules/cloud-account/components/CloudAccountList.constants';
import type { QuotaWindow } from '@/modules/cloud-account/utils/quota-groups';
import { aggregateVisibleQuotaModelFamilies } from '@/modules/cloud-account/utils/quota-model-families';
import { selectWeeklyQuotaItems } from '@/modules/cloud-account/utils/quota-groups';
import {
  formatAiCreditsAmount,
  formatResetTimeLabel,
  formatResetTimeTitle,
} from '@/modules/cloud-account/utils/quota-display';
import {
  maskEmail,
  maskInitial,
  maskName,
} from '@/modules/cloud-account/utils/identity-masking';
import { cn } from '@/shared/ui/utils';
import {
  useUnlinkAccountFromFamily,
  useDeleteFamilyGroup,
} from '@/modules/cloud-account/hooks/useFamilyGroups';

interface FamilyCloudAccountCardProps {
  familyGroup: AccountFamilyGroup;
  accounts: CloudAccount[];
  gridLayout: GridLayout;
  quotaWindow: QuotaWindow;
  selectedIds: Set<string>;
  refreshingAccountId?: string;
  deletingAccountId?: string;
  switchingAccountId?: string;
  switchingTarget?: AntigravityAppTarget;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onSwitch: (id: string, appTarget?: AntigravityAppTarget) => void;
  onMarkActive?: (id: string, appTarget?: AntigravityAppTarget) => void;
  onManageIdentity: (id: string) => void;
  onToggleSelection: (id: string, selected: boolean) => void;
  onManageFamily: (groupId: string) => void;
}

export function FamilyCloudAccountCard({
  familyGroup,
  accounts,
  gridLayout,
  quotaWindow,
  selectedIds,
  refreshingAccountId,
  deletingAccountId,
  switchingAccountId,
  onRefresh,
  onDelete,
  onSwitch,
  onManageIdentity,
  onToggleSelection,
  onManageFamily,
}: FamilyCloudAccountCardProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const unlinkMutation = useUnlinkAccountFromFamily();
  const deleteMutation = useDeleteFamilyGroup();
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

  const isMasked = Boolean(config?.mask_account_info);

  // Sorted accounts: Primary (Owner) is ALWAYS first
  const sortedAccounts = [...accounts].sort((a, b) => {
    if (a.id === familyGroup.primaryAccountId) return -1;
    if (b.id === familyGroup.primaryAccountId) return 1;
    return 0;
  });

  const primaryAccount =
    accounts.find((a) => a.id === familyGroup.primaryAccountId) ||
    sortedAccounts[0];

  if (!primaryAccount) {
    return null;
  }

  const quotaAccount = primaryAccount;
  const isRefreshingGroup = accounts.some((a) => refreshingAccountId === a.id);

  const mergedModelQuotas = aggregateVisibleQuotaModelFamilies(
    quotaAccount.quota?.models || {},
    config?.model_visibility || {},
  );

  const compactModels = Object.entries(mergedModelQuotas).sort(
    (a, b) => b[1].percentage - a[1].percentage,
  );
  const weeklyQuotaItems = selectWeeklyQuotaItems(quotaAccount.quota?.quota_groups);

  const earliest5hResetTime = (() => {
    const times = Object.values(mergedModelQuotas)
      .map((m) => m.resetTime)
      .filter((time): time is string => Boolean(time) && !Number.isNaN(new Date(time).getTime()));
    if (times.length === 0) return undefined;
    return times.reduce((earliest, curr) =>
      new Date(curr).getTime() < new Date(earliest).getTime() ? curr : earliest,
    );
  })();

  const earliestWeeklyResetTime = (() => {
    const times = weeklyQuotaItems
      .map((item) => item.resetTime)
      .filter((time): time is string => Boolean(time) && !Number.isNaN(new Date(time).getTime()));
    if (times.length === 0) return undefined;
    return times.reduce((earliest, curr) =>
      new Date(curr).getTime() < new Date(earliest).getTime() ? curr : earliest,
    );
  })();

  const aiCredits = quotaAccount.quota?.ai_credits;
  const shouldShowAiCredits =
    Boolean(aiCredits && Number.isFinite(aiCredits.credits) && aiCredits.credits >= 0);

  const gemini5hModels = compactModels.filter(([name]) => !name.toLowerCase().includes('claude'));
  const claude5hModels = compactModels.filter(([name]) => name.toLowerCase().includes('claude'));
  const geminiWeeklyItems = weeklyQuotaItems.filter(
    (item) => !item.groupName.toLowerCase().includes('claude'),
  );
  const claudeWeeklyItems = weeklyQuotaItems.filter((item) =>
    item.groupName.toLowerCase().includes('claude'),
  );

  const handleRefreshWholeGroup = () => {
    onRefresh(quotaAccount.id);
  };

  const handleUnlink = async (accountId: string) => {
    await unlinkMutation.mutateAsync(accountId);
  };

  const handleDisbandGroup = async () => {
    if (confirm(t('cloud.family.deleteGroupConfirm', 'Bạn có chắc chắn muốn xóa nhóm gia đình này?'))) {
      await deleteMutation.mutateAsync(familyGroup.id);
    }
  };

  // Render a member row inside the identity section
  const renderIdentityMemberRow = (acc: CloudAccount, isCompactLayout = true) => {
    const isOwner = acc.id === familyGroup.primaryAccountId;
    const isSelected = selectedIds.has(acc.id);
    const isSwitching = switchingAccountId === acc.id;
    const isDeleting = deletingAccountId === acc.id;
    const accDisplayName = maskName(acc.name, isMasked, t('cloud.card.unknown', 'Unknown'));
    const accDisplayEmail = maskEmail(acc.email, isMasked);
    const accAvatarInitial = maskInitial(acc.name, acc.email, isMasked);
    const isActiveAnywhere = Boolean(
      acc.is_active_classic || acc.is_active_ide || acc.is_active_agy,
    );

    return (
      <div
        key={acc.id}
        className={cn(
          'flex items-center justify-between gap-1.5 rounded-md px-2 py-1 text-xs transition-colors border',
          isActiveAnywhere
            ? 'bg-primary/5 border-primary/20'
            : 'border-transparent hover:bg-muted/40',
          isSelected && 'bg-primary/10 border-primary/30',
        )}
      >
        {/* Left: Checkbox + Avatar + Name + Email + Badges */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleSelection(acc.id, Boolean(checked))}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer"
          />

          <div className="relative shrink-0">
            {acc.avatar_url && !isMasked ? (
              <img
                src={acc.avatar_url}
                alt={accDisplayName}
                className={cn(
                  'rounded-full object-cover border',
                  isCompactLayout ? 'h-6 w-6' : 'h-7 w-7',
                  isActiveAnywhere ? 'border-primary' : 'border-border/60',
                )}
              />
            ) : (
              <div
                className={cn(
                  'flex items-center justify-center rounded-full font-semibold border text-[10px]',
                  isCompactLayout ? 'h-6 w-6' : 'h-7 w-7',
                  isActiveAnywhere
                    ? 'border-primary bg-primary/20 text-primary'
                    : 'border-border/60 bg-muted text-muted-foreground',
                )}
              >
                {accAvatarInitial}
              </div>
            )}
            {isOwner && (
              <span
                className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500 text-amber-950 shadow-xs"
                title={t('cloud.family.owner', 'Chủ gia đình')}
              >
                <Crown className="h-2 w-2" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span
                className="font-semibold text-xs text-foreground truncate max-w-[130px]"
                title={acc.name ?? undefined}
              >
                {accDisplayName}
              </span>
              <span
                className="text-muted-foreground text-[11px] truncate max-w-[150px]"
                title={acc.email}
              >
                {accDisplayEmail}
              </span>

              {isOwner ? (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] font-normal border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 shrink-0 gap-0.5"
                >
                  <Crown className="h-2 w-2" />
                  {t('cloud.family.ownerBadge', 'Chủ gói')}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[9px] font-normal border-blue-500/30 text-blue-500 dark:text-blue-400 bg-blue-500/10 shrink-0"
                >
                  {t('cloud.family.memberBadge', 'Thành viên')}
                </Badge>
              )}

              <AccountTierBadge
                account={acc}
                unknownLabel={t('cloud.tierFilter.unknown')}
                className="h-3.5 max-w-20 px-1 text-[9px]"
              />

              {acc.is_active_classic && (
                <span className="rounded border border-green-500/20 bg-green-500/10 px-1 text-[9px] font-bold text-green-600 dark:text-green-400 shrink-0">
                  App
                </span>
              )}
              {acc.is_active_ide && (
                <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                  IDE
                </span>
              )}
              {acc.is_active_agy && (
                <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  CLI
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Switch Button + Member Dropdown Menu */}
        <div className="flex items-center gap-1 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isActiveAnywhere ? 'ghost' : 'secondary'}
                size="sm"
                className={cn(
                  'h-6 cursor-pointer px-2 text-[10px] font-semibold transition-all duration-200',
                  isActiveAnywhere
                    ? 'bg-green-500/10 text-green-600 hover:bg-green-500/15 dark:text-green-500'
                    : '',
                )}
                disabled={isSwitching || isDeleting}
              >
                {isSwitching ? (
                  <RefreshCw className="mr-1 h-2.5 w-2.5 animate-spin" />
                ) : isActiveAnywhere ? (
                  <span className="relative mr-1 flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                  </span>
                ) : (
                  <Power className="mr-1 h-2.5 w-2.5" />
                )}
                {isActiveAnywhere ? t('cloud.card.active', 'Active') : t('cloud.card.use', 'Use')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 text-xs">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
                {t('cloud.switchAccountTo', 'Chuyển môi trường')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onSwitch(acc.id, 'classic')}
              >
                <Power className="mr-2 h-3.5 w-3.5 text-green-500" />
                <span>Antigravity (Classic)</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onSwitch(acc.id, 'ide')}
              >
                <Repeat2 className="mr-2 h-3.5 w-3.5 text-indigo-500" />
                <span>Antigravity IDE</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onSwitch(acc.id, 'agy')}
              >
                <Terminal className="mr-2 h-3.5 w-3.5 text-emerald-500" />
                <span>Antigravity CLI (agy)</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onManageIdentity(acc.id)}
              >
                <Fingerprint className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('cloud.identity.manage', 'Identity Profile')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer text-amber-600 focus:text-amber-600"
                onClick={() => handleUnlink(acc.id)}
              >
                <UserMinus className="mr-2 h-3.5 w-3.5" />
                <span>{t('cloud.family.unlinkMember', 'Gỡ khỏi gia đình')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={() => onDelete(acc.id)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                <span>{t('cloud.deleteAccount', 'Xóa tài khoản')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  };

  // 1. DUAL COMPACT LAYOUT (Default & Most Popular)
  // Renders a unified grid row with gridTemplateColumns: '2fr 3fr 1fr 1fr'
  if (gridLayout === 'compact-dual') {
    return (
      <div
        className="group bg-card hover:border-indigo-500/50 grid w-full items-center gap-3 rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-500/[0.03] via-card to-transparent px-3 py-2.5 transition-all duration-200"
        style={{ gridTemplateColumns: '2fr 3fr 1fr 1fr' }}
      >
        {/* Column 1: Account Identity & Members List (Ratio: 2) */}
        <div className="flex min-w-0 flex-col gap-1.5">
          {/* Family Group Header Badge */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pb-0.5 border-b border-indigo-500/15">
            <Users className="h-3 w-3 text-indigo-500 shrink-0" />
            <span className="font-semibold text-foreground truncate">{familyGroup.name}</span>
            <span className="rounded bg-indigo-500/10 px-1 py-0 text-[9px] font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
              {t('cloud.family.sharedQuotaNotice', 'Dùng chung gói Google One')}
            </span>
            {shouldShowAiCredits && aiCredits && (
              <span className="text-blue-500 text-[10px] shrink-0 font-medium">
                · {formatAiCreditsAmount(aiCredits.credits)} AI Credits
              </span>
            )}
          </div>

          {/* List of Member Accounts (Owner 👑 first, then members) */}
          <div className="flex flex-col gap-1">
            {sortedAccounts.map((acc) => renderIdentityMemberRow(acc, true))}
          </div>
        </div>

        {/* Column 2: 5-Hour Window Quota Block (Ratio: 3) */}
        <div className="bg-muted/30 flex min-w-0 flex-col justify-center rounded-md border border-border/50 px-2.5 py-1.5 gap-1.5 self-stretch">
          <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-1">
            <div className="flex items-center gap-1">
              <Clock3 className="text-muted-foreground h-3 w-3" />
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                {t('cloud.quota-window.five-hours-short', '5h')}
              </span>
              <span className="text-[9px] font-medium text-indigo-500">
                ({t('cloud.family.sharedQuotaNotice', 'Google One Share')})
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

          <div className="flex flex-col gap-1.5 pt-0.5 justify-center flex-1">
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
        <div className="bg-muted/30 flex min-w-0 flex-col justify-center rounded-md border border-border/50 px-2 py-1.5 gap-1.5 self-stretch">
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

          <div className="flex flex-col gap-1.5 pt-0.5 justify-center flex-1">
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

        {/* Column 4: Family Actions (Ratio: 1) */}
        <div className="flex min-w-0 items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 cursor-pointer px-2 text-[11px] font-medium gap-1 text-muted-foreground hover:text-foreground border border-border/40 hover:border-border"
            onClick={handleRefreshWholeGroup}
            disabled={isRefreshingGroup}
            title={t('cloud.family.refreshAllTooltip', 'Làm mới quota cho cả gia đình')}
          >
            <RefreshCw className={cn('h-3 w-3', isRefreshingGroup && 'animate-spin text-primary')} />
            <span className="hidden sm:inline">{t('cloud.family.refreshQuota', 'Làm mới')}</span>
          </Button>

          <DropdownMenu open={groupMenuOpen} onOpenChange={setGroupMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 text-xs">
              <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
                {familyGroup.name}
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onManageFamily(familyGroup.id)}
              >
                <Users className="mr-2 h-3.5 w-3.5 text-indigo-500" />
                <span>{t('cloud.family.manageGroup', 'Quản lý gia đình')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={handleRefreshWholeGroup}
                disabled={isRefreshingGroup}
              >
                <RefreshCw className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('cloud.family.refreshQuota', 'Làm mới quota gia đình')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleDisbandGroup}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                <span>{t('cloud.family.disbandGroup', 'Hủy nhóm gia đình')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // 2. COMPACT SINGLE ROW LAYOUT
  if (gridLayout === 'compact') {
    return (
      <div className="group bg-card hover:border-indigo-500/50 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-500/30 bg-gradient-to-r from-indigo-500/[0.03] to-transparent px-3 py-2 transition-all duration-200">
        {/* Left: Members identity list */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Users className="h-3 w-3 text-indigo-500 shrink-0" />
            <span className="font-semibold text-foreground truncate">{familyGroup.name}</span>
            <span className="rounded bg-indigo-500/10 px-1 text-[9px] text-indigo-500 border border-indigo-500/20">
              {t('cloud.family.sharedQuotaNotice', 'Google One Share')}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {sortedAccounts.map((acc) => renderIdentityMemberRow(acc, true))}
          </div>
        </div>

        {/* Center: Active Quota Bar */}
        <div className="flex min-w-44 flex-1 items-center gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {compactModels.slice(0, 4).map(([name, quota]) => (
              <QuotaIndicatorTooltip
                key={name}
                name={name}
                percentage={quota.percentage}
                periodType={quotaWindow === 'weekly' ? 'weekly' : '5h'}
                resetTime={quota.resetTime}
                barWidth="w-7 sm:w-8"
                barHeight="h-1.5"
              />
            ))}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-pointer text-muted-foreground"
            onClick={handleRefreshWholeGroup}
            disabled={isRefreshingGroup}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshingGroup && 'animate-spin text-primary')} />
          </Button>
          <DropdownMenu open={groupMenuOpen} onOpenChange={setGroupMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer text-muted-foreground">
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 text-xs">
              <DropdownMenuItem className="cursor-pointer" onClick={() => onManageFamily(familyGroup.id)}>
                <Users className="mr-2 h-3.5 w-3.5 text-indigo-500" />
                <span>{t('cloud.family.manageGroup', 'Quản lý gia đình')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={handleRefreshWholeGroup}>
                <RefreshCw className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('cloud.family.refreshQuota', 'Làm mới quota')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer text-destructive" onClick={handleDisbandGroup}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                <span>{t('cloud.family.disbandGroup', 'Hủy nhóm gia đình')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  // 3. CARD LAYOUT (auto, 2-col, 3-col, list)
  return (
    <Card className="group bg-card hover:border-indigo-500/50 relative flex h-full flex-col overflow-hidden rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/[0.03] via-card to-background shadow-xs transition-all duration-300">
      <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2 border-b border-indigo-500/15">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
            <Users className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs tracking-tight truncate text-foreground">
                {familyGroup.name}
              </span>
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] h-4 font-normal border-indigo-500/40 text-indigo-600 dark:text-indigo-400 bg-indigo-500/10"
              >
                {t('cloud.family.memberCount', {
                  count: accounts.length,
                  defaultValue: `${accounts.length} tài khoản`,
                })}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground truncate">
              {t('cloud.family.sharedQuotaNotice', 'Dùng chung gói Google One')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
            onClick={handleRefreshWholeGroup}
            disabled={isRefreshingGroup}
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isRefreshingGroup && 'animate-spin text-primary')}
            />
          </Button>
          <DropdownMenu open={groupMenuOpen} onOpenChange={setGroupMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 text-xs">
              <DropdownMenuItem
                className="cursor-pointer"
                onClick={() => onManageFamily(familyGroup.id)}
              >
                <Users className="mr-2 h-3.5 w-3.5 text-indigo-500" />
                <span>{t('cloud.family.manageGroup', 'Quản lý gia đình')}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-pointer" onClick={handleRefreshWholeGroup}>
                <RefreshCw className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('cloud.family.refreshQuota', 'Làm mới quota gia đình')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer text-destructive focus:text-destructive"
                onClick={handleDisbandGroup}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                <span>{t('cloud.family.disbandGroup', 'Hủy nhóm gia đình')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3 p-3 flex-1 justify-between">
        {/* Identity section: Accounts in Family */}
        <div className="flex flex-col gap-1 bg-background/50 rounded-lg p-1 border border-border/40">
          <div className="text-[10px] font-medium text-muted-foreground px-1 py-0.5 uppercase tracking-wider">
            {t('cloud.family.accountsInFamily', 'Tài khoản thành viên')}
          </div>
          {sortedAccounts.map((acc) => renderIdentityMemberRow(acc, false))}
        </div>

        {/* Quota section */}
        <div className="bg-background/40 rounded-lg p-2 border border-border/40 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1 font-medium text-foreground">
              {quotaWindow === 'weekly' ? (
                <CalendarDays className="h-3 w-3 text-purple-400" />
              ) : (
                <Clock3 className="h-3 w-3 text-indigo-400" />
              )}
              <span>{quotaWindow === 'weekly' ? 'Weekly Quota (Shared)' : '5h Quota (Shared)'}</span>
            </span>
            {earliest5hResetTime && (
              <span
                className="text-[10px] text-muted-foreground font-mono"
                title={formatResetTimeTitle(earliest5hResetTime, t('cloud.card.resetTime'))}
              >
                {formatResetTimeLabel(earliest5hResetTime, {
                  prefix: '⏳',
                  unknown: '',
                })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {compactModels.slice(0, 6).map(([name, quota]) => (
              <QuotaIndicatorTooltip
                key={name}
                name={name}
                percentage={quota.percentage}
                periodType={quotaWindow === 'weekly' ? 'weekly' : '5h'}
                resetTime={quota.resetTime}
                barWidth="w-7 sm:w-8"
                barHeight="h-1.5"
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

