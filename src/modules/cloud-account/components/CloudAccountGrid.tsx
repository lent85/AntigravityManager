import { useMemo } from 'react';
import { Cloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  CloudAccountCard,
  CompactCloudAccountCard,
} from '@/modules/cloud-account/components/CloudAccountCard';
import { DualCompactCloudAccountCard } from '@/modules/cloud-account/components/DualCompactCloudAccountCard';
import { FamilyCloudAccountCard } from '@/modules/cloud-account/components/FamilyCloudAccountCard';
import {
  GRID_LAYOUT_CLASSES,
  type GridLayout,
} from '@/modules/cloud-account/components/CloudAccountList.constants';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';
import type { CloudAccount } from '@/modules/cloud-account/types';
import type { QuotaWindow } from '@/modules/cloud-account/utils/quota-groups';
import { useFamilyGroups } from '@/modules/cloud-account/hooks/useFamilyGroups';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import type { AccountFamilyGroup } from '@/modules/cloud-account/persistence/family-group-store';

interface CloudAccountGridProps {
  accounts: CloudAccount[];
  sourceAccountCount: number;
  gridLayout: GridLayout;
  quotaWindow: QuotaWindow;
  selectedIds: Set<string>;
  hasActiveTierFilter: boolean;
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
  onResetTierFilter: () => void;
  onManageFamily?: (groupIdOrAccountId: string) => void;
}

type GridDisplayItem =
  | { type: 'family'; group: AccountFamilyGroup; accounts: CloudAccount[] }
  | { type: 'single'; account: CloudAccount };

export function CloudAccountGrid({
  accounts,
  sourceAccountCount,
  gridLayout,
  quotaWindow,
  selectedIds,
  hasActiveTierFilter,
  refreshingAccountId,
  deletingAccountId,
  switchingAccountId,
  switchingTarget,
  onRefresh,
  onDelete,
  onSwitch,
  onMarkActive,
  onManageIdentity,
  onToggleSelection,
  onResetTierFilter,
  onManageFamily = () => {},
}: CloudAccountGridProps) {
  const { t } = useTranslation();
  const { config } = useAppConfig();
  const { data: familyGroups = [] } = useFamilyGroups();

  const isFamilyGrouped = config?.group_family_accounts_enabled !== false;

  // Group items if family grouping is enabled
  const displayItems = useMemo<GridDisplayItem[]>(() => {
    if (!isFamilyGrouped || familyGroups.length === 0) {
      return accounts.map((account) => ({ type: 'single', account }));
    }

    const items: GridDisplayItem[] = [];
    const handledGroupIds = new Set<string>();
    const handledAccountIds = new Set<string>();

    for (const account of accounts) {
      if (handledAccountIds.has(account.id)) {
        continue;
      }

      // Check if account belongs to a family group
      const group = familyGroups.find((g) => g.accountIds.includes(account.id));
      if (group && !handledGroupIds.has(group.id)) {
        handledGroupIds.add(group.id);
        // Find all accounts belonging to this group
        const groupAccounts = accounts.filter((a) => group.accountIds.includes(a.id));
        for (const ga of groupAccounts) {
          handledAccountIds.add(ga.id);
        }
        items.push({
          type: 'family',
          group,
          accounts: groupAccounts,
        });
      } else if (!group) {
        handledAccountIds.add(account.id);
        items.push({ type: 'single', account });
      }
    }

    return items;
  }, [accounts, familyGroups, isFamilyGrouped]);

  return (
    <div className={GRID_LAYOUT_CLASSES[gridLayout]}>
      {displayItems.map((item) => {
        if (item.type === 'family') {
          return (
            <FamilyCloudAccountCard
              key={`family-${item.group.id}`}
              familyGroup={item.group}
              accounts={item.accounts}
              gridLayout={gridLayout}
              quotaWindow={quotaWindow}
              selectedIds={selectedIds}
              refreshingAccountId={refreshingAccountId}
              deletingAccountId={deletingAccountId}
              switchingAccountId={switchingAccountId}
              switchingTarget={switchingTarget}
              onRefresh={onRefresh}
              onDelete={onDelete}
              onSwitch={onSwitch}
              onMarkActive={onMarkActive}
              onManageIdentity={onManageIdentity}
              onToggleSelection={onToggleSelection}
              onManageFamily={onManageFamily}
            />
          );
        }

        const account = item.account;

        if (gridLayout === 'compact-dual') {
          return (
            <DualCompactCloudAccountCard
              key={account.id}
              account={account}
              onRefresh={onRefresh}
              onDelete={onDelete}
              onSwitch={onSwitch}
              onMarkActive={onMarkActive}
              onManageIdentity={onManageIdentity}
              isSelected={selectedIds.has(account.id)}
              onToggleSelection={onToggleSelection}
              onManageFamily={onManageFamily}
              isRefreshing={refreshingAccountId === account.id}
              isDeleting={deletingAccountId === account.id}
              isSwitching={switchingAccountId === account.id}
              switchingTarget={switchingAccountId === account.id ? switchingTarget : undefined}
            />
          );
        }

        if (gridLayout === 'compact') {
          return (
            <CompactCloudAccountCard
              key={account.id}
              account={account}
              quotaWindow={quotaWindow}
              onRefresh={onRefresh}
              onDelete={onDelete}
              onSwitch={onSwitch}
              onMarkActive={onMarkActive}
              onManageIdentity={onManageIdentity}
              isSelected={selectedIds.has(account.id)}
              onToggleSelection={onToggleSelection}
              onManageFamily={onManageFamily}
              isRefreshing={refreshingAccountId === account.id}
              isDeleting={deletingAccountId === account.id}
              isSwitching={switchingAccountId === account.id}
              switchingTarget={switchingAccountId === account.id ? switchingTarget : undefined}
            />
          );
        }

        return (
          <CloudAccountCard
            key={account.id}
            account={account}
            quotaWindow={quotaWindow}
            onRefresh={onRefresh}
            onDelete={onDelete}
            onSwitch={onSwitch}
            onMarkActive={onMarkActive}
            onManageIdentity={onManageIdentity}
            onManageFamily={onManageFamily}
            isSelected={selectedIds.has(account.id)}
            onToggleSelection={onToggleSelection}
            isRefreshing={refreshingAccountId === account.id}
            isDeleting={deletingAccountId === account.id}
            isSwitching={switchingAccountId === account.id}
          />
        );
      })}

      {accounts.length === 0 && hasActiveTierFilter && sourceAccountCount > 0 && (
        <div className="text-muted-foreground bg-muted/20 col-span-full rounded-lg border border-dashed py-14 text-center">
          <Cloud className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <div className="text-sm">{t('cloud.list.noFilteredAccounts')}</div>
          <Button variant="outline" size="sm" className="mt-4" onClick={onResetTierFilter}>
            {t('cloud.tierFilter.reset')}
          </Button>
        </div>
      )}

      {accounts.length === 0 && (!hasActiveTierFilter || sourceAccountCount === 0) && (
        <div className="text-muted-foreground bg-muted/20 col-span-full rounded-lg border border-dashed py-14 text-center">
          <Cloud className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <div className="text-sm">{t('cloud.list.noAccounts')}</div>
        </div>
      )}
    </div>
  );
}
