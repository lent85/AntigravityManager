import { useTranslation } from 'react-i18next';
import { Users, CircleCheck, Clock3, Gauge } from 'lucide-react';
import {
  GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS,
  GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS,
} from '@/modules/cloud-account/components/CloudAccountList.constants';
import {
  clampQuotaPercentage,
  type QuotaStatus,
} from '@/modules/cloud-account/utils/quota-display';
import type { ProviderGlobalQuota } from '@/modules/cloud-account/utils/quota-provider-summary';

interface CloudAccountListSummaryProps {
  totalAccounts: number;
  activeAccounts: number;
  rateLimitedAccounts: number;
  overallQuotaPercentage: number | null;
  effectiveQuotaStatus: QuotaStatus;
  geminiQuota?: ProviderGlobalQuota | null;
  claudeQuota?: ProviderGlobalQuota | null;
  overallWeeklyQuotaPercentage?: number | null;
  effectiveWeeklyQuotaStatus?: QuotaStatus;
  isMinimalMode?: boolean;
}

function ProviderQuotaMetric({
  label,
  quota,
  status,
}: {
  label: string;
  quota: number | null;
  status: QuotaStatus;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {quota !== null ? (
        <>
          <span
            className={`text-xs font-semibold tabular-nums ${GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[status]}`}
          >
            {quota}%
          </span>
          <div className="bg-muted h-1.5 w-9 overflow-hidden rounded-full">
            <div
              className={`h-full rounded-full transition-all duration-300 ${GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS[status]}`}
              style={{ width: `${clampQuotaPercentage(quota)}%` }}
            />
          </div>
        </>
      ) : (
        <span className="text-muted-foreground text-xs">--</span>
      )}
    </div>
  );
}

