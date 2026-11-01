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
      <span className="text-muted-foreground text-[10px] font-semibold">{label}</span>
      {quota !== null ? (
        <>
          <span
            className={`text-xs font-bold tabular-nums ${GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[status]}`}
          >
            {quota}%
          </span>
          <div className="bg-muted/60 border-border/20 h-1.5 w-10 overflow-hidden rounded-full border shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-500 ${GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS[status]}`}
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

function ProviderQuotaCard({
  providerName,
  accentColor,
  quota,
}: {
  providerName: string;
  accentColor: string;
  quota: ProviderGlobalQuota;
}) {
  const tooltipText = `${providerName} - 5h: ${quota.quota5h !== null ? `${quota.quota5h}%` : 'N/A'}, Weekly: ${quota.quotaWeekly !== null ? `${quota.quotaWeekly}%` : 'N/A'}`;

  return (
    <div
      className="bg-card flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
      title={tooltipText}
    >
      <div>
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: accentColor }}
          />
          <dt className="truncate">{providerName}</dt>
        </div>
        <dd className="mt-1 flex items-center gap-2">
          <ProviderQuotaMetric label="5h" quota={quota.quota5h} status={quota.status5h} />
          <div className="bg-border/60 h-3 w-px shrink-0" />
          <ProviderQuotaMetric label="Wk" quota={quota.quotaWeekly} status={quota.statusWeekly} />
        </dd>
      </div>
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
      <header data-slot="cloud-account-summary" className="flex flex-col gap-6">
        <div className="flex items-center gap-4 [@media(max-width:760px)]:items-start [@media(max-width:760px)]:gap-3">
          <div className="bg-info-soft text-info border-info-border flex size-10 shrink-0 items-center justify-center rounded-lg border">
            <Users className="size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-foreground text-page-title text-balance">{t('cloud.title')}</h1>
            <p className="text-muted-foreground mt-1 max-w-[65ch] text-sm">
              {t('cloud.description')}
            </p>
          </div>
        </div>

        <dl className="divide-border grid shrink-0 grid-cols-2 gap-4 divide-y overflow-hidden rounded-lg border shadow-sm sm:grid-cols-5 sm:divide-x sm:divide-y-0 [@media(max-width:760px)]:grid-cols-2 [@media(max-width:760px)]:gap-2">
          <div className="bg-info-soft rounded-lg px-5 py-4 text-center [@media(max-width:760px)]:p-3">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.total-accounts')}
            </dt>
            <dd className="text-foreground mt-1 text-2xl leading-8 font-semibold tabular-nums">
              {totalAccounts}
            </dd>
          </div>
          <div className="bg-success-soft rounded-lg px-5 py-4 text-center [@media(max-width:760px)]:p-3">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.card.active')}
            </dt>
            <dd className="text-foreground mt-1 text-2xl leading-8 font-semibold tabular-nums">
              {activeAccounts}
            </dd>
          </div>
          <div className="bg-warning-soft rounded-lg px-5 py-4 text-center [@media(max-width:760px)]:p-3">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.card.rateLimited')}
            </dt>
            <dd className="text-foreground mt-1 text-2xl leading-8 font-semibold tabular-nums">
              {rateLimitedAccounts}
            </dd>
          </div>
          <div className="bg-card rounded-lg px-5 py-4 text-center [@media(max-width:760px)]:p-3">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.globalQuota')}
            </dt>
            <dd
              className={`mt-1 text-2xl leading-8 font-semibold tabular-nums ${
                overallQuotaPercentage !== null
                  ? GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]
                  : 'text-muted-foreground'
              }`}
            >
              {overallQuotaPercentage !== null ? `${overallQuotaPercentage}%` : '-'}
            </dd>
          </div>
          <div className="bg-card col-span-2 rounded-lg px-5 py-4 text-center sm:col-span-1 [@media(max-width:760px)]:p-3">
            <dt className="text-muted-foreground text-xs whitespace-nowrap">
              {t('cloud.weeklyQuota', 'Weekly Quota')}
            </dt>
            <dd
              className={`mt-1 text-2xl leading-8 font-semibold tabular-nums ${
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
    <header data-slot="cloud-account-summary" className="flex flex-col gap-6">
      <div className="flex items-center gap-4 [@media(max-width:760px)]:items-start [@media(max-width:760px)]:gap-3">
        <div className="bg-info-soft text-info border-info-border flex size-10 shrink-0 items-center justify-center rounded-lg border">
          <Users className="size-5" aria-hidden="true" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-foreground text-page-title text-balance">{t('cloud.title')}</h1>
          <p className="text-muted-foreground mt-1 max-w-[65ch] text-sm">
            {t('cloud.description')}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4 [@media(max-width:760px)]:gap-2">
        <div className="bg-info-soft border-info-border flex items-center justify-between gap-3 rounded-lg border px-5 py-4 [@media(max-width:760px)]:p-3">
          <div>
            <dt className="text-muted-foreground text-xs">{t('cloud.total-accounts')}</dt>
            <dd className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {totalAccounts}
            </dd>
          </div>
          <Users
            className="text-info size-5 shrink-0 [@media(max-width:760px)]:hidden"
            aria-hidden="true"
          />
        </div>
        <div className="bg-success-soft border-success-border flex items-center justify-between gap-3 rounded-lg border px-5 py-4 [@media(max-width:760px)]:p-3">
          <div>
            <dt className="text-muted-foreground text-xs">{t('cloud.card.active')}</dt>
            <dd className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {activeAccounts}
            </dd>
          </div>
          <CircleCheck
            className="text-success size-5 shrink-0 [@media(max-width:760px)]:hidden"
            aria-hidden="true"
          />
        </div>
        <div className="bg-warning-soft border-warning-border flex items-center justify-between gap-3 rounded-lg border px-5 py-4 [@media(max-width:760px)]:p-3">
          <div>
            <dt className="text-muted-foreground text-xs">{t('cloud.card.rateLimited')}</dt>
            <dd className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
              {rateLimitedAccounts}
            </dd>
          </div>
          <Clock3
            className="text-warning size-5 shrink-0 [@media(max-width:760px)]:hidden"
            aria-hidden="true"
          />
        </div>
        {overallQuotaPercentage !== null && (
          <div className="bg-card flex items-center justify-between gap-3 rounded-lg border px-5 py-4 [@media(max-width:760px)]:p-3">
            <div>
              <dt className="text-muted-foreground text-xs">{t('cloud.globalQuota')}</dt>
              <dd className="mt-1 flex items-center gap-2.5">
                <span
                  className={`text-2xl font-semibold tabular-nums ${GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]}`}
                >
                  {overallQuotaPercentage}%
                </span>
                <div className="bg-muted h-1.5 w-12 overflow-hidden rounded-full [@media(max-width:760px)]:hidden">
                  <div
                    className={`h-full rounded-full ${GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]}`}
                    style={{ width: `${clampQuotaPercentage(overallQuotaPercentage)}%` }}
                  />
                </div>
              </dd>
            </div>
            <Gauge
              className="text-muted-foreground size-5 shrink-0 [@media(max-width:760px)]:hidden"
              aria-hidden="true"
            />
          </div>
        )}

        {hasGemini && geminiQuota && (
          <ProviderQuotaCard providerName="Gemini" accentColor="#4285F4" quota={geminiQuota} />
        )}

        {hasClaude && claudeQuota && (
          <ProviderQuotaCard providerName="Claude" accentColor="#D97757" quota={claudeQuota} />
        )}
      </dl>
    </header>
  );
}
