import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CompactQuotaRow } from '@/modules/cloud-account/components/CompactQuotaRow';
import {
  getModelQuotaBarColorClass,
  detectModelGeneration,
  MODEL_GENERATION_METAS,
} from '@/modules/cloud-account/components/quota-colors';
import { clampQuotaPercentage } from '@/modules/cloud-account/utils/quota-display';
import { cn } from '@/shared/ui/utils';

export interface CompactModelQuotaItem {
  id: string;
  label: string;
  percentage: number;
}

interface CompactModelQuotaDisplayProps {
  items: CompactModelQuotaItem[];
}

export function CompactModelQuotaDisplay({ items }: CompactModelQuotaDisplayProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return null;
  }

  return (
    <CompactQuotaRow label={t('cloud.quota-window.five-hours-short')}>
      {items.map((item) => {
        const genKey = detectModelGeneration(item.id);
        const meta = MODEL_GENERATION_METAS[genKey];

        return (
          <div key={item.id} className="flex min-w-0 flex-col gap-1">
            <span className="text-muted-foreground block truncate text-[10px]" title={item.label}>
              {item.label}
            </span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    role="progressbar"
                    aria-label={item.label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={clampQuotaPercentage(item.percentage)}
                    className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-300',
                        getModelQuotaBarColorClass(item.id, item.percentage),
                      )}
                      style={{ width: `${clampQuotaPercentage(item.percentage)}%` }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-1.5">
                    {meta && (
                      <span
                        className={cn(
                          'rounded border px-1 py-0 text-[9px] font-bold',
                          meta.badgeClass,
                        )}
                      >
                        {meta.badgeLabel}
                      </span>
                    )}
                    <span className="text-xs font-medium">
                      {item.label}: {item.percentage}%
                    </span>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        );
      })}
    </CompactQuotaRow>
  );
}
