import {
  Check,
  CalendarDays,
  Clock3,
  Columns2,
  Columns3,
  Eye,
  EyeOff,
  LayoutGrid,
  LayoutList,
  List,
  RefreshCcw,
  Rows3,
  SortAsc,
  Zap,
  FlaskConical,
  AppWindow,
  ChevronDown,
  Laptop,
  Terminal,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AccountTierFilterDropdown } from '@/modules/cloud-account/components/AccountTierFilterDropdown';
import { CloudAccountLoginDialog } from './CloudAccountLoginDialog';
import { CloudAccountFileDialogs } from './CloudAccountFileDialogs';
import { CloudAccountSelectAllButton } from './CloudAccountSelectAllButton';
import {
  CLOUD_ACCOUNT_SORT_I18N_KEYS,
  CLOUD_ACCOUNT_SORT_OPTIONS,
  type GridLayout,
} from '@/modules/cloud-account/components/CloudAccountList.constants';
import type { AccountSortKey } from '@/modules/cloud-account/utils/quota-display';
import type { AccountTierOption } from '@/modules/cloud-account/utils/account-tier-filter';
import { LocalAccountImportDialog } from '@/modules/cloud-account/local-import/components/LocalAccountImportDialog';
import type { QuotaWindow } from '@/modules/cloud-account/utils/quota-groups';
import type { QuotaGroupVisibility } from '@/modules/cloud-account/utils/quota-group-visibility';
import { QuotaGroupVisibilityMenu } from './QuotaGroupVisibilityMenu';
import { EmulationManagementDialog } from '@/modules/cloud-account/components/EmulationManagementDialog';
import {
  useEmulationState,
  useAutoSwitchTargetsConfig,
  useSetAutoSwitchEnabled,
  useSetAutoSwitchNoRestartEnabled,
} from '@/modules/cloud-account/hooks/useCloudAccounts';

interface CloudAccountToolbarProps {
  visibleAccountIds: string[];
  autoSwitchEnabled: boolean | undefined;
  isSettingsLoading: boolean;
  isSetAutoSwitchPending: boolean;
  isForcePollPending: boolean;
  tierOptions: AccountTierOption[];
  effectiveSelectedTierKeySet: Set<string>;
  hasActiveTierFilter: boolean;
  tierFilterButtonLabel: string;
  currentSort: AccountSortKey;
  gridLayout: GridLayout;
  quotaWindow: QuotaWindow;
  quotaGroupVisibility: QuotaGroupVisibility;
  maskAccountInfo?: boolean;
  onToggleMaskAccountInfo?: () => void;
  showEmulationUi?: boolean;
  originFilter?: 'all' | 'real' | 'emulated';
  onOriginFilterChange?: (filter: 'all' | 'real' | 'emulated') => void;
  isFamilyGrouped?: boolean;
  onToggleFamilyGrouped?: () => void;
  onOpenFamilyDialog?: () => void;
  getTierOptionLabel: (key: string, label: string) => string;
  onToggleAutoSwitch: (checked: boolean) => void;
  onForcePoll: () => void;
  onResetTierFilter: () => void;
  onToggleTierFilter: (tierKey: string, checked: boolean) => void;
  onSortChange: (sortKey: AccountSortKey) => void;
  onUpdateGridLayout: (layout: GridLayout) => void;
  onQuotaWindowChange: (quotaWindow: QuotaWindow) => void;
  onQuotaGroupVisibilityChange: (value: QuotaGroupVisibility) => void;
}

