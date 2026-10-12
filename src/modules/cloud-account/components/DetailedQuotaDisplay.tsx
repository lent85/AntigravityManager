import { useTranslation } from 'react-i18next';
import type { CloudQuotaGroup } from '@/modules/cloud-account/types';
import type { QuotaWindow } from '@/modules/cloud-account/utils/quota-groups';
import { isWeeklyQuotaBucket } from '@/modules/cloud-account/utils/quota-groups';
import {
  clampQuotaPercentage,
  formatResetTimeLabel,
  formatResetTimeTitle,
  getQuotaStatus,
} from '@/modules/cloud-account/utils/quota-display';
import {
  getQuotaBarColorClassByPercentage,
  getQuotaTextColorClassByPercentage,
} from './quota-colors';

/** Retains detailed quota buckets based on the active quota window. */
export function DetailedQuotaDisplay({
  groups,
  quotaWindow = '5h',
}: {
  groups: CloudQuotaGroup[];
  quotaWindow?: QuotaWindow;
}) {
  const { t } = useTranslation();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      buckets:
        quotaWindow === 'dual'
          ? group.buckets
          : quotaWindow === 'weekly'
            ? group.buckets.filter((bucket) => isWeeklyQuotaBucket(bucket))
            : group.buckets.filter((bucket) => !isWeeklyQuotaBucket(bucket)),
    }))
    .filter((group) => group.buckets.length > 0);

  if (visibleGroups.length === 0) {
    return null;
  }

  // In single mode (5h / weekly) with multiple groups, display the group boxes side-by-side in 2 columns.
  // In dual mode (or single group), group boxes span full width with their 2 sub-buckets side-by-side.
  const groupsGridClass =
    quotaWindow !== 'dual' && visibleGroups.length >= 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
      : 'grid grid-cols-1 gap-3';

  return (
    <div className="border-border/60 mt-3 space-y-2 border-t pt-3">
      <div className="text-muted-foreground px-2 text-xs font-semibold">
        {t('cloud.card.detailedQuota')}
      </div>
      <div className={groupsGridClass}>
        {visibleGroups.map((group) => {
          const bucketGridClass =
            group.buckets.length === 1
              ? 'grid grid-cols-1'
              : 'grid grid-cols-1 sm:grid-cols-2 gap-2';

          return (
            <div key={group.display_name} className="bg-muted/25 rounded-lg border px-3 py-2.5">
              <div className="mb-1.5 text-xs font-semibold">
                {group.display_name || t('cloud.card.quotaGroupUnknown')}
              </div>
              {group.description && (
                <p className="text-muted-foreground mb-2 text-xs">{group.description}</p>
              )}
              <div className={bucketGridClass}>
                {group.buckets.map((bucket) => {
                  const percentage = Math.round(bucket.remaining_fraction * 100);
                  const label = bucket.display_name || bucket.window || bucket.bucket_id;
                  return (
                    <div
                      key={`${bucket.bucket_id}:${bucket.window}`}
                      className="bg-background/70 rounded-md border px-2.5 py-2"
                    >
                      <div className="mb-1 flex justify-between gap-2 text-xs">
                        <span className="font-medium">{label}</span>
                        <span
                          className={getQuotaTextColorClassByPercentage(percentage)}
                        >
                          {percentage}%
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label={`${group.display_name}: ${label}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={clampQuotaPercentage(percentage)}
                        className="bg-muted h-1.5 overflow-hidden rounded-full"
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${getQuotaBarColorClassByPercentage(percentage)}`}
                          style={{ width: `${clampQuotaPercentage(percentage)}%` }}
                        />
                      </div>
                      <div
                        className="text-muted-foreground mt-1 text-xs"
                        title={formatResetTimeTitle(bucket.reset_time, t('cloud.card.resetTime'))}
                      >
                        {formatResetTimeLabel(bucket.reset_time, {
                          prefix: t('cloud.card.resetPrefix'),
                          unknown: t('cloud.card.resetUnknown'),
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
