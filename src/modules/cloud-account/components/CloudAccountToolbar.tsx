import { useState, type ChangeEvent, type RefObject } from 'react';
import { cn } from '@/shared/ui/utils';
import type { AccountSortKey } from '@/modules/cloud-account/utils/quota-display';
import {
  Check,
  CheckSquare,
  CalendarDays,
  Cloud,
  Clock3,
  Columns2,
  Columns3,
  Download,
  Eye,
  EyeOff,
  FileDown,
  Layers,
  LayoutGrid,
  LayoutList,
  List,
  Loader2,
  Plus,
  RefreshCcw,
  Rows3,
  SortAsc,
  Upload,
  Zap,
  FlaskConical,
  AppWindow,
  ChevronDown,
  Laptop,
  Terminal,
  Radar,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AccountTierFilterDropdown } from '@/modules/cloud-account/components/AccountTierFilterDropdown';
import {
  CLOUD_ACCOUNT_SORT_I18N_KEYS,
  CLOUD_ACCOUNT_SORT_OPTIONS,
  type GridLayout,
} from '@/modules/cloud-account/components/CloudAccountList.constants';
import type { OAuthClientDescriptor } from '@/modules/cloud-account/actions/cloud';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';
import type { AccountTierOption } from '@/modules/cloud-account/utils/account-tier-filter';
import { LocalAccountImportDialog } from '@/modules/cloud-account/local-import/components/LocalAccountImportDialog';
import type { QuotaWindow } from '@/modules/cloud-account/utils/quota-groups';
import { EmulationManagementDialog } from '@/modules/cloud-account/components/EmulationManagementDialog';
import {
  useEmulationState,
  useAutoSwitchTargetsConfig,
  useSetAutoSwitchEnabled,
  useSetAutoSwitchNoRestartEnabled,
} from '@/modules/cloud-account/hooks/useCloudAccounts';

type ImportStrategy = 'merge' | 'overwrite' | 'skip-existing';

interface CloudAccountToolbarProps {
  autoSwitchEnabled: boolean | undefined;
  isSettingsLoading: boolean;
  isSetAutoSwitchPending: boolean;
  isForcePollPending: boolean;
  isSyncPending: boolean;
  allVisibleSelected: boolean;
  selectedCount: number;
  isExportDialogOpen: boolean;
  isImportDialogOpen: boolean;
  isAddDialogOpen: boolean;
  isExportPending: boolean;
  isImportPending: boolean;
  isAddPending: boolean;
  isOAuthClientsLoading: boolean;
  isSetActiveOAuthClientPending: boolean;
  importStrategy: ImportStrategy;
  importFileContent: string | null;
  importFileName: string;
  authCode: string;
  selectedOAuthClientKey: string;
  oauthClients: OAuthClientDescriptor[];
  fileInputRef: RefObject<HTMLInputElement | null>;
  tierOptions: AccountTierOption[];
  effectiveSelectedTierKeySet: Set<string>;
  hasActiveTierFilter: boolean;
  tierFilterButtonLabel: string;
  currentSort: AccountSortKey;
  gridLayout: GridLayout;
  quotaWindow: QuotaWindow;
  maskAccountInfo?: boolean;
  getTierOptionLabel: (key: string, label: string) => string;
  onToggleAutoSwitch: (checked: boolean) => void;
  onToggleSelectAllAccounts: () => void;
  onForcePoll: () => void;
  onSyncLocal: (appTarget: AntigravityAppTarget) => void;
  isDetectActivePending?: boolean;
  onDetectActiveAccounts?: () => void;
  onExportDialogOpenChange: (open: boolean) => void;
  onImportDialogOpenChange: (open: boolean) => void;
  onAddDialogOpenChange: (open: boolean) => void;
  onExport: (stripTokens: boolean) => void;
  onImportFileSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onImportStrategyChange: (strategy: ImportStrategy) => void;
  onImport: () => void;
  onOAuthClientChange: (clientKey: string) => void;
  onOpenGoogleAuthSignIn: () => void;
  onAuthCodeChange: (authCode: string) => void;
  onSubmitAuthCode: () => void;
  onResetTierFilter: () => void;
  onToggleTierFilter: (tierKey: string, checked: boolean) => void;
  onSortChange: (sortKey: AccountSortKey) => void;
  onUpdateGridLayout: (layout: GridLayout) => void;
  onQuotaWindowChange: (quotaWindow: QuotaWindow) => void;
  onToggleMaskAccountInfo?: () => void;
  showEmulationUi?: boolean;
  originFilter?: 'all' | 'real' | 'emulated';
  onOriginFilterChange?: (filter: 'all' | 'real' | 'emulated') => void;
}

