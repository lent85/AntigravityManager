import { CloudAccount, CloudQuotaModelInfo } from '@/modules/cloud-account/types';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/shared/ui/utils';
import { CardVerticalRefreshProgress } from '@/modules/cloud-account/components/CardVerticalRefreshProgress';

import {
  MoreVertical,
  Trash,
  RefreshCw,
  Box,
  Power,
  Fingerprint,
  Eye,
  EyeOff,
  Repeat2,
  Terminal,
  TriangleAlert,
  CalendarDays,
  Clock3,
  FlaskConical,
  CheckCircle2,
  Crown,
  Users,
  UserMinus,
  ExternalLink,
} from 'lucide-react';
import {
  useFamilyGroups,
  useUnlinkAccountFromFamily,
} from '@/modules/cloud-account/hooks/useFamilyGroups';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import { useProviderGrouping } from '@/modules/cloud-account/hooks/useProviderGrouping';
import { ProviderGroup } from '@/modules/cloud-account/components/ProviderGroup';
import {
  clampQuotaPercentage,
  formatAiCreditsAmount,
  formatResetTimeLabel,
  formatResetTimeTitle,
  getQuotaStatus,
} from '@/modules/cloud-account/utils/quota-display';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ipc } from '@/ipc/manager';
import { useSetAccountProxy } from '@/modules/cloud-account/hooks/useCloudAccounts';
import { isValidProxyUrl } from '@/shared/utils/url';
import { getCloudAccountBlockedStatusLabel } from '@/modules/cloud-account/utils/accountValidationStatus';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';
import { AccountTierBadge } from '@/modules/cloud-account/components/AccountTierBadge';
import { getVisibleQuotaModelsForPresentation } from '@/modules/cloud-account/utils/quota-model-families';
import {
  selectWeeklyQuotaItems,
  type QuotaWindow,
} from '@/modules/cloud-account/utils/quota-groups';
import { WeeklyQuotaDisplay } from '@/modules/cloud-account/components/WeeklyQuotaDisplay';
import { DetailedQuotaDisplay } from '@/modules/cloud-account/components/DetailedQuotaDisplay';
import { QUOTA_TEXT_COLOR_CLASS_BY_STATUS, QUOTA_BAR_COLOR_CLASS_BY_STATUS } from './quota-colors';
import { isWeeklyQuotaBucket } from '@/modules/cloud-account/utils/quota-groups';
import {
  maskEmail,
  maskInitial,
  maskName,
} from '@/modules/cloud-account/utils/identity-masking';
import { QuotaIndicatorTooltip } from '@/modules/cloud-account/components/QuotaIndicatorTooltip';
import { openAccountValidationLink } from '@/modules/cloud-account/actions/cloud';

type ModelQuotaEntry = [string, CloudQuotaModelInfo];
type LiveModelAvailability = Awaited<
  ReturnType<typeof ipc.client.gateway.modelAvailability>
>[number];

const GEMINI_LEGACY_MODEL_PATTERN = /gemini-[12](\.|$|-)/i;
const GEMINI_PRO_COMBINED_MODEL_ID = 'gemini-3.1-pro-low/high';

const MODEL_DISPLAY_REPLACEMENTS: Array<[string, string]> = [
  [GEMINI_PRO_COMBINED_MODEL_ID, 'Gemini 3.1 Pro (Low/High)'],
  ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'],
  ['gemini-3-pro-image', 'Gemini 3 Pro Image'],
  ['gemini-3.1-pro', 'Gemini 3.1 Pro'],
  ['gemini-3-pro', 'Gemini 3 Pro'],
  ['gemini-3-flash', 'Gemini 3 Flash'],
  ['claude-sonnet-4-6-thinking', 'Claude 4.6 Sonnet (Thinking)'],
  ['claude-sonnet-4-6', 'Claude 4.6 Sonnet'],
  ['claude-sonnet-4-5-thinking', 'Claude 4.5 Sonnet (Thinking)'],
  ['claude-sonnet-4-5', 'Claude 4.5 Sonnet'],
  ['claude-opus-4-6-thinking', 'Claude 4.6 Opus (Thinking)'],
  ['claude-opus-4-5-thinking', 'Claude 4.5 Opus (Thinking)'],
  ['claude-3-5-sonnet', 'Claude 3.5 Sonnet'],
];

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

