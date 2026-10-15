import { Clock3, CalendarDays, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  clampQuotaPercentage,
  formatModelDisplayName,
  formatResetTimeLabel,
  formatResetTimeTitle,
} from '@/modules/cloud-account/utils/quota-display';
import {
  getModelQuotaBarColorClass,
  getModelQuotaTextColorClass,
  detectModelGeneration,
  MODEL_GENERATION_METAS,
} from './quota-colors';
import { cn } from '@/shared/ui/utils';

export interface QuotaIndicatorTooltipProps {
  name: string;
  displayName?: string;
  periodType?: '5h' | 'weekly';
  periodLabel?: string;
  label?: string;
  percentage: number;
  resetTime?: string;
  barWidth?: string;
  barHeight?: string;
  className?: string;
  liveLimitStatus?: string;
  liveLimitReason?: string;
  liveLimitMessage?: string;
}

export function QuotaIndicatorTooltip({
  name,
  displayName,
  periodType = '5h',
  periodLabel,
  label,
  percentage,
  resetTime,
  barWidth = 'w-12',
  barHeight = 'h-1.5',
  className,
  liveLimitStatus,
  liveLimitReason,
  liveLimitMessage,
}: QuotaIndicatorTooltipProps) {
  const effectivePeriodLabel = periodLabel || label;
  const { t } = useTranslation();
  const clamped = clampQuotaPercentage(percentage);
  const title = displayName || formatModelDisplayName(name);
  const cleanModelId = name.replace(/^models\//i, '').trim();
  const showModelId = cleanModelId.toLowerCase() !== title.toLowerCase();

  const genKey = detectModelGeneration(name, displayName);
  const genMeta = MODEL_GENERATION_METAS[genKey];
  const barColorClass = getModelQuotaBarColorClass(name, percentage, displayName);
  const textColorClass = getModelQuotaTextColorClass(name, percentage, displayName);

  const defaultPeriodLabel =
    effectivePeriodLabel ||
    (periodType === 'weekly'
      ? t('cloud.quota-window.weekly', 'Weekly Quota')
      : t('cloud.quota-window.five-hours', '5-Hour Window'));

  const formattedResetLabel = formatResetTimeLabel(resetTime, {
    prefix: t('cloud.card.resetPrefix', 'Reset in'),
    unknown: t('cloud.card.resetUnknown', 'Unknown'),
  });

  const formattedResetTitle = formatResetTimeTitle(
    resetTime,
    t('cloud.card.resetTime', 'Reset Time'),
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            tabIndex={0}
            role="progressbar"
            aria-label={`${title} (${defaultPeriodLabel}): ${percentage}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={clamped}
            className={cn(
              'bg-muted relative cursor-pointer overflow-hidden rounded-full transition-transform hover:scale-105',
              barWidth,
              barHeight,
              className,
            )}
          >
            <div
              className={cn('h-full rounded-full transition-all duration-300', barColorClass)}
              style={{ width: `${clamped}%` }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="bg-popover text-popover-foreground w-64 rounded-lg border p-3 shadow-lg space-y-2.5"
        >
          {/* Header: Full Model Name (never truncated) + Generation Category Badge */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold leading-snug text-foreground break-words">
                {title}
              </div>
              {showModelId && (
                <div
                  className="font-mono text-[9px] text-muted-foreground/75 truncate mt-0.5"
                  title={cleanModelId}
                >
                  {cleanModelId}
                </div>
              )}
            </div>
            {genMeta && (
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 text-[9px] font-bold shrink-0 tracking-tight',
                  genMeta.badgeClass,
                )}
              >
                {genMeta.badgeLabel}
              </span>
            )}
          </div>

          {/* Percentage and Mini Bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">
                {t('cloud.card.quotaStatus', 'Quota Remaining')}
              </span>
              <span className={cn('font-mono font-bold text-xs', textColorClass)}>
                {percentage}%
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-all duration-300', barColorClass)}
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>

          {/* Footer: Quota Window & Reset Countdown (unified, no duplicated 5h badges) */}
          <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1 font-medium">
              {periodType === 'weekly' ? (
                <CalendarDays className="h-3 w-3 opacity-70" />
              ) : (
                <Clock3 className="h-3 w-3 opacity-70" />
              )}
              <span>{defaultPeriodLabel}</span>
            </div>

            {resetTime ? (
              <div
                className="font-mono font-medium text-foreground flex items-center gap-1"
                title={formattedResetTitle}
              >
                <span>{formattedResetLabel.replace(/^[^:]*:\s*/, '')}</span>
              </div>
            ) : (
              <span className="text-[9px] italic opacity-60">
                100%
              </span>
            )}
          </div>

          {/* Live limit notice if available */}
          {liveLimitStatus && (
            <div className="flex items-start gap-1.5 rounded bg-amber-500/10 p-1.5 text-[10px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
              <div className="min-w-0">
                <div className="font-semibold">
                  {liveLimitStatus}: {liveLimitReason}
                </div>
                {liveLimitMessage && <div className="truncate opacity-80">{liveLimitMessage}</div>}
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