export function CloudAccountListSummary({
  totalAccounts,
  activeAccounts,
  rateLimitedAccounts,
  overallQuotaPercentage,
  effectiveQuotaStatus,
  geminiQuota,
  claudeQuota,
  overallWeeklyQuotaPercentage = null,
  effectiveWeeklyQuotaStatus = 'low',
  isMinimalMode = false,
}: CloudAccountListSummaryProps) {
  const { t } = useTranslation();

  if (isMinimalMode) {
    return (
      <header data-slot="cloud-account-summary" className="flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <div className="bg-info-soft text-info border-info-border flex size-8 shrink-0 items-center justify-center rounded-lg border">
            <Users className="size-4" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-baseline gap-2">
              <h1 className="text-foreground text-lg font-semibold tracking-tight">{t('cloud.title')}</h1>
              <p className="text-muted-foreground text-xs hidden sm:inline">
                {t('cloud.description')}
              </p>
            </div>
            <p className="text-muted-foreground text-xs sm:hidden">
              {t('cloud.description')}
            </p>
          </div>
        </div>

        <dl className="divide-border grid shrink-0 grid-cols-2 divide-y overflow-hidden rounded-lg border shadow-2xs sm:grid-cols-5 sm:divide-x sm:divide-y-0">
          <div className="bg-info-soft flex items-center justify-between px-3 py-1.5 sm:flex-col sm:justify-center sm:text-center">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.total-accounts')}
            </dt>
            <dd className="text-foreground sm:mt-0.5 text-xs font-semibold tabular-nums">
              {totalAccounts}
            </dd>
          </div>
          <div className="bg-success-soft flex items-center justify-between px-3 py-1.5 sm:flex-col sm:justify-center sm:text-center">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.card.active')}
            </dt>
            <dd className="text-success sm:mt-0.5 text-xs font-semibold tabular-nums">
              {activeAccounts}
            </dd>
          </div>
          <div className="bg-warning-soft flex items-center justify-between px-3 py-1.5 sm:flex-col sm:justify-center sm:text-center">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.card.rateLimited')}
            </dt>
            <dd
              className={`sm:mt-0.5 text-xs font-semibold tabular-nums ${
                rateLimitedAccounts > 0 ? 'text-warning font-bold' : 'text-foreground'
              }`}
            >
              {rateLimitedAccounts}
            </dd>
          </div>
          <div className="bg-card flex items-center justify-between px-3 py-1.5 sm:flex-col sm:justify-center sm:text-center">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.globalQuota')}
            </dt>
            <dd
              className={`sm:mt-0.5 text-xs font-semibold tabular-nums ${
                overallQuotaPercentage !== null
                  ? GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]
                  : 'text-muted-foreground'
              }`}
            >
              {overallQuotaPercentage !== null ? `${overallQuotaPercentage}%` : '-'}
            </dd>
          </div>
          <div className="bg-card col-span-2 flex items-center justify-between px-3 py-1.5 sm:col-span-1 sm:flex-col sm:justify-center sm:text-center">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.weeklyQuota', 'Weekly Quota')}
            </dt>
            <dd
              className={`sm:mt-0.5 text-xs font-semibold tabular-nums ${
                overallWeeklyQuotaPercentage !== null
                  ? GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveWeeklyQuotaStatus]
                  : 'text-muted-foreground'
              }`}
            >
              {overallWeeklyQuotaPercentage !== null ? `${overallWeeklyQuotaPercentage}%` : '-'}
            </dd>
          </div>
        </dl>
      </header>
    );
  }

  const hasGemini =
    Boolean(geminiQuota) && (geminiQuota?.quota5h !== null || geminiQuota?.quotaWeekly !== null);
  const hasClaude =
    Boolean(claudeQuota) && (claudeQuota?.quota5h !== null || claudeQuota?.quotaWeekly !== null);

  return (
    <header data-slot="cloud-account-summary" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <div className="bg-info-soft text-info border-info-border flex size-8 shrink-0 items-center justify-center rounded-lg border">
          <Users className="size-4" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-2">
            <h1 className="text-foreground text-lg font-semibold tracking-tight">{t('cloud.title')}</h1>
            <p className="text-muted-foreground text-xs hidden sm:inline">
              {t('cloud.description')}
            </p>
          </div>
          <p className="text-muted-foreground text-xs sm:hidden">
            {t('cloud.description')}
          </p>
        </div>
      </div>

      <dl
        data-slot="cloud-account-summary-metrics"
        className="bg-card/75 border-border/80 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-3 py-2 text-xs shadow-2xs"
      >
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5" title={t('cloud.total-accounts')}>
            <div className="bg-info-soft text-info flex size-5 shrink-0 items-center justify-center rounded-md">
              <Users className="size-3" aria-hidden="true" />
            </div>
            <dt className="text-muted-foreground text-xs font-normal">{t('cloud.total-accounts')}:</dt>
            <dd className="text-foreground text-xs font-semibold tabular-nums">{totalAccounts}</dd>
          </div>

          <span className="bg-border/60 hidden h-3.5 w-px sm:inline-block" aria-hidden="true" />

          <div className="flex items-center gap-1.5" title={t('cloud.card.active')}>
            <div className="bg-success-soft text-success flex size-5 shrink-0 items-center justify-center rounded-md">
              <CircleCheck className="size-3" aria-hidden="true" />
            </div>
            <dt className="text-muted-foreground text-xs font-normal">{t('cloud.card.active')}:</dt>
            <dd className="text-success text-xs font-semibold tabular-nums">{activeAccounts}</dd>
          </div>

          <span className="bg-border/60 hidden h-3.5 w-px sm:inline-block" aria-hidden="true" />

          <div className="flex items-center gap-1.5" title={t('cloud.card.rateLimited')}>
            <div
              className={`flex size-5 shrink-0 items-center justify-center rounded-md ${
                rateLimitedAccounts > 0
                  ? 'bg-warning-soft text-warning animate-pulse'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Clock3 className="size-3" aria-hidden="true" />
            </div>
            <dt className="text-muted-foreground text-xs font-normal">{t('cloud.card.rateLimited')}:</dt>
            <dd
              className={`text-xs font-semibold tabular-nums ${
                rateLimitedAccounts > 0 ? 'text-warning font-bold' : 'text-foreground'
              }`}
            >
              {rateLimitedAccounts}
            </dd>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:gap-4">
          {overallQuotaPercentage !== null && (
            <div className="flex items-center gap-1.5" title={t('cloud.globalQuota')}>
              <Gauge className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
              <dt className="text-muted-foreground text-xs font-normal">{t('cloud.globalQuota')}:</dt>
              <dd className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-semibold tabular-nums ${GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]}`}
                >
                  {overallQuotaPercentage}%
                </span>
                <div className="bg-muted h-1.5 w-9 overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]}`}
                    style={{ width: `${clampQuotaPercentage(overallQuotaPercentage)}%` }}
                  />
                </div>
              </dd>
            </div>
          )}

          {hasGemini && geminiQuota && (
            <div
              className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-border/60"
              title={`Gemini - 5h: ${geminiQuota.quota5h !== null ? `${geminiQuota.quota5h}%` : 'N/A'}, Wk: ${geminiQuota.quotaWeekly !== null ? `${geminiQuota.quotaWeekly}%` : 'N/A'}`}
            >
              <span className="size-2 shrink-0 rounded-full bg-[#4285F4]" aria-hidden="true" />
              <dt className="text-foreground text-xs font-medium">Gemini</dt>
              <dd className="flex items-center gap-2">
                <ProviderQuotaMetric label="5h" quota={geminiQuota.quota5h} status={geminiQuota.status5h} />
                <span className="text-border/70 text-xs">/</span>
                <ProviderQuotaMetric label="Wk" quota={geminiQuota.quotaWeekly} status={geminiQuota.statusWeekly} />
              </dd>
            </div>
          )}

          {hasClaude && claudeQuota && (
            <div
              className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-border/60"
              title={`Claude - 5h: ${claudeQuota.quota5h !== null ? `${claudeQuota.quota5h}%` : 'N/A'}, Wk: ${claudeQuota.quotaWeekly !== null ? `${claudeQuota.quotaWeekly}%` : 'N/A'}`}
            >
              <span className="size-2 shrink-0 rounded-full bg-[#D97757]" aria-hidden="true" />
              <dt className="text-foreground text-xs font-medium">Claude</dt>
              <dd className="flex items-center gap-2">
                <ProviderQuotaMetric label="5h" quota={claudeQuota.quota5h} status={claudeQuota.status5h} />
                <span className="text-border/70 text-xs">/</span>
                <ProviderQuotaMetric label="Wk" quota={claudeQuota.quotaWeekly} status={claudeQuota.statusWeekly} />
              </dd>
            </div>
          )}

          {overallWeeklyQuotaPercentage !== null && !hasGemini && !hasClaude && (
            <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-border/60" title={t('cloud.weeklyQuota', 'Weekly Quota')}>
              <dt className="text-muted-foreground text-xs font-normal">{t('cloud.weeklyQuota', 'Weekly Quota')}:</dt>
              <dd className="flex items-center gap-1.5">
                <span
                  className={`text-xs font-semibold tabular-nums ${GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveWeeklyQuotaStatus]}`}
                >
                  {overallWeeklyQuotaPercentage}%
                </span>
                <div className="bg-muted h-1.5 w-9 overflow-hidden rounded-full">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS[effectiveWeeklyQuotaStatus]}`}
                    style={{ width: `${clampQuotaPercentage(overallWeeklyQuotaPercentage)}%` }}
                  />
                </div>
              </dd>
            </div>
          )}
        </div>
      </dl>
    </header>
  );
}
