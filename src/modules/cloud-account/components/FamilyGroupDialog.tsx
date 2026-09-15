import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Crown, Trash2, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import type { CloudAccount } from '@/modules/cloud-account/types';
import type { AccountFamilyGroup } from '@/modules/cloud-account/persistence/family-group-store';
import { useAppConfig } from '@/modules/config/hooks/useAppConfig';
import {
  useFamilyGroups,
  useLinkAccountsToFamily,
  useDeleteFamilyGroup,
  useUnlinkAccountFromFamily,
} from '@/modules/cloud-account/hooks/useFamilyGroups';

interface FamilyGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: CloudAccount[];
  initialSelectedAccountIds?: string[];
  targetGroupId?: string;
}

export function FamilyGroupDialog({
  open,
  onOpenChange,
  accounts,
  initialSelectedAccountIds = [],
  targetGroupId,
}: FamilyGroupDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { config, saveConfig } = useAppConfig();
  const { data: familyGroups = [] } = useFamilyGroups();
  const linkMutation = useLinkAccountsToFamily();
  const deleteMutation = useDeleteFamilyGroup();
  const unlinkMutation = useUnlinkAccountFromFamily();

  const [groupName, setGroupName] = useState('Google One Family');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [primaryAccountId, setPrimaryAccountId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('new');

  useEffect(() => {
    if (!open) return;

    if (targetGroupId) {
      const group = familyGroups.find(
        (g) => g.id === targetGroupId || g.accountIds.includes(targetGroupId),
      );
      if (group) {
        setSelectedGroupId(group.id);
        setGroupName(group.name);
        setSelectedAccountIds(group.accountIds);
        setPrimaryAccountId(group.primaryAccountId || group.accountIds[0] || '');
        return;
      }
    }

    if (initialSelectedAccountIds.length > 0) {
      // Check if all selected accounts belong to the same existing group
      const matchingGroup = familyGroups.find((g) =>
        initialSelectedAccountIds.some((id) => g.accountIds.includes(id)),
      );

      if (matchingGroup) {
        setSelectedGroupId(matchingGroup.id);
        setGroupName(matchingGroup.name);
        const mergedIds = Array.from(
          new Set([...matchingGroup.accountIds, ...initialSelectedAccountIds]),
        );
        setSelectedAccountIds(mergedIds);
        setPrimaryAccountId(
          matchingGroup.primaryAccountId && mergedIds.includes(matchingGroup.primaryAccountId)
            ? matchingGroup.primaryAccountId
            : initialSelectedAccountIds[0] || mergedIds[0] || '',
        );
      } else {
        setSelectedGroupId('new');
        setGroupName(`Google One Family (${initialSelectedAccountIds.length})`);
        setSelectedAccountIds(initialSelectedAccountIds);
        setPrimaryAccountId(initialSelectedAccountIds[0] || '');
      }
    } else {
      setSelectedGroupId('new');
      setGroupName('Google One Family');
      setSelectedAccountIds([]);
      setPrimaryAccountId('');
    }
  }, [open, targetGroupId, initialSelectedAccountIds, familyGroups]);

  const handleGroupSelect = (val: string) => {
    setSelectedGroupId(val);
    if (val === 'new') {
      setGroupName('Google One Family');
      setSelectedAccountIds(initialSelectedAccountIds);
      setPrimaryAccountId(initialSelectedAccountIds[0] || '');
    } else {
      const group = familyGroups.find((g) => g.id === val);
      if (group) {
        setGroupName(group.name);
        setSelectedAccountIds(group.accountIds);
        setPrimaryAccountId(group.primaryAccountId || group.accountIds[0] || '');
      }
    }
  };

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      const next = prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId];

      if (!next.includes(primaryAccountId)) {
        setPrimaryAccountId(next[0] || '');
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (selectedAccountIds.length === 0) {
      toast({
        title: t('cloud.family.emptyWarning', 'Vui lòng chọn ít nhất 1 tài khoản'),
        variant: 'destructive',
      });
      return;
    }

    try {
      await linkMutation.mutateAsync({
        accountIds: selectedAccountIds,
        groupName: groupName.trim() || 'Google One Family',
        groupId: selectedGroupId === 'new' ? undefined : selectedGroupId,
        primaryAccountId: primaryAccountId || selectedAccountIds[0],
      });

      if (config && config.group_family_accounts_enabled === false) {
        await saveConfig({ ...config, group_family_accounts_enabled: true });
      }

      toast({
        title: t('cloud.family.toastLinked', 'Đã lưu nhóm gia đình thành công'),
        description: t('cloud.family.toastLinkedDesc', {
          name: groupName,
          count: selectedAccountIds.length,
        }),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t('error.generic', 'Thao tác thất bại'),
        description: String(error),
        variant: 'destructive',
      });
    }
  };

  const handleDeleteGroup = async () => {
    if (selectedGroupId === 'new') return;
    if (confirm(t('cloud.family.confirmDelete', 'Bạn có chắc chắn muốn xóa nhóm gia đình này?'))) {
      try {
        await deleteMutation.mutateAsync(selectedGroupId);
        toast({ title: t('cloud.family.toastDeleted', 'Đã xóa nhóm gia đình') });
        onOpenChange(false);
      } catch (error) {
        toast({
          title: t('error.generic', 'Thao tác thất bại'),
          description: String(error),
          variant: 'destructive',
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            {t('cloud.family.dialogTitle', 'Liên kết nhóm gia đình Google One')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'cloud.family.dialogDescription',
              'Các tài khoản cùng nhóm gia đình sẽ dùng chung gói Quota. Chỉ cần 1 tài khoản cập nhật là toàn bộ tài khoản trong nhóm sẽ được đồng bộ ngay lập tức.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {familyGroups.length > 0 && (
            <div className="space-y-1.5">
              <Label>{t('cloud.family.selectExistingOrNew', 'Chọn nhóm gia đình')}</Label>
              <Select value={selectedGroupId} onValueChange={handleGroupSelect}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">
                    + {t('cloud.family.createNew', 'Tạo nhóm gia đình mới')}
                  </SelectItem>
                  {familyGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} ({group.accountIds.length} {t('cloud.family.members', 'thành viên')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('cloud.family.groupNameLabel', 'Tên nhóm gia đình')}</Label>
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="VD: Gia đình Google One 2TB"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>
                {t('cloud.family.membersLabel', 'Chọn tài khoản trong gia đình')}{' '}
                <span className="text-muted-foreground text-xs font-normal">
                  ({selectedAccountIds.length} {t('cloud.family.selected', 'đã chọn')})
                </span>
              </Label>
              {selectedAccountIds.length > 0 && (
                <span className="text-[11px] text-amber-500 flex items-center gap-1 font-medium">
                  <Crown className="h-3 w-3" />
                  {t('cloud.family.hasOwnerTip', 'Đánh dấu chủ gia đình bên dưới')}
                </span>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto rounded-md border p-2 space-y-1">
              {accounts.map((acc) => {
                const isChecked = selectedAccountIds.includes(acc.id);
                const isOwner = primaryAccountId === acc.id;

                return (
                  <div
                    key={acc.id}
                    className={`flex items-center justify-between p-2 rounded-md transition-colors ${
                      isChecked ? 'bg-muted/60 border border-primary/20' : 'hover:bg-muted/30'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0 pr-2">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleAccount(acc.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-foreground flex items-center gap-1.5">
                          {acc.name || acc.email}
                          {isOwner && (
                            <span className="rounded bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[10px] px-1 py-0 flex items-center gap-0.5 font-semibold">
                              <Crown className="h-2.5 w-2.5" />
                              {t('cloud.family.ownerBadge', 'Chủ gia đình')}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {acc.email}
                        </div>
                      </div>
                    </label>

                    {isChecked && (
                      <Button
                        type="button"
                        variant={isOwner ? 'secondary' : 'ghost'}
                        size="sm"
                        className={`h-7 px-2 text-[11px] shrink-0 cursor-pointer ${
                          isOwner ? 'text-amber-500 font-semibold' : 'text-muted-foreground'
                        }`}
                        onClick={() => setPrimaryAccountId(acc.id)}
                        title={t('cloud.family.setAsOwnerTooltip', 'Đặt tài khoản này làm Chủ gia đình Google One')}
                      >
                        <Crown className={`h-3 w-3 mr-1 ${isOwner ? 'text-amber-500' : ''}`} />
                        {isOwner
                          ? t('cloud.family.isOwner', 'Chủ gói')
                          : t('cloud.family.setOwner', 'Đặt làm chủ')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between w-full">
          <div>
            {selectedGroupId !== 'new' && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteGroup}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                {t('cloud.family.deleteGroup', 'Xóa nhóm')}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('common.cancel', 'Hủy')}
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={linkMutation.isPending || selectedAccountIds.length === 0}
            >
              {linkMutation.isPending ? t('common.saving', 'Đang lưu...') : t('common.save', 'Lưu nhóm')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