export function CloudAccountToolbar({
  visibleAccountIds,
  autoSwitchEnabled,
  isSettingsLoading,
  isSetAutoSwitchPending,
  isForcePollPending,
  tierOptions,
  effectiveSelectedTierKeySet,
  hasActiveTierFilter,
  tierFilterButtonLabel,
  currentSort,
  gridLayout,
  quotaWindow,
  quotaGroupVisibility,
  maskAccountInfo = false,
  onToggleMaskAccountInfo,
  showEmulationUi = false,
  originFilter = 'all',
  onOriginFilterChange,
  isFamilyGrouped = false,
  onToggleFamilyGrouped,
  onOpenFamilyDialog,
  getTierOptionLabel,
  onToggleAutoSwitch,
  onForcePoll,
  onResetTierFilter,
  onToggleTierFilter,
  onSortChange,
  onUpdateGridLayout,
  onQuotaWindowChange,
  onQuotaGroupVisibilityChange,
}: CloudAccountToolbarProps) {
  const { t } = useTranslation();
  const { data: emulationState } = useEmulationState(3000);
  const { data: targetsConfig } = useAutoSwitchTargetsConfig();
  const setTargetAutoSwitchMutation = useSetAutoSwitchEnabled();
  const setNoRestartMutation = useSetAutoSwitchNoRestartEnabled();

  const classicEnabled = targetsConfig ? targetsConfig.classic : !!autoSwitchEnabled;
  const ideEnabled = targetsConfig ? targetsConfig.ide : !!autoSwitchEnabled;
  const agyEnabled = targetsConfig ? targetsConfig.agy : !!autoSwitchEnabled;
  const noRestartEnabled = targetsConfig ? targetsConfig.noRestart : false;
  const activeTargetsCount = [classicEnabled, ideEnabled, agyEnabled].filter(Boolean).length;

  return (
    <div className="bg-card flex flex-col rounded-lg border shadow-xs">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <div className="flex items-center gap-2 px-1 py-1">
          <div className="flex items-center gap-2">
            <Zap
              className={`h-4 w-4 ${autoSwitchEnabled ? 'text-primary' : 'text-muted-foreground'}`}
            />
            <Label
              htmlFor="auto-switch"
              className="cursor-default text-sm font-medium"
              title={t('cloud.auto-switch-description')}
            >
              {t('cloud.auto-switch-client')}
            </Label>
          </div>
          <Switch
            id="auto-switch"
            checked={!!autoSwitchEnabled}
            onCheckedChange={onToggleAutoSwitch}
            disabled={isSettingsLoading || isSetAutoSwitchPending}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
                title={t('cloud.autoSwitch.targetsTooltip', 'Target Applications')}
              >
                <ChevronDown className="h-3 w-3" />
                <span className="text-[10px] bg-muted px-1 rounded font-mono">
                  {activeTargetsCount}/3
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 text-xs">
              <DropdownMenuLabel className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-2 py-1">
                {t('cloud.autoSwitch.targetsHeader', 'Auto-switch Targets')}
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={classicEnabled}
                onCheckedChange={(checked) => {
                  setTargetAutoSwitchMutation.mutate({ enabled: checked, appTarget: 'classic' });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <AppWindow className="h-3.5 w-3.5 mr-2 text-green-500" />
                <span>Antigravity App</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={ideEnabled}
                onCheckedChange={(checked) => {
                  setTargetAutoSwitchMutation.mutate({ enabled: checked, appTarget: 'ide' });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <Laptop className="h-3.5 w-3.5 mr-2 text-indigo-500" />
                <span>Antigravity IDE</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={agyEnabled}
                onCheckedChange={(checked) => {
                  setTargetAutoSwitchMutation.mutate({ enabled: checked, appTarget: 'agy' });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <Terminal className="h-3.5 w-3.5 mr-2 text-emerald-500" />
                <span>Antigravity CLI</span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={noRestartEnabled}
                onCheckedChange={(checked) => {
                  setNoRestartMutation.mutate({ enabled: checked });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <Zap className="h-3.5 w-3.5 mr-2 text-amber-500" />
                <span>{t('cloud.autoSwitch.noRestart', 'Switch without Restart')}</span>
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={onForcePoll}
          title={t('cloud.checkQuota')}
          aria-label={t('cloud.checkQuota')}
          disabled={isForcePollPending}
          className="cursor-default"
        >
          <RefreshCcw className={`h-4 w-4 ${isForcePollPending ? 'animate-spin' : ''}`} />
        </Button>

        {showEmulationUi && (
          <EmulationManagementDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs cursor-pointer border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              >
                <FlaskConical className="h-3.5 w-3.5 mr-1 text-purple-400" />
                {t('cloud.emulation.titleShort', 'Emulation')}
                {emulationState?.enabled && (
                  <span className="ml-1.5 flex h-1.5 w-1.5 rounded-full bg-purple-400 animate-pulse" />
                )}
              </Button>
            }
          />
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <LocalAccountImportDialog />

          <CloudAccountFileDialogs />
          <CloudAccountLoginDialog />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
        <CloudAccountSelectAllButton visibleAccountIds={visibleAccountIds} />
        <AccountTierFilterDropdown
          options={tierOptions}
          selectedKeys={effectiveSelectedTierKeySet}
          hasActiveFilter={hasActiveTierFilter}
          triggerLabel={tierFilterButtonLabel}
          resetLabel={t('cloud.tierFilter.reset')}
          getOptionLabel={(option) => getTierOptionLabel(option.key, option.label)}
          onReset={onResetTierFilter}
          onToggle={onToggleTierFilter}
        />

        {showEmulationUi &&
          emulationState?.enabled &&
          (emulationState.accounts?.length ?? 0) > 0 &&
          onOriginFilterChange && (
            <div className="flex items-center gap-0.5 rounded-md border p-0.5 text-xs">
              <Button
                variant={originFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px] cursor-pointer"
                onClick={() => onOriginFilterChange('all')}
              >
                {t('cloud.emulation.filterAll', 'All')}
              </Button>
              <Button
                variant={originFilter === 'real' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px] cursor-pointer"
                onClick={() => onOriginFilterChange('real')}
              >
                {t('cloud.emulation.filterReal', 'Real')}
              </Button>
              <Button
                variant={originFilter === 'emulated' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-[11px] cursor-pointer text-purple-400 font-medium"
                onClick={() => onOriginFilterChange('emulated')}
              >
                <FlaskConical className="h-3 w-3 mr-1" />
                {t('cloud.emulation.filterEmulated', 'Emulated')}
              </Button>
            </div>
          )}

        <div className="flex items-center gap-1 rounded-md border p-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-default"
                aria-label={t(CLOUD_ACCOUNT_SORT_I18N_KEYS[currentSort])}
                title={t(CLOUD_ACCOUNT_SORT_I18N_KEYS[currentSort])}
              >
                <SortAsc className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56" side="bottom" sideOffset={8}>
              {CLOUD_ACCOUNT_SORT_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  className="cursor-default"
                  onClick={() => {
                    onSortChange(option);
                  }}
                >
                  {currentSort === option && <Check className="mr-2 h-4 w-4" />}
                  <span className={currentSort === option ? '' : 'ml-6'}>
                    {t(CLOUD_ACCOUNT_SORT_I18N_KEYS[option])}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {onToggleMaskAccountInfo && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={maskAccountInfo ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-pointer"
                  onClick={onToggleMaskAccountInfo}
                  aria-label={
                    maskAccountInfo
                      ? t('cloud.toolbar.unmaskIdentity', 'Show name & email')
                      : t('cloud.toolbar.maskIdentity', 'Mask name & email')
                  }
                >
                  {maskAccountInfo ? (
                    <EyeOff className="h-3.5 w-3.5 text-amber-500" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {maskAccountInfo
                  ? t('cloud.toolbar.unmaskIdentity', 'Show name & email')
                  : t('cloud.toolbar.maskIdentity', 'Mask name & email')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {onOpenFamilyDialog && (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 cursor-pointer text-muted-foreground hover:text-foreground"
                  onClick={onOpenFamilyDialog}
                  aria-label={t('cloud.family.manageGroupTooltip', 'Quản lý nhóm gia đình Google One')}
                >
                  <Users className="h-3.5 w-3.5 text-indigo-400" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {t('cloud.family.manageGroupTooltip', 'Quản lý nhóm gia đình Google One')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div
          className="ml-auto flex items-center gap-1 rounded-md border p-1"
          aria-label={t('cloud.quota-window.label')}
        >
          <Button
            variant={quotaWindow === 'both' ? 'secondary' : 'ghost'}
            aria-pressed={quotaWindow === 'both'}
            size="sm"
            className="h-7 cursor-default px-2 text-xs"
            onClick={() => onQuotaWindowChange('both')}
          >
            {t('cloud.quota-window.both-short')}
          </Button>
          <Button
            variant={quotaWindow === '5h' ? 'secondary' : 'ghost'}
            aria-pressed={quotaWindow === '5h'}
            size="sm"
            className="h-7 cursor-default px-2 text-xs"
            onClick={() => onQuotaWindowChange('5h')}
          >
            <Clock3 className="mr-1 h-3.5 w-3.5" />
            {t('cloud.quota-window.five-hours-short')}
          </Button>
          <Button
            variant={quotaWindow === 'weekly' ? 'secondary' : 'ghost'}
            aria-pressed={quotaWindow === 'weekly'}
            size="sm"
            className="h-7 cursor-default px-2 text-xs"
            onClick={() => onQuotaWindowChange('weekly')}
          >
            <CalendarDays className="mr-1 h-3.5 w-3.5" />
            {t('cloud.quota-window.weekly-short')}
          </Button>
        </div>

        <QuotaGroupVisibilityMenu
          value={quotaGroupVisibility}
          onChange={onQuotaGroupVisibilityChange}
        />

        <div className="flex items-center gap-1 rounded-md border p-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={gridLayout === 'auto' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-default"
                  onClick={() => onUpdateGridLayout('auto')}
                  aria-label={t('cloud.layout.auto')}
                  aria-pressed={gridLayout === 'auto'}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('cloud.layout.auto')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={gridLayout === '2-col' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-default"
                  onClick={() => onUpdateGridLayout('2-col')}
                  aria-label={t('cloud.layout.twoCol')}
                  aria-pressed={gridLayout === '2-col'}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('cloud.layout.twoCol')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={gridLayout === '3-col' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-default"
                  onClick={() => onUpdateGridLayout('3-col')}
                  aria-label={t('cloud.layout.threeCol')}
                  aria-pressed={gridLayout === '3-col'}
                >
                  <Columns3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('cloud.layout.threeCol')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={gridLayout === 'compact-dual' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-default"
                  onClick={() => onUpdateGridLayout('compact-dual')}
                  aria-label={t('cloud.layout.compactDual', 'Compact Dual')}
                  aria-pressed={gridLayout === 'compact-dual'}
                >
                  <Rows3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('cloud.layout.compactDual', 'Compact Dual')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={gridLayout === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-default"
                  onClick={() => onUpdateGridLayout('list')}
                  aria-label={t('cloud.layout.list')}
                  aria-pressed={gridLayout === 'list'}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('cloud.layout.list')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={gridLayout === 'compact' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-7 w-7 cursor-default"
                  onClick={() => onUpdateGridLayout('compact')}
                  aria-label={t('cloud.layout.compact')}
                  aria-pressed={gridLayout === 'compact'}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('cloud.layout.compact')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