export function CloudAccountToolbar({
  autoSwitchEnabled,
  isSettingsLoading,
  isSetAutoSwitchPending,
  isForcePollPending,
  isSyncPending,
  allVisibleSelected,
  selectedCount,
  isExportDialogOpen,
  isImportDialogOpen,
  isAddDialogOpen,
  isExportPending,
  isImportPending,
  isAddPending,
  isOAuthClientsLoading,
  isSetActiveOAuthClientPending,
  importStrategy,
  importFileContent,
  importFileName,
  authCode,
  selectedOAuthClientKey,
  oauthClients,
  fileInputRef,
  tierOptions,
  effectiveSelectedTierKeySet,
  hasActiveTierFilter,
  tierFilterButtonLabel,
  currentSort,
  gridLayout,
  quotaWindow,
  maskAccountInfo = false,
  getTierOptionLabel,
  onToggleAutoSwitch,
  onToggleSelectAllAccounts,
  onForcePoll,
  onSyncLocal,
  isDetectActivePending = false,
  onDetectActiveAccounts,
  onExportDialogOpenChange,
  onImportDialogOpenChange,
  onAddDialogOpenChange,
  onExport,
  onImportFileSelect,
  onImportStrategyChange,
  onImport,
  onOAuthClientChange,
  onOpenGoogleAuthSignIn,
  onAuthCodeChange,
  onSubmitAuthCode,
  onResetTierFilter,
  onToggleTierFilter,
  onSortChange,
  onUpdateGridLayout,
  onQuotaWindowChange,
  onToggleMaskAccountInfo,
  showEmulationUi = false,
  originFilter = 'all',
  onOriginFilterChange,
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
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="@container bg-card flex flex-col gap-2 rounded-lg border p-2 sm:p-2.5 shadow-xs">
      {/* Top Row: Primary Account Actions & Data Operations */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Account Management Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Add Account (Primary Action) */}
          <Dialog open={isAddDialogOpen} onOpenChange={onAddDialogOpenChange}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                title={t('cloud.addAccount')}
                aria-label={t('cloud.addAccount')}
                className="h-8 cursor-pointer px-2.5 text-xs font-medium sm:px-3"
              >
                <Plus className="h-3.5 w-3.5 @sm:mr-1.5" />
                <span className="hidden @sm:inline">{t('cloud.addAccount')}</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{t('cloud.authDialog.title')}</DialogTitle>
                <DialogDescription>{t('cloud.authDialog.description')}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="oauth-client-select">{t('cloud.authDialog.oauthClient')}</Label>
                  <Select
                    value={selectedOAuthClientKey || undefined}
                    onValueChange={onOAuthClientChange}
                    disabled={isOAuthClientsLoading || isSetActiveOAuthClientPending}
                  >
                    <SelectTrigger id="oauth-client-select">
                      <SelectValue placeholder={t('cloud.authDialog.oauthClientPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {oauthClients.map((client) => (
                        <SelectItem key={client.key} value={client.key}>
                          {client.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Button variant="outline" className="col-span-4" onClick={onOpenGoogleAuthSignIn}>
                    <Cloud className="mr-2 h-4 w-4" />
                    {t('cloud.authDialog.openLogin')}
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">{t('cloud.authDialog.authCode')}</Label>
                  <Input
                    id="code"
                    placeholder={t('cloud.authDialog.placeholder')}
                    value={authCode}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      onAuthCodeChange(event.target.value);
                    }}
                  />
                  <p className="text-muted-foreground text-xs">{t('cloud.authDialog.instruction')}</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={onSubmitAuthCode} disabled={isAddPending || !authCode}>
                  {isAddPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('cloud.authDialog.verify')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Auto-Switch */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 cursor-pointer px-2 text-xs font-medium gap-1.5 transition-colors',
                  activeTargetsCount > 0
                    ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20'
                    : 'text-muted-foreground',
                )}
                title={t('cloud.autoSwitch')}
                aria-label={t('cloud.autoSwitch')}
              >
                <Zap
                  className={cn(
                    'h-3.5 w-3.5',
                    activeTargetsCount > 0 ? 'fill-yellow-500 text-yellow-500' : 'text-muted-foreground',
                  )}
                />
                <span className="hidden @xl:inline">{t('cloud.autoSwitch')}</span>
                <span className="hidden @sm:inline @xl:hidden">Auto</span>
                {activeTargetsCount > 0 && (
                  <span className="rounded-full bg-yellow-500/20 px-1 text-[10px] font-bold text-yellow-600 dark:text-yellow-400">
                    {activeTargetsCount}/3
                  </span>
                )}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-1.5" sideOffset={6}>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
                {t('cloud.autoSwitchTargets.title', 'Auto-Switch Environments')}
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={classicEnabled}
                onCheckedChange={(checked) => {
                  setTargetAutoSwitchMutation.mutate({ enabled: checked, appTarget: 'classic' });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <AppWindow className="h-3.5 w-3.5 text-blue-500" />
                  <span>{t('cloud.autoSwitchTargets.classic', 'Antigravity App (Classic)')}</span>
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={ideEnabled}
                onCheckedChange={(checked) => {
                  setTargetAutoSwitchMutation.mutate({ enabled: checked, appTarget: 'ide' });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <Laptop className="h-3.5 w-3.5 text-indigo-500" />
                  <span>{t('cloud.autoSwitchTargets.ide', 'Antigravity IDE')}</span>
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={agyEnabled}
                onCheckedChange={(checked) => {
                  setTargetAutoSwitchMutation.mutate({ enabled: checked, appTarget: 'agy' });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <span className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{t('cloud.autoSwitchTargets.agy', 'Antigravity CLI (agy)')}</span>
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-wider uppercase">
                {t('cloud.autoSwitchMode.title', 'Switch Behavior')}
              </DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={noRestartEnabled}
                onCheckedChange={(checked) => {
                  setNoRestartMutation.mutate({ enabled: checked });
                }}
                className="cursor-pointer py-1.5 text-xs"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">
                    {t('cloud.autoSwitchMode.noRestart', 'Live Sync (No Restart)')}
                  </span>
                  <span className="text-[10px] text-muted-foreground leading-tight">
                    {t(
                      'cloud.autoSwitchMode.noRestartDesc',
                      'Update credentials in background without killing IDE windows',
                    )}
                  </span>
                </div>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator className="my-1" />
              <div className="flex items-center justify-between px-2 py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => onToggleAutoSwitch(true)}
                >
                  {t('cloud.autoSwitchTargets.enableAll', 'All On')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                  onClick={() => onToggleAutoSwitch(false)}
                >
                  {t('cloud.autoSwitchTargets.disableAll', 'All Off')}
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Select All */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSelectAllAccounts}
            title={t('cloud.batch.selectAll')}
            aria-label={t('cloud.batch.selectAll')}
            className="h-8 cursor-pointer px-2.5 text-xs"
          >
            <CheckSquare
              className={`h-3.5 w-3.5 @md:mr-1.5 ${selectedCount > 0 && allVisibleSelected ? 'text-primary fill-primary/20' : ''}`}
            />
            <span className="hidden @3xl:inline">{t('cloud.batch.selectAll')}</span>
            <span className="hidden @md:inline @3xl:hidden">All</span>
          </Button>

          {/* Check Quota / Force Poll */}
          <Button
            variant="outline"
            size="icon"
            onClick={onForcePoll}
            title={t('cloud.checkQuota')}
            aria-label={t('cloud.checkQuota')}
            disabled={isForcePollPending}
            className="h-8 w-8 cursor-pointer"
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${isForcePollPending ? 'animate-spin' : ''}`} />
          </Button>

          {/* Detect Active Environments */}
          {onDetectActiveAccounts && (
            <Button
              variant="outline"
              size="icon"
              onClick={onDetectActiveAccounts}
              title={t('cloud.toolbar.detectActive', 'Detect Active Environments')}
              aria-label={t('cloud.toolbar.detectActive', 'Detect Active Environments')}
              disabled={isDetectActivePending}
              className="h-8 w-8 cursor-pointer"
            >
              <Radar className={cn('h-3.5 w-3.5', isDetectActivePending && 'animate-spin')} />
            </Button>
          )}

          {/* Emulation Sandbox */}
          {showEmulationUi && (
            <EmulationManagementDialog
              trigger={
                <Button
                  variant={emulationState?.enabled ? 'secondary' : 'outline'}
                  size="sm"
                  className={cn(
                    'h-8 cursor-pointer px-2.5 text-xs transition-colors',
                    emulationState?.enabled &&
                      'border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300',
                  )}
                  title={t('cloud.emulation.toolbarTitle', 'Account Emulation & Quota Simulation')}
                  aria-label={t('cloud.emulation.toolbarTitle', 'Account Emulation & Quota Simulation')}
                >
                  <FlaskConical
                    className={cn(
                      'h-3.5 w-3.5 @md:mr-1.5',
                      emulationState?.enabled ? 'text-purple-400' : 'text-muted-foreground',
                    )}
                  />
                  <span className="hidden @xl:inline">{t('cloud.emulation.toolbarBtn', 'Emulation')}</span>
                  {emulationState?.enabled && (
                    <span className="ml-1 px-1 py-0 text-[10px] rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {emulationState.accounts?.length ?? 0}
                    </span>
                  )}
                </Button>
              }
            />
          )}
        </div>

        {/* Right: Sync & Data Operations */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          {/* Sync from IDE */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={isSyncPending}
                title={t('cloud.syncFromIde')}
                aria-label={t('cloud.syncFromIde')}
                className="h-8 cursor-pointer px-2.5 text-xs"
              >
                <Download className={`h-3.5 w-3.5 @md:mr-1.5 ${isSyncPending ? 'animate-bounce' : ''}`} />
                <span className="hidden @4xl:inline">{t('cloud.syncFromIde')}</span>
                <span className="hidden @md:inline @4xl:hidden">Sync</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 min-w-[16rem]" side="bottom" sideOffset={8}>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[10px] tracking-wider uppercase">
                {t('cloud.syncSource', 'Sync Source')}
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={isSyncPending}
                onClick={() => onSyncLocal('classic')}
              >
                {t('cloud.syncFromAntigravity', 'Antigravity')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer"
                disabled={isSyncPending}
                onClick={() => onSyncLocal('ide')}
              >
                {t('cloud.syncFromAntigravityIde', 'Antigravity IDE')}
              </DropdownMenuItem>
              {onDetectActiveAccounts && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={isDetectActivePending}
                    onClick={onDetectActiveAccounts}
                  >
                    <Radar className={cn('mr-2 h-3.5 w-3.5 shrink-0', isDetectActivePending && 'animate-spin')} />
                    <span className="whitespace-nowrap">{t('cloud.toolbar.detectActive', 'Detect Active Environments')}</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Scan Local Accounts */}
          <LocalAccountImportDialog />

          {/* Grouped Export & Import */}
          <div className="inline-flex items-center rounded-md border border-input shadow-xs">
            {/* Export */}
            <Dialog open={isExportDialogOpen} onOpenChange={onExportDialogOpenChange}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('cloud.exportImport.export')}
                  aria-label={t('cloud.exportImport.export')}
                  className="h-8 cursor-pointer rounded-r-none px-2.5 text-xs hover:bg-accent"
                >
                  <FileDown className="h-3.5 w-3.5 @2xl:mr-1.5" />
                  <span className="hidden @2xl:inline">{t('cloud.exportImport.export')}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t('cloud.exportImport.exportTitle')}</DialogTitle>
                  <DialogDescription>{t('cloud.exportImport.exportDesc')}</DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center sm:space-x-0">
                  <Button
                    variant="outline"
                    onClick={() => onExport(false)}
                    disabled={isExportPending}
                    className="w-full cursor-pointer sm:flex-1"
                  >
                    {isExportPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('cloud.exportImport.includeTokens')}
                  </Button>
                  <Button
                    onClick={() => onExport(true)}
                    disabled={isExportPending}
                    className="w-full cursor-pointer sm:flex-1"
                  >
                    {isExportPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('cloud.exportImport.stripTokens')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <div className="h-4 w-px bg-border/60" />

            {/* Import */}
            <Dialog open={isImportDialogOpen} onOpenChange={onImportDialogOpenChange}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('cloud.exportImport.import')}
                  aria-label={t('cloud.exportImport.import')}
                  className="h-8 cursor-pointer rounded-l-none px-2.5 text-xs hover:bg-accent"
                >
                  <Upload className="h-3.5 w-3.5 @2xl:mr-1.5" />
                  <span className="hidden @2xl:inline">{t('cloud.exportImport.import')}</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>{t('cloud.exportImport.importTitle')}</DialogTitle>
                  <DialogDescription>{t('cloud.exportImport.importDesc')}</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>{t('cloud.exportImport.selectFile')}</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={onImportFileSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer"
                    >
                      {importFileName || t('cloud.exportImport.selectFile')}
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('cloud.exportImport.importStrategy')}</Label>
                    <Select value={importStrategy} onValueChange={onImportStrategyChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merge">{t('cloud.exportImport.strategyMerge')}</SelectItem>
                        <SelectItem value="overwrite">
                          {t('cloud.exportImport.strategyOverwrite')}
                        </SelectItem>
                        <SelectItem value="skip-existing">
                          {t('cloud.exportImport.strategySkip')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={onImport} disabled={!importFileContent || isImportPending}>
                    {isImportPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isImportPending ? t('cloud.exportImport.importing') : t('cloud.exportImport.import')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Bottom Row: Filters, Quota Window & Layout Switchers */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-1.5">
        {/* Left: Filters & Privacy */}
        <div className="flex items-center gap-1.5 sm:gap-2">
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

          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 cursor-pointer">
                  <SortAsc className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56" side="bottom" sideOffset={8}>
                <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[10px] tracking-wider uppercase">
                  {t('cloud.toolbar.sortBy', 'Sort by')}
                </DropdownMenuLabel>
                {CLOUD_ACCOUNT_SORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option}
                    className="cursor-pointer"
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

            {/* Origin Filter (All / Real / Emulated) */}
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
          </div>
        </div>

        {/* Right: Quota Window & Layout Switchers */}
        <div className="flex items-center gap-1.5 sm:gap-2 ml-auto">
          <div
            className="flex items-center gap-0.5 rounded-md border p-0.5"
            aria-label={t('cloud.quota-window.label')}
          >
            <Button
              variant={quotaWindow === '5h' ? 'secondary' : 'ghost'}
              aria-pressed={quotaWindow === '5h'}
              size="sm"
              className="h-7 cursor-pointer px-2 text-xs"
              onClick={() => onQuotaWindowChange('5h')}
              title={t('cloud.quota-window.five-hours')}
              aria-label={t('cloud.quota-window.five-hours')}
            >
              <Clock3 className="h-3.5 w-3.5 @sm:mr-1" />
              <span className="hidden @sm:inline">{t('cloud.quota-window.five-hours-short')}</span>
            </Button>
            <Button
              variant={quotaWindow === 'weekly' ? 'secondary' : 'ghost'}
              aria-pressed={quotaWindow === 'weekly'}
              size="sm"
              className="h-7 cursor-pointer px-2 text-xs"
              onClick={() => onQuotaWindowChange('weekly')}
              title={t('cloud.quota-window.weekly')}
              aria-label={t('cloud.quota-window.weekly')}
            >
              <CalendarDays className="h-3.5 w-3.5 @sm:mr-1" />
              <span className="hidden @sm:inline">{t('cloud.quota-window.weekly-short')}</span>
            </Button>
            <Button
              variant={quotaWindow === 'dual' ? 'secondary' : 'ghost'}
              aria-pressed={quotaWindow === 'dual'}
              size="sm"
              className="h-7 cursor-pointer px-2 text-xs"
              onClick={() => onQuotaWindowChange('dual')}
              title={t('cloud.quota-window.dual', 'Dual Window')}
              aria-label={t('cloud.quota-window.dual', 'Dual Window')}
            >
              <Layers className="h-3.5 w-3.5 @sm:mr-1" />
              <span className="hidden @sm:inline">{t('cloud.quota-window.dual-short', 'Dual')}</span>
            </Button>
          </div>

          <div className="flex items-center gap-0.5 rounded-md border p-0.5">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={gridLayout === 'auto' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => onUpdateGridLayout('auto')}
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
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => onUpdateGridLayout('2-col')}
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
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => onUpdateGridLayout('3-col')}
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('cloud.layout.threeCol')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={gridLayout === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => onUpdateGridLayout('list')}
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
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => onUpdateGridLayout('compact')}
                  >
                    <LayoutList className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('cloud.layout.compact')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={gridLayout === 'compact-dual' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="h-7 w-7 cursor-pointer"
                    onClick={() => onUpdateGridLayout('compact-dual')}
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('cloud.layout.compactDual', 'Compact (Dual 5h & Week)')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
