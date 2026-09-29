import { useTranslation } from 'react-i18next';
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
        <span className="text-muted-foreground/60 text-xs font-semibold tabular-nums">--</span>
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
      className="bg-muted/30 border-border/40 min-w-[170px] rounded-lg border px-3 py-1 shadow-sm"
      title={tooltipText}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground text-[9px] font-bold tracking-wider uppercase">
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: accentColor }}
        />
        <span className="truncate">{providerName}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <ProviderQuotaMetric label="5h" quota={quota.quota5h} status={quota.status5h} />
        <div className="bg-border/60 h-3 w-px shrink-0" />
        <ProviderQuotaMetric label="Wk" quota={quota.quotaWeekly} status={quota.statusWeekly} />
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
}: CloudAccountListSummaryProps) {
  const { t } = useTranslation();

  const hasGemini =
    Boolean(geminiQuota) && (geminiQuota?.quota5h !== null || geminiQuota?.quotaWeekly !== null);
  const hasClaude =
    Boolean(claudeQuota) && (claudeQuota?.quota5h !== null || claudeQuota?.quotaWeekly !== null);

  return (
    <div className="bg-card border-border/80 rounded-xl border px-4 py-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex shrink-0 flex-col">
          <h2 className="text-foreground text-lg font-bold tracking-tight">{t('cloud.title')}</h2>
          <p className="text-muted-foreground max-w-2xl text-xs">{t('cloud.description')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted/30 border-border/40 min-w-[70px] rounded-lg border px-3 py-1">
            <div className="text-muted-foreground text-[9px] font-bold tracking-wider uppercase">
              {t('cloud.card.actions')}
            </div>
            <div className="text-sm font-bold">{totalAccounts}</div>
          </div>
          <div className="bg-muted/30 border-border/40 min-w-[70px] rounded-lg border px-3 py-1">
            <div className="text-muted-foreground text-[9px] font-bold tracking-wider uppercase">
              {t('cloud.card.active')}
            </div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
              {activeAccounts}
            </div>
          </div>
          <div className="bg-muted/30 border-border/40 min-w-[70px] rounded-lg border px-3 py-1">
            <div className="text-muted-foreground text-[9px] font-bold tracking-wider uppercase">
              {t('cloud.card.rateLimited')}
            </div>
            <div className="text-sm font-bold text-rose-600 dark:text-rose-400">
              {rateLimitedAccounts}
            </div>
          </div>

          {/* Gemini Global Quota (5h + Weekly) */}
          {hasGemini && geminiQuota && (
            <ProviderQuotaCard
              providerName="Gemini"
              accentColor="#4285F4"
              quota={geminiQuota}
            />
          )}

          {/* Claude Global Quota (5h + Weekly) */}
          {hasClaude && claudeQuota && (
            <ProviderQuotaCard
              providerName="Claude"
              accentColor="#D97757"
              quota={claudeQuota}
            />
          )}

          {/* Fallback to legacy single overall quota bar if neither provider quota is available */}
          {!hasGemini && !hasClaude && overallQuotaPercentage !== null && (
            <div className="bg-muted/30 border-border/40 min-w-[130px] rounded-lg border px-3 py-1">
              <div className="text-muted-foreground text-[9px] font-bold tracking-wider uppercase">
                {t('cloud.globalQuota')}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <span
                  className={`text-sm font-bold ${GLOBAL_QUOTA_TEXT_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]}`}
                >
                  {overallQuotaPercentage}%
                </span>
                <div className="bg-muted/60 border-border/20 h-1.5 w-16 overflow-hidden rounded-full border shadow-inner">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${GLOBAL_QUOTA_BAR_COLOR_CLASS_BY_STATUS[effectiveQuotaStatus]}`}
                    style={{ width: `${clampQuotaPercentage(overallQuotaPercentage)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