function formatModelDisplayName(modelName: string): string {
  let displayName = modelName.replace('models/', '');
  for (const [source, target] of MODEL_DISPLAY_REPLACEMENTS) {
    displayName = displayName.replace(source, target);
  }

  return displayName
    .replace(/-/g, ' ')
    .split(' ')
    .map((word) => (word.length > 2 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function formatCompactDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${remainingSeconds}s`;
}

function getAvailabilityModelCandidates(modelName: string): Set<string> {
  const normalized = modelName.replace(/^models\//i, '').toLowerCase();
  const candidates = new Set([normalized]);

  if (
    normalized === GEMINI_PRO_COMBINED_MODEL_ID ||
    normalized === 'gemini-3.1-pro' ||
    normalized === 'gemini-3.1-pro-high' ||
    normalized === 'gemini-3-pro-high'
  ) {
    candidates.add('gemini-pro-agent');
    candidates.add('gemini-3.1-pro-low');
    candidates.add('gemini-3.1-pro-high');
    candidates.add('gemini-3.1-pro-preview');
    candidates.add('gemini-3-pro-preview');
  }

  if (normalized === 'gemini-3.5-flash') {
    candidates.add('gemini-3.5-flash-extra-low');
    candidates.add('gemini-3.5-flash-low');
    candidates.add('gemini-3-flash-agent');
  }

  if (normalized === 'gemini-3.7-flash') {
    candidates.add('gemini-3.7-flash-low');
    candidates.add('gemini-3.7-flash-medium');
    candidates.add('gemini-3.7-flash-high');
    candidates.add('gemini-3.7-flash-tiered');
    candidates.add('gemini-3.6-flash');
    candidates.add('gemini-3.6-flash-low');
    candidates.add('gemini-3.6-flash-medium');
    candidates.add('gemini-3.6-flash-high');
    candidates.add('gemini-3.6-flash-tiered');
  }

  if (normalized === 'gemini-3.1-flash-image' || normalized === 'gemini-3-flash-image') {
    candidates.add('gemini-3.1-flash-image');
    candidates.add('gemini-3-flash-image');
  }

  if (normalized === 'gemini-3-pro-image' || normalized === 'gemini-3.1-pro-image') {
    candidates.add('gemini-3-pro-image');
    candidates.add('gemini-3.1-pro-image');
  }

  return candidates;
}

function findModelAvailability(
  availabilityEntries: LiveModelAvailability[],
  accountId: string,
  modelName: string,
): LiveModelAvailability | undefined {
  const candidates = getAvailabilityModelCandidates(modelName);
  return availabilityEntries
    .filter(
      (entry) =>
        entry.accountId === accountId &&
        candidates.has(entry.modelId.replace(/^models\//i, '').toLowerCase()),
    )
    .sort((left, right) => right.detectedAt - left.detectedAt)[0];
}

interface CloudAccountCardProps {
  account: CloudAccount;
  quotaWindow?: QuotaWindow;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onSwitch: (id: string, appTarget?: AntigravityAppTarget) => void;
  onMarkActive?: (id: string, appTarget?: AntigravityAppTarget) => void;
  onManageIdentity: (id: string) => void;
  onManageFamily?: (id: string) => void;
  isSelected?: boolean;
  onToggleSelection?: (id: string, selected: boolean) => void;
  isRefreshing?: boolean;
  isDeleting?: boolean;
  isSwitching?: boolean;
}

export function CloudAccountCard({
  account,
  quotaWindow = '5h',
  onRefresh,
  onDelete,
  onSwitch,
  onMarkActive,
  onManageIdentity,
  onManageFamily,
  isSelected = false,
  onToggleSelection,
  isRefreshing,
  isDeleting,
  isSwitching,
}: CloudAccountCardProps) {
  const { t } = useTranslation();
  const { config, saveConfig } = useAppConfig();
  const { data: familyGroups = [] } = useFamilyGroups();
  const unlinkMutation = useUnlinkAccountFromFamily();
  const familyGroup = familyGroups.find((g) => g.accountIds.includes(account.id));
  const isFamilyOwner = familyGroup?.primaryAccountId === account.id;

  const isMasked = Boolean(config?.mask_account_info);
  const displayName = maskName(account.name, isMasked, t('cloud.card.unknown'));
  const displayEmail = maskEmail(account.email, isMasked);
  const avatarInitial = maskInitial(account.name, account.email, isMasked);
  const {
    enabled: providerGroupingsEnabled,
    getAccountStats,
    isProviderCollapsed,
    toggleProviderCollapse,
  } = useProviderGrouping();
  const setAccountProxy = useSetAccountProxy();
  const [proxyUrl, setProxyUrl] = useState(account.proxy_url || '');
  const [proxySaved, setProxySaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: modelAvailability = [] } = useQuery({
    queryKey: ['gateway', 'modelAvailability'],
    queryFn: () => ipc.client.gateway.modelAvailability(),
    refetchInterval: 15_000,
  });
  const isActiveAnywhere = !!(
    account.is_active_classic ||
    account.is_active_ide ||
    account.is_active_agy
  );

  const getQuotaTextColorClass = (percentage: number) => {
    const quotaStatus = getQuotaStatus(percentage);
    return QUOTA_TEXT_COLOR_CLASS_BY_STATUS[quotaStatus];
  };

  const getQuotaBarColorClass = (percentage: number) => {
    const quotaStatus = getQuotaStatus(percentage);
    return QUOTA_BAR_COLOR_CLASS_BY_STATUS[quotaStatus];
  };

  const formatQuotaLabel = (percentage: number) => {
    if (percentage === 0) {
      return t('cloud.card.rateLimitedQuota');
    }
    return `${percentage}%`;
  };

  const _formatResetTimeLabelText = (resetTime?: string) => {
    return formatResetTimeLabel(resetTime, {
      prefix: t('cloud.card.resetPrefix'),
      unknown: t('cloud.card.resetUnknown'),
    });
  };

  const formatResetTimeTitleText = (resetTime?: string) => {
    return formatResetTimeTitle(resetTime, t('cloud.card.resetTime'));
  };

  const allModelEntries = Object.entries(account.quota?.models || {}) as ModelQuotaEntry[];

  const mergedModelQuotas = getVisibleQuotaModelsForPresentation(
    account.quota?.models || {},
    config?.model_visibility || {},
  );

  const geminiModels = Object.entries(mergedModelQuotas)
    .filter(([name]) => name.includes('gemini') && !GEMINI_LEGACY_MODEL_PATTERN.test(name))
    .sort((a, b) => b[1].percentage - a[1].percentage);

  const claudeModels = Object.entries(mergedModelQuotas)
    .filter(([name]) => name.includes('claude'))
    .sort((a, b) => b[1].percentage - a[1].percentage);

  const hasVisibleQuotaModels = geminiModels.length > 0 || claudeModels.length > 0;
  const weeklyQuotaItems = selectWeeklyQuotaItems(account.quota?.quota_groups);
  const detailedGroups = account.quota?.quota_groups ?? [];
  const hasDetailedQuota = detailedGroups.some((group) =>
    group.buckets.some((bucket) => !isWeeklyQuotaBucket(bucket)),
  );

  const renderQuotaModelGroup = (title: string, models: ModelQuotaEntry[]) => {
    if (models.length === 0) return null;

    const gridStyle =
      models.length === 1
        ? undefined
        : { gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' };

    const gridColsClass =
      models.length === 1
        ? 'grid-cols-1'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5';

    return (
      <div key={title} className="space-y-1">
        <div className="flex items-center gap-1.5 px-2 py-1">
          <span className="text-muted-foreground/70 text-[10px] font-bold tracking-wider uppercase">
            {title}
          </span>
          <div className="bg-border/50 h-px flex-1" />
        </div>
        <div className={cn('grid gap-x-4 gap-y-1.5', gridColsClass)} style={gridStyle}>
          {models.map(([modelName, info]) => {
          const availability = findModelAvailability(modelAvailability, account.id, modelName);
          const now = Date.now();
          const isLiveLimitActive = !!availability && availability.unavailableUntil > now;
          const statusLabel = availability?.status ? `HTTP ${availability.status}` : 'ERR';
          const reasonLabel =
            availability?.reason === 'model_not_supported'
              ? t('cloud.card.liveLimitModelNotSupported', 'Model not supported')
              : availability?.reason === 'model_forbidden'
                ? t('cloud.card.liveLimitModelForbidden', 'Model forbidden')
                : availability?.reason === 'quota_exhausted'
                  ? t('cloud.card.liveLimitQuotaExhausted', 'Quota exhausted')
                  : t('cloud.card.liveLimitRateLimited', 'Rate limited');
          const liveLimitTimingLabel = availability
            ? isLiveLimitActive
              ? t('cloud.card.liveLimitRemaining', '{{duration}} remaining', {
                  duration: formatCompactDuration(availability.unavailableUntil - now),
                })
              : t('cloud.card.liveLimitDetectedAgo', 'detected {{duration}} ago', {
                  duration: formatCompactDuration(now - availability.detectedAt),
                })
            : null;
          const availabilityTitle = availability
            ? [
                isLiveLimitActive
                  ? t(
                      'cloud.card.liveLimitActiveTitle',
                      'The live upstream endpoint is temporarily unavailable.',
                    )
                  : t(
                      'cloud.card.liveLimitRecentTitle',
                      'The live upstream endpoint recently returned an error.',
                    ),
                `${statusLabel}: ${reasonLabel}.`,
                t(
                  'cloud.card.liveLimitQuotaSnapshot',
                  'The quota snapshot can still show {{percentage}}%.',
                  { percentage: info.percentage },
                ),
                availability.message
                  ? t('cloud.card.liveLimitMessage', 'Message: {{message}}', {
                      message: availability.message,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' ')
            : modelName;
          const rawTimeLabel = formatResetTimeLabel(info.resetTime, { prefix: '', unknown: '' }).trim();

          return (
            <div
              key={modelName}
              className={cn(
                'group/item hover:bg-muted/60 hover:border-border/60 flex flex-col justify-center gap-1 rounded-lg border border-transparent p-2 transition-all',
                availability &&
                  'border-amber-400/60 bg-amber-50/70 ring-1 ring-amber-400/20 dark:border-amber-500/60 dark:bg-amber-950/25',
                isLiveLimitActive &&
                  'border-rose-400/70 bg-rose-50/80 ring-rose-400/25 dark:border-rose-500/70 dark:bg-rose-950/30',
              )}
              title={availabilityTitle}
            >
              {/* Row 1: Model Name (left) & Percentage (right) */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1">
                  {availability && (
                    <TriangleAlert
                      className={cn(
                        'size-3 shrink-0 text-amber-500',
                        isLiveLimitActive && 'text-rose-500',
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      'text-muted-foreground group-hover/item:text-foreground truncate text-xs font-semibold',
                      availability && 'text-amber-700 dark:text-amber-300',
                      isLiveLimitActive && 'text-rose-700 dark:text-rose-300',
                    )}
                  >
                    {formatModelDisplayName(modelName)}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {availability && (
                    <span
                      className={cn(
                        'rounded bg-amber-500/15 px-1 py-px font-mono text-[9px] leading-none font-bold text-amber-700 dark:text-amber-300',
                        isLiveLimitActive && 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
                      )}
                    >
                      {statusLabel}
                    </span>
                  )}
                  <span
                    className={cn(
                      'font-mono text-xs font-bold leading-none',
                      availability
                        ? isLiveLimitActive
                          ? 'text-rose-700 dark:text-rose-300'
                          : 'text-amber-700 dark:text-amber-300'
                        : getQuotaTextColorClass(info.percentage),
                    )}
                  >
                    {info.percentage}%
                  </span>
                </div>
              </div>

              {/* Row 2: Slim Progress Indicator (flex-1) & Countdown Time */}
              <div className="flex items-center gap-2">
                <div className="bg-muted/70 border-border/20 h-1.5 flex-1 overflow-hidden rounded-full border shadow-inner">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-300',
                      getQuotaBarColorClass(info.percentage),
                    )}
                    style={{ width: `${clampQuotaPercentage(info.percentage)}%` }}
                  />
                </div>
                {rawTimeLabel ? (
                  <span
                    className="text-muted-foreground/80 font-mono text-[10px] shrink-0 leading-none"
                    title={formatResetTimeTitleText(info.resetTime)}
                  >
                    {rawTimeLabel}
                  </span>
                ) : null}
              </div>

              {availability && liveLimitTimingLabel && (
                <span
                  className={cn(
                    'block truncate text-[9px] leading-tight text-amber-700/80 dark:text-amber-300/80',
                    isLiveLimitActive && 'text-rose-700/80 dark:text-rose-300/80',
                  )}
                >
                  {reasonLabel} · {liveLimitTimingLabel}
                </span>
              )}
            </div>
          );
        })}
        </div>
      </div>
    );
  };

  const emptyQuotaState = (
    <div className="text-muted-foreground flex flex-col items-center justify-center py-4">
      <Box className="mb-2 h-8 w-8 opacity-20" />
      <span className="text-xs">{t('cloud.card.noQuota')}</span>
    </div>
  );

  const providerStats = providerGroupingsEnabled ? getAccountStats(account) : null;
  const providerGroupedQuotaSection =
    providerStats && providerStats.visibleModels > 0 ? (
      <>
        <div className="bg-muted/40 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs">
          <span className="font-medium">{t('settings.providerGroupings.overall')}</span>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono font-bold ${getQuotaTextColorClass(providerStats.overallPercentage)}`}
            >
              {formatQuotaLabel(providerStats.overallPercentage)}
            </span>
            <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full transition-all duration-300 ${getQuotaBarColorClass(providerStats.overallPercentage)}`}
                style={{
                  width: `${clampQuotaPercentage(providerStats.overallPercentage)}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {providerStats.providers.map((group) => (
            <ProviderGroup
              key={group.providerKey}
              stats={group}
              isCollapsed={isProviderCollapsed(account.id, group.providerKey)}
              onToggleCollapse={() => toggleProviderCollapse(account.id, group.providerKey)}
              getQuotaTextColorClass={getQuotaTextColorClass}
              getQuotaBarColorClass={getQuotaBarColorClass}
              formatQuotaLabel={formatQuotaLabel}
              leftLabel={t('cloud.card.left')}
            />
          ))}
        </div>
      </>
    ) : (
      emptyQuotaState
    );

  const aiCredits = account.quota?.ai_credits;
  const shouldShowAiCredits =
    !!aiCredits && Number.isFinite(aiCredits.credits) && aiCredits.credits >= 0;

  const validationBlockedStatusLabel = getCloudAccountBlockedStatusLabel(account, t);

  return (
    <Card
      className={cn(
        `group bg-card hover:border-primary/30 border-border/80 @container relative flex h-full flex-col overflow-hidden rounded-xl border transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-4px_rgba(0,0,0,0.06),0_4px_12px_-2px_rgba(0,0,0,0.03)] ${isSelected ? 'ring-primary border-primary/50 ring-2' : ''}`,
        isRefreshing && 'border-blue-500/40 dark:border-blue-400/30',
      )}
    >
      <CardVerticalRefreshProgress isRefreshing={isRefreshing} />
      <CardHeader className="relative flex flex-row items-start gap-2.5 space-y-0 p-4 pb-3">
        {onToggleSelection && (
          <div
            className={cn(
              'flex items-center justify-center shrink-0 self-center transition-opacity duration-150',
              isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleSelection(account.id, checked as boolean)}
              className="h-4 w-4 border-2 cursor-pointer"
            />
          </div>
        )}

        {account.avatar_url && !isMasked ? (
          <img
            src={account.avatar_url}
            alt={displayName}
            className="bg-muted h-9 w-9 shrink-0 rounded-full border mt-0.5"
          />
        ) : (
          <div
            className={cn(
              'bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-full border font-bold mt-0.5',
              isMasked && 'bg-muted text-muted-foreground',
            )}
          >
            {avatarInitial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center" style={{ gap: '5px' }}>
            <span className="truncate text-sm font-semibold text-foreground">
              {displayName}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {displayEmail}
            </span>
            <Badge
              variant={
                account.status === 'rate_limited' || account.status === 'expired'
                  ? 'destructive'
                  : 'outline'
              }
              className="px-1.5 py-0 text-[10px] font-bold tracking-wide h-5"
            >
              {account.provider.toUpperCase()}
            </Badge>
            {familyGroup && (
              <span
                className={cn(
                  'flex items-center gap-1 rounded border px-1.5 py-0 text-[10px] font-bold h-5',
                  isFamilyOwner
                    ? 'border-amber-500/30 bg-amber-500/15 text-amber-500'
                    : 'border-blue-500/30 bg-blue-500/15 text-blue-400',
                )}
                title={familyGroup.name}
              >
                {isFamilyOwner ? (
                  <>
                    <Crown className="h-3 w-3" />
                    {familyGroup.name} ({t('cloud.family.ownerBadge', 'Chủ gói')})
                  </>
                ) : (
                  <>
                    <Users className="h-3 w-3" />
                    {familyGroup.name}
                  </>
                )}
              </span>
            )}
            <AccountTierBadge account={account} unknownLabel={t('cloud.tierFilter.unknown')} />
            {Boolean(config?.show_emulation_ui) && account.is_emulated && !isMasked && (
              <span
                className="flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/15 px-1.5 py-0 text-[10px] font-bold text-purple-400 h-5"
                title={
                  account.emulation_strategy
                    ? `Strategy: ${account.emulation_strategy.type}`
                    : 'Emulated Account'
                }
              >
                <FlaskConical className="h-3 w-3" />
                {t('cloud.emulation.badgeShort', 'Emulated')}
              </span>
            )}

            {validationBlockedStatusLabel && (
              <span className="text-destructive bg-destructive/10 border-destructive/20 rounded border px-1.5 py-0 text-[10px] font-semibold h-5 flex items-center">
                {validationBlockedStatusLabel}
              </span>
            )}
            {account.health?.validation?.verification_url && (
              <Button
                variant="destructive"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={() => openAccountValidationLink({ accountId: account.id })}
              >
                <ExternalLink className="h-3 w-3" />
                {t('cloud.card.completeValidation')}
              </Button>
            )}

            {account.is_active_classic && (
              <span className="flex items-center gap-1 rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0 text-[9px] font-bold text-green-600 dark:text-green-400">
                <span className="relative flex h-1 w-1">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-green-500"></span>
                </span>
                {t('cloud.card.appLabel', 'Antigravity App')}
              </span>
            )}
            {account.is_active_ide && (
              <span className="flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0 text-[9px] font-bold text-indigo-600 dark:text-indigo-400">
                <span className="relative flex h-1 w-1">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-indigo-500"></span>
                </span>
                {t('cloud.card.ideLabel', 'Antigravity IDE')}
              </span>
            )}
            {account.is_active_agy && (
              <span className="flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="relative flex h-1 w-1">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-emerald-500"></span>
                </span>
                {t('cloud.card.agyLabel', 'Antigravity CLI')}
              </span>
            )}

            {shouldShowAiCredits && aiCredits && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-blue-500">
                <span>
                  {t('cloud.card.aiCreditsValue', {
                    amount: formatAiCreditsAmount(aiCredits.credits),
                  })}
                </span>
                {aiCredits.expiryDate && (
                  <span className="text-muted-foreground opacity-70">
                    ·{' '}
                    {t('cloud.card.creditsExpiry', {
                      date: formatCreditsExpiry(aiCredits.expiryDate),
                    })}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Right Actions: Active Status Button + Visibility Dropdown */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            onMouseEnter={() => setMenuOpen(true)}
            onMouseLeave={() => setMenuOpen(false)}
            className="relative shrink-0"
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
                  {isActiveAnywhere ? t('cloud.card.active') : t('cloud.card.use')}
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

          {allModelEntries.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hover:bg-muted h-7 w-7 cursor-pointer rounded-full"
                >
                  {(() => {
                    const hiddenCount = allModelEntries.filter(
                      ([modelName]) => config?.model_visibility?.[modelName] === false,
                    ).length;
                    return hiddenCount > 0 ? (
                      <EyeOff className="text-muted-foreground h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    );
                  })()}
                  <span className="sr-only">{t('cloud.card.modelVisibility')}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end">
                <DropdownMenuLabel>{t('cloud.card.modelVisibility')}</DropdownMenuLabel>
                <div className="max-h-64 overflow-auto px-2 py-1">
                  {allModelEntries.map(([modelName]) => {
                    const isVisible = config?.model_visibility?.[modelName] !== false;
                    return (
                      <DropdownMenuItem
                        key={modelName}
                        onSelect={(e) => e.preventDefault()}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <Checkbox
                          checked={isVisible}
                          onCheckedChange={(checked) => {
                            if (config) {
                              const newVisibility = { ...config.model_visibility };
                              newVisibility[modelName] = checked as boolean;
                              saveConfig({ ...config, model_visibility: newVisibility });
                            }
                          }}
                        />
                        <span className="truncate text-xs" title={modelName}>
                          {formatModelDisplayName(modelName)}
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 px-4 pt-2 pb-4">
        <div className="space-y-2">
          {quotaWindow === 'weekly' ? (
            <WeeklyQuotaDisplay
              items={weeklyQuotaItems}
              hasQuotaSummary={account.quota?.quota_groups !== undefined}
            />
          ) : providerGroupingsEnabled ? (
            <>
              {providerGroupedQuotaSection}
              {!providerGroupedQuotaSection && !hasDetailedQuota ? emptyQuotaState : null}
            </>
          ) : hasVisibleQuotaModels ? (
            <div className="space-y-3">
              {renderQuotaModelGroup(t('cloud.card.groupGoogleGemini'), geminiModels)}
              <div className="pt-1" />
              {renderQuotaModelGroup(t('cloud.card.groupAnthropicClaude'), claudeModels)}
            </div>
          ) : hasDetailedQuota ? null : (
            emptyQuotaState
          )}
          {(quotaWindow === '5h' || quotaWindow === 'dual') && (
            <DetailedQuotaDisplay groups={detailedGroups} quotaWindow={quotaWindow} />
          )}
        </div>
      </CardContent>

      <CardFooter className="bg-muted/10 relative mt-auto flex h-11 shrink-0 items-center justify-between overflow-hidden border-t p-2 px-4">
        {/* Idle State / Used Time Indicator */}
        <div className="flex w-full items-center justify-between transition-all duration-300 group-hover:pointer-events-none group-hover:opacity-0">
          <span className="text-muted-foreground truncate text-[11px]">
            {t('cloud.card.used')}{' '}
            {formatDistanceToNow(account.last_used * 1000, { addSuffix: true })}
          </span>
          {account.proxy_url && (
            <span className="text-primary bg-primary/10 border-primary/20 origin-right scale-90 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold">
              Proxy
            </span>
          )}
        </div>

        {/* Hover State Container (fades in, fixed h-11) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-between gap-3 p-2 px-4 opacity-0 transition-all duration-300 ease-in-out group-hover:pointer-events-auto group-hover:opacity-100">
          {/* Action Icons group with Tooltips */}
          <div className="flex shrink-0 items-center gap-1">
            <TooltipProvider>
              {/* Switch Target Dropdown */}
              <DropdownMenu>
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="hover:bg-accent border-border/50 h-7 w-7 cursor-pointer rounded-md text-primary"
                        disabled={isSwitching}
                      >
                        <Power className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">{t('cloud.card.switchTarget', 'Switch Environment')}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="animate-in fade-in zoom-in-95 w-72 min-w-[18rem] duration-100">
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

              {/* Refresh Button */}
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hover:bg-accent border-border/50 h-7 w-7 cursor-pointer rounded-md"
                    onClick={() => onRefresh(account.id)}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{t('cloud.card.refresh')}</TooltipContent>
              </Tooltip>

              {/* Profile Button */}
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hover:bg-accent border-border/50 h-7 w-7 cursor-pointer rounded-md"
                    onClick={() => onManageIdentity(account.id)}
                  >
                    <Fingerprint className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  {t('cloud.card.identityProfile')}
                </TooltipContent>
              </Tooltip>

              {/* Family Button */}
              {onManageFamily && (
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={familyGroup ? 'secondary' : 'outline'}
                      size="icon"
                      className="hover:bg-accent border-border/50 h-7 w-7 cursor-pointer rounded-md"
                      onClick={() => onManageFamily(account.id)}
                    >
                      <Users className={cn('h-3.5 w-3.5', familyGroup ? 'text-blue-500' : '')} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {familyGroup
                      ? t('cloud.family.manageFamilyGroup', 'Quản lý nhóm gia đình')
                      : t('cloud.family.linkFamilyGroup', 'Gộp vào gia đình')}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Unlink Family Button */}
              {familyGroup && (
                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="hover:bg-amber-500/10 border-border/50 text-amber-500 hover:text-amber-400 h-7 w-7 cursor-pointer rounded-md"
                      onClick={() => unlinkMutation.mutate(account.id)}
                      disabled={unlinkMutation.isPending}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">
                    {t('cloud.family.unlinkMember', 'Gỡ khỏi nhóm gia đình')}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Delete Button */}
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 border-border/50 h-7 w-7 cursor-pointer rounded-md"
                    onClick={() => onDelete(account.id)}
                    disabled={isDeleting}
                  >
                    <Trash className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">{t('cloud.card.delete')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Proxy Setting Input */}
          <div className="relative min-w-0 flex-1">
            <Input
              value={proxyUrl}
              onChange={(e) => {
                setProxyUrl(e.target.value);
                setProxySaved(false);
              }}
              onBlur={() => {
                const trimmed = proxyUrl.trim();
                if (trimmed && !isValidProxyUrl(trimmed)) {
                  setProxyUrl(account.proxy_url || '');
                  return;
                }
                if (trimmed !== (account.proxy_url || '')) {
                  setAccountProxy.mutate({
                    accountId: account.id,
                    proxyUrl: trimmed || null,
                  });
                  setProxySaved(true);
                  setTimeout(() => setProxySaved(false), 2000);
                }
              }}
              placeholder={t('cloud.card.proxyPlaceholder')}
              className="bg-muted/20 border-border/40 focus-visible:bg-background focus-visible:ring-primary/30 h-7 w-full rounded-md text-[11px] transition-all focus-visible:ring-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                }
              }}
            />
            {proxySaved && (
              <span className="bg-background absolute top-1/2 right-2 -translate-y-1/2 rounded px-1 text-[9px] font-semibold text-green-500">
                {t('cloud.card.proxySaved')}
              </span>
            )}
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}

interface CompactCloudAccountCardProps {
  account: CloudAccount;
  quotaWindow?: QuotaWindow;
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

export function CompactCloudAccountCard({
  account,
  quotaWindow = '5h',
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
}: CompactCloudAccountCardProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { data: familyGroups = [] } = useFamilyGroups();
  const unlinkMutation = useUnlinkAccountFromFamily();
  const familyGroup = familyGroups.find((g) => g.accountIds.includes(account.id));
  const isFamilyOwner = familyGroup?.primaryAccountId === account.id;

  const [menuOpen, setMenuOpen] = useState(false);
  const isMasked = Boolean(config?.mask_account_info);
  const displayName = maskName(account.name, isMasked, t('cloud.card.unknown'));
  const displayEmail = maskEmail(account.email, isMasked);
  const avatarInitial = maskInitial(account.name, account.email, isMasked);
  const isActiveAnywhere = !!(
    account.is_active_classic ||
    account.is_active_ide ||
    account.is_active_agy
  );

  const _getQuotaBarColorClass = (percentage: number) => {
    const quotaStatus = getQuotaStatus(percentage);
    return QUOTA_BAR_COLOR_CLASS_BY_STATUS[quotaStatus];
  };

  const mergedModelQuotas = getVisibleQuotaModelsForPresentation(
    account.quota?.models || {},
    config?.model_visibility || {},
  );

  const compactModels = Object.entries(mergedModelQuotas).sort(
    (a, b) => b[1].percentage - a[1].percentage,
  );
  const weeklyQuotaItems = selectWeeklyQuotaItems(account.quota?.quota_groups);

  const aiCredits = account.quota?.ai_credits;
  const shouldShowAiCredits =
    !!aiCredits && Number.isFinite(aiCredits.credits) && aiCredits.credits >= 0;

  const validationBlockedStatusLabel = getCloudAccountBlockedStatusLabel(account, t);
  const gemini5hModels = compactModels.filter(([name]) => !name.toLowerCase().includes('claude'));
  const claude5hModels = compactModels.filter(([name]) => name.toLowerCase().includes('claude'));

  const geminiWeeklyItems = weeklyQuotaItems.filter(
    (item) => !item.groupName.toLowerCase().includes('claude'),
  );
  const claudeWeeklyItems = weeklyQuotaItems.filter((item) =>
    item.groupName.toLowerCase().includes('claude'),
  );

  const shouldBreakClaude5h =
    claude5hModels.length > 0 &&
    (gemini5hModels.length > 2 || gemini5hModels.length + claude5hModels.length > 4);

  const shouldBreakClaudeWeekly =
    claudeWeeklyItems.length > 0 &&
    (geminiWeeklyItems.length > 2 || geminiWeeklyItems.length + claudeWeeklyItems.length > 4);

  return (
    <div
      className={cn(
        "group bg-card hover:border-primary/40 flex items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-200 relative overflow-hidden",
        isRefreshing && "border-blue-500/40 dark:border-blue-400/30"
      )}
    >
      <CardVerticalRefreshProgress isRefreshing={isRefreshing} />
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
          <span className="text-muted-foreground truncate text-xs">
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
            className="shrink-0 text-[10px] px-1.5 py-0"
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
          {account.health?.validation?.verification_url && (
            <button
              type="button"
              className="text-destructive inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
              onClick={() => openAccountValidationLink({ accountId: account.id })}
            >
              <ExternalLink className="h-3 w-3" />
              {t('cloud.card.completeValidation')}
            </button>
          )}

          {shouldShowAiCredits && aiCredits && (
            <span className="shrink-0 text-blue-500 text-[11px]">
              {t('cloud.card.aiCreditsValue', {
                amount: formatAiCreditsAmount(aiCredits.credits),
              })}
              {aiCredits.expiryDate && (
                <span className="text-muted-foreground text-[10px]">
                  {' '}
                  ·{' '}
                  {t('cloud.card.creditsExpiry', {
                    date: formatCreditsExpiry(aiCredits.expiryDate),
                  })}
                </span>
              )}
            </span>
          )}
        </div>

        {quotaWindow === 'dual' ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <div
              className={cn(
                'border-border/40 bg-muted/40 flex rounded-md border px-2 py-0.5',
                shouldBreakClaude5h ? 'items-start py-1 gap-1.5' : 'items-center gap-1.5',
              )}
            >
              <span
                className={cn(
                  'text-muted-foreground flex items-center gap-0.5 text-[10px] font-semibold shrink-0',
                  shouldBreakClaude5h && 'pt-0.5',
                )}
              >
                <Clock3 className="h-2.5 w-2.5" />
                5h
              </span>
              <div
                className={cn(
                  'ml-0.5 flex',
                  shouldBreakClaude5h ? 'flex-col gap-1' : 'flex-wrap items-center gap-2',
                )}
              >
                {gemini5hModels.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground/60 text-[9px] font-bold uppercase shrink-0 w-2.5 text-center">
                      G
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
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
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground/60 text-[9px] font-bold uppercase shrink-0 w-2.5 text-center">
                      C
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
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
              </div>
            </div>

            <div
              className={cn(
                'border-border/40 bg-muted/40 flex rounded-md border px-2 py-0.5',
                shouldBreakClaudeWeekly ? 'items-start py-1 gap-1.5' : 'items-center gap-1.5',
              )}
            >
              <span
                className={cn(
                  'text-muted-foreground flex items-center gap-0.5 text-[10px] font-semibold shrink-0',
                  shouldBreakClaudeWeekly && 'pt-0.5',
                )}
              >
                <CalendarDays className="h-2.5 w-2.5" />
                Week
              </span>
              <div
                className={cn(
                  'ml-0.5 flex',
                  shouldBreakClaudeWeekly ? 'flex-col gap-1' : 'flex-wrap items-center gap-2',
                )}
              >
                {geminiWeeklyItems.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground/60 text-[9px] font-bold uppercase shrink-0 w-2.5 text-center">
                      G
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {geminiWeeklyItems.map((item) => (
                        <QuotaIndicatorTooltip
                          key={item.id}
                          name={item.groupName}
                          label={item.bucketLabel}
                          percentage={item.percentage}
                          periodType="weekly"
                          resetTime={item.resetTime}
                          barWidth="w-7 sm:w-8"
                          barHeight="h-1.5"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {claudeWeeklyItems.length > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground/60 text-[9px] font-bold uppercase shrink-0 w-2.5 text-center">
                      C
                    </span>
                    <div className="flex flex-wrap items-center gap-1">
                      {claudeWeeklyItems.map((item) => (
                        <QuotaIndicatorTooltip
                          key={item.id}
                          name={item.groupName}
                          label={item.bucketLabel}
                          percentage={item.percentage}
                          periodType="weekly"
                          resetTime={item.resetTime}
                          barWidth="w-7 sm:w-8"
                          barHeight="h-1.5"
                        />
                      ))}
                    </div>
                  </div>
                )}
                {weeklyQuotaItems.length === 0 && (
                  <span className="text-muted-foreground text-[10px] italic">N/A</span>
                )}
              </div>
            </div>
          </div>
        ) : quotaWindow === 'weekly' ? (
          <WeeklyQuotaDisplay
            items={weeklyQuotaItems}
            hasQuotaSummary={account.quota?.quota_groups !== undefined}
            variant="compact"
          />
        ) : compactModels.length > 0 ? (
          <div
            className={cn(
              'mt-1 flex',
              shouldBreakClaude5h ? 'flex-col gap-1' : 'flex-wrap items-center gap-2',
            )}
          >
            {gemini5hModels.length > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground/60 text-[9px] font-bold uppercase shrink-0 w-2.5 text-center">
                  G
                </span>
                <div className="flex flex-wrap items-center gap-1">
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
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground/60 text-[9px] font-bold uppercase shrink-0 w-2.5 text-center">
                  C
                </span>
                <div className="flex flex-wrap items-center gap-1">
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
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
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
                {isActiveAnywhere ? t('cloud.card.active') : t('cloud.card.use')}
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
