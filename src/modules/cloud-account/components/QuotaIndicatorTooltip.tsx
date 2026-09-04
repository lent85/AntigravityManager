import { Clock3, CalendarDays, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  clampQuotaPercentage,
  formatModelDisplayName,
  formatResetTimeLabel,
  formatResetTimeTitle,
  getQuotaStatus,
} from '@/modules/cloud-account/utils/quota-display';
import { QUOTA_BAR_COLOR_CLASS_BY_STATUS, QUOTA_TEXT_COLOR_CLASS_BY_STATUS } from './quota-colors';
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
  const status = getQuotaStatus(percentage);
  const clamped = clampQuotaPercentage(percentage);
  const title = displayName || formatModelDisplayName(name);

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
              className={cn(
                'h-full rounded-full transition-all duration-300',
                QUOTA_BAR_COLOR_CLASS_BY_STATUS[status],
              )}
              style={{ width: `${clamped}%` }}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="bg-popover text-popover-foreground w-60 rounded-lg border p-2.5 shadow-lg"
        >
          {/* Header: Title & Period Badge */}
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-xs font-semibold text-foreground">{title}</span>
            <Badge
              variant="outline"
              className="flex shrink-0 items-center gap-1 px-1.5 py-0 text-[9px] font-medium"
            >
              {periodType === 'weekly' ? (
                <CalendarDays className="h-2.5 w-2.5 opacity-70" />
              ) : (
                <Clock3 className="h-2.5 w-2.5 opacity-70" />
              )}
              <span>{defaultPeriodLabel}</span>
            </Badge>
          </div>

          {/* Percentage and Mini Bar */}
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground text-[11px]">
                {t('cloud.card.quotaStatus', 'Quota Remaining')}
              </span>
              <span className={cn('font-mono font-bold text-xs', QUOTA_TEXT_COLOR_CLASS_BY_STATUS[status])}>
                {percentage}%
              </span>
            </div>
            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
              <div
                className={cn('h-full rounded-full transition-all duration-300', QUOTA_BAR_COLOR_CLASS_BY_STATUS[status])}
                style={{ width: `${clamped}%` }}
              />
            </div>
          </div>

          {/* Reset / Countdown Information */}
          {resetTime && (
            <div className="mt-2 flex items-center justify-between border-t pt-1.5 text-[10px]">
              <span className="text-muted-foreground flex items-center gap-1">
                <Clock3 className="h-3 w-3 opacity-60" />
                <span>{t('cloud.card.resetPrefix', 'Resets in')}:</span>
              </span>
              <span
                className="font-mono font-medium text-foreground"
                title={formattedResetTitle}
              >
                {formattedResetLabel.replace(/^[^:]*:\s*/, '')}
              </span>
            </div>
          )}

          {/* Live limit notice if available */}
          {liveLimitStatus && (
            <div className="mt-2 flex items-start gap-1.5 rounded bg-amber-500/10 p-1.5 text-[10px] text-amber-700 dark:text-amber-300">
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
