import React from 'react';

import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight } from 'lucide-react';

import type { ProviderStats } from '@/modules/cloud-account/utils/provider-grouping';
import {
  clampQuotaPercentage,
  formatResetTimeLabel,
  formatResetTimeTitle,
} from '@/modules/cloud-account/utils/quota-display';
import { cn } from '@/shared/ui/utils';

interface ProviderGroupProps {
  stats: ProviderStats;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  getQuotaTextColorClass: (percentage: number) => string;
  getQuotaBarColorClass: (percentage: number) => string;
  formatQuotaLabel: (percentage: number) => string;
  leftLabel: string;
}

export const ProviderGroup: React.FC<ProviderGroupProps> = ({
  stats,
  isCollapsed,
  onToggleCollapse,
  getQuotaTextColorClass,
  getQuotaBarColorClass,
  formatQuotaLabel,
  leftLabel,
}) => {
  const { t } = useTranslation();
  const { providerInfo, visibleModels, avgPercentage, earliestReset } = stats;

  if (visibleModels.length === 0) {
    return null;
  }

  const gridStyle =
    visibleModels.length === 1
      ? undefined
      : { gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' };

  const gridColsClass =
    visibleModels.length === 1
      ? 'grid-cols-1'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="border-border/60 overflow-hidden rounded-lg border">
      {/* Provider Header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="hover:bg-muted/60 flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
        )}

        {/* Provider color dot */}
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: providerInfo.color }}
        />

        <span className="font-medium">{providerInfo.name}</span>

        <span className="text-muted-foreground text-xs">
          {t('settings.providerGroupings.models', { count: visibleModels.length })}
        </span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Averaged metrics */}
        <div className="flex items-center gap-2">
          {earliestReset && (
            <span
              className="text-muted-foreground text-[10px]"
              title={formatResetTimeTitle(earliestReset, t('cloud.card.resetTime'))}
            >
              {formatResetTimeLabel(earliestReset, { prefix: '', unknown: '' })}
            </span>
          )}
          <div className="flex items-baseline gap-1">
            <span
              className={`font-mono text-xs font-bold ${getQuotaTextColorClass(avgPercentage)}`}
            >
              {formatQuotaLabel(avgPercentage)}
            </span>
            {Number.isFinite(avgPercentage) && avgPercentage > 0 && (
              <span className="text-muted-foreground text-[10px]">
                {t('settings.providerGroupings.avgLabel')}
              </span>
            )}
          </div>
          <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all duration-300 ${getQuotaBarColorClass(avgPercentage)}`}
              style={{ width: `${clampQuotaPercentage(avgPercentage)}%` }}
            />
          </div>
        </div>
      </button>

      {/* Individual model rows (shown when expanded) */}
      {!isCollapsed && (
        <div
          className={cn('border-border/40 grid gap-1.5 border-t p-2', gridColsClass)}
          style={gridStyle}
        >
          {visibleModels.map((model) => {
            const rawTimeLabel = formatResetTimeLabel(model.resetTime, {
              prefix: '',
              unknown: '',
            }).trim();

            return (
              <div
                key={model.id}
                className="hover:bg-muted/60 bg-muted/15 flex flex-col justify-center gap-1 rounded-md border border-transparent p-2 text-sm transition-colors"
              >
                {/* Row 1: Model Name & Percentage */}
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="text-muted-foreground min-w-0 truncate text-xs font-semibold"
                    title={model.id}
                  >
                    {model.id.replace('models/', '')}
                  </span>
                  <div className="flex items-baseline gap-1 shrink-0">
                    <span
                      className={`font-mono text-xs leading-none font-bold ${getQuotaTextColorClass(model.percentage)}`}
                    >
                      {formatQuotaLabel(model.percentage)}
                    </span>
                    {model.percentage > 0 && (
                      <span className="text-muted-foreground text-[9px]">{leftLabel}</span>
                    )}
                  </div>
                </div>

                {/* Row 2: Slim Progress Bar & Countdown Time */}
                <div className="flex items-center gap-2">
                  <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getQuotaBarColorClass(model.percentage)}`}
                      style={{ width: `${clampQuotaPercentage(model.percentage)}%` }}
                    />
                  </div>
                  {rawTimeLabel && (
                    <span
                      className="text-muted-foreground/80 font-mono text-[10px] shrink-0 leading-none"
                      title={formatResetTimeTitle(model.resetTime, t('cloud.card.resetTime'))}
                    >
                      {rawTimeLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
