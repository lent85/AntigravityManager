import { Pause, Play, RefreshCw, Trash2, Users, UserMinus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface CloudAccountBatchActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onRefreshSelected: () => void;
  onDeleteSelected: () => void;
  onPauseSelected?: () => void;
  onResumeSelected?: () => void;
  onLinkFamilySelected?: () => void;
  onUnlinkFamilySelected?: () => void;
  hasFamilyAccountSelected?: boolean;
}

export function CloudAccountBatchActionBar({
  selectedCount,
  onClearSelection,
  onRefreshSelected,
  onDeleteSelected,
  onPauseSelected,
  onResumeSelected,
  onLinkFamilySelected,
  onUnlinkFamilySelected,
  hasFamilyAccountSelected,
}: CloudAccountBatchActionBarProps) {
  const { t } = useTranslation();

  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="bg-card animate-in fade-in slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border px-6 py-2 shadow-lg">
      <div className="flex items-center gap-2 border-r pr-4">
        <span className="text-sm font-semibold">
          {t('cloud.batch.selected', { count: selectedCount })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-full"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {onLinkFamilySelected && selectedCount >= 2 && (
          <Button variant="secondary" size="sm" onClick={onLinkFamilySelected}>
            <Users className="mr-2 h-3.5 w-3.5 text-blue-400" />
            {t('cloud.family.linkSelected', 'Gộp gia đình')}
          </Button>
        )}
        {onUnlinkFamilySelected && hasFamilyAccountSelected && (
          <Button
            variant="secondary"
            size="sm"
            className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
            onClick={onUnlinkFamilySelected}
          >
            <UserMinus className="mr-2 h-3.5 w-3.5" />
            {t('cloud.family.unlinkSelected', 'Tách khỏi gia đình')}
          </Button>
        )}
        {onPauseSelected && (
          <Button variant="secondary" size="sm" onClick={onPauseSelected}>
            <Pause className="mr-2 h-3 w-3 text-amber-500" />
            {t('cloud.batch.pause', 'Pause Selected')}
          </Button>
        )}
        {onResumeSelected && (
          <Button variant="secondary" size="sm" onClick={onResumeSelected}>
            <Play className="mr-2 h-3 w-3 text-green-500" />
            {t('cloud.batch.resume', 'Resume Selected')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onRefreshSelected}>
          <RefreshCw className="mr-2 h-3 w-3" />
          {t('cloud.batch.refresh')}
        </Button>
        <Button variant="destructive" size="sm" onClick={onDeleteSelected}>
          <Trash2 className="mr-2 h-3 w-3" />
          {t('cloud.batch.delete')}
        </Button>
      </div>
    </div>
  );
}
