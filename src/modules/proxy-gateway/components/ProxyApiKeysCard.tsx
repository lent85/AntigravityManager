import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import type { ProxyApiKey, ProxyConfig } from '@/modules/config/types';
import {
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  AppWindow,
} from 'lucide-react';

interface ProxyApiKeysCardProps {
  proxyConfig: ProxyConfig;
  updateProxyConfig: (newConfig: ProxyConfig) => Promise<void>;
  onViewClientStats?: (keyId: string) => void;
}

export function ProxyApiKeysCard({
  proxyConfig,
  updateProxyConfig,
  onViewClientStats,
}: ProxyApiKeysCardProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');

  const [editKey, setEditKey] = useState<ProxyApiKey | null>(null);
  const [editKeyName, setEditKeyName] = useState('');

  const [deleteKey, setDeleteKey] = useState<ProxyApiKey | null>(null);

  // Visible keys state
  const [visibleKeyIds, setVisibleKeyIds] = useState<Set<string>>(new Set());
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // Auto-migrate legacy single api_key to api_keys array if empty
  useEffect(() => {
    if ((!proxyConfig.api_keys || proxyConfig.api_keys.length === 0) && proxyConfig.api_key) {
      const seededKey: ProxyApiKey = {
        id: 'default',
        name: 'Default Client',
        key: proxyConfig.api_key,
        created_at: Date.now(),
        enabled: true,
      };
      updateProxyConfig({
        ...proxyConfig,
        api_keys: [seededKey],
      });
    }
  }, [proxyConfig, updateProxyConfig]);

  const keys = proxyConfig.api_keys || [];

  const handleOpenCreate = () => {
    setNewKeyName('');
    setNewKeyValue(`sk-antigravity-${crypto.randomUUID().replace(/-/g, '')}`);
    setIsCreateOpen(true);
  };

  const handleRegenerateNewKey = () => {
    setNewKeyValue(`sk-antigravity-${crypto.randomUUID().replace(/-/g, '')}`);
  };

  const handleCreateKey = async () => {
    const trimmedName = newKeyName.trim() || 'Client App';
    const trimmedKey = newKeyValue.trim();

    if (!trimmedKey) {
      toast({
        title: t('proxy.keys.error', 'Error'),
        description: 'API key cannot be empty',
        variant: 'destructive',
      });
      return;
    }

    const newApiKey: ProxyApiKey = {
      id: `key_${crypto.randomUUID().slice(0, 8)}`,
      name: trimmedName,
      key: trimmedKey,
      created_at: Date.now(),
      enabled: true,
    };

    const nextKeys = [...keys, newApiKey];
    await updateProxyConfig({
      ...proxyConfig,
      api_keys: nextKeys,
      api_key: proxyConfig.api_key || trimmedKey,
    });

    setIsCreateOpen(false);
    toast({
      title: t('proxy.keys.created_title', 'API Key Created'),
      description: t('proxy.keys.created_desc', { name: trimmedName }),
    });
  };

  const handleToggleKey = async (keyItem: ProxyApiKey) => {
    const nextKeys = keys.map((k) =>
      k.id === keyItem.id ? { ...k, enabled: !k.enabled } : k,
    );
    // Keep primary key updated
    const firstActive = nextKeys.find((k) => k.enabled !== false);
    await updateProxyConfig({
      ...proxyConfig,
      api_keys: nextKeys,
      api_key: firstActive ? firstActive.key : proxyConfig.api_key,
    });
    toast({
      title: keyItem.enabled
        ? t('proxy.keys.disabled_toast', 'API Key Disabled')
        : t('proxy.keys.enabled_toast', 'API Key Enabled'),
    });
  };

  const handleStartEdit = (keyItem: ProxyApiKey) => {
    setEditKey(keyItem);
    setEditKeyName(keyItem.name);
  };

  const handleSaveEdit = async () => {
    if (!editKey) return;
    const trimmedName = editKeyName.trim() || editKey.name;
    const nextKeys = keys.map((k) =>
      k.id === editKey.id ? { ...k, name: trimmedName } : k,
    );
    await updateProxyConfig({
      ...proxyConfig,
      api_keys: nextKeys,
    });
    setEditKey(null);
    toast({
      title: t('proxy.keys.renamed_toast', 'Client name updated'),
    });
  };

  const handleDeleteKey = async () => {
    if (!deleteKey) return;
    const nextKeys = keys.filter((k) => k.id !== deleteKey.id);
    const firstActive = nextKeys.find((k) => k.enabled !== false);
    await updateProxyConfig({
      ...proxyConfig,
      api_keys: nextKeys,
      api_key: firstActive ? firstActive.key : '',
    });
    setDeleteKey(null);
    toast({
      title: t('proxy.keys.deleted_toast', 'API Key Deleted'),
    });
  };

  const toggleVisibility = (id: string) => {
    setVisibleKeyIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const copyKeyText = (keyItem: ProxyApiKey) => {
    navigator.clipboard.writeText(keyItem.key);
    setCopiedKeyId(keyItem.id);
    setTimeout(() => setCopiedKeyId(null), 2000);
    toast({
      title: t('proxy.copied', 'Copied to clipboard!'),
      description: `${keyItem.name} (${keyItem.key.slice(0, 16)}...)`,
    });
  };

  const formatRelativeTime = (timestamp?: number | null) => {
    if (!timestamp) return t('proxy.keys.never_used', 'Never');
    const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSeconds < 60) return t('proxy.keys.just_now', 'Just now');
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Key className="size-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-semibold">
                {t('proxy.keys.title', 'API Keys & Client Applications')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t(
                  'proxy.keys.description',
                  'Manage multiple API keys to track usage per client (e.g. Cursor, OpenCode, VSCode, or custom scripts).',
                )}
              </CardDescription>
            </div>
          </div>
          <Button size="sm" className="h-7 px-2.5 text-xs font-medium" onClick={handleOpenCreate}>
            <Plus className="size-3.5 mr-1" />
            {t('proxy.keys.create_button', 'Create API Key')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed rounded-lg">
            <AlertCircle className="size-8 text-muted-foreground/60 mb-2" />
            <p className="text-xs font-semibold text-muted-foreground">
              {t('proxy.keys.empty_title', 'No API Keys Configured')}
            </p>
            <p className="text-[11px] text-muted-foreground/80 mt-1 max-w-sm">
              {t(
                'proxy.keys.empty_desc',
                'Your proxy is currently running in Open Mode without authentication. Create keys to identify different applications and track their usage.',
              )}
            </p>
            <Button size="sm" variant="outline" className="mt-3 text-xs h-7" onClick={handleOpenCreate}>
              <Plus className="size-3.5 mr-1" />
              {t('proxy.keys.create_first', 'Create First Key')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-[11px] font-semibold text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2">{t('proxy.keys.col_client', 'Client / App Name')}</th>
                  <th className="px-3 py-2">{t('proxy.keys.col_key', 'API Key')}</th>
                  <th className="px-3 py-2 text-center">{t('proxy.keys.col_status', 'Status')}</th>
                  <th className="px-3 py-2">{t('proxy.keys.col_last_used', 'Last Used')}</th>
                  <th className="px-3 py-2 text-right">{t('proxy.keys.col_actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {keys.map((keyItem) => {
                  const isVisible = visibleKeyIds.has(keyItem.id);
                  const isCopied = copiedKeyId === keyItem.id;
                  const maskedKey = isVisible
                    ? keyItem.key
                    : keyItem.key.slice(0, 14) + '••••••••••••••••';

                  return (
                    <tr
                      key={keyItem.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        !keyItem.enabled ? 'opacity-60 bg-muted/10' : ''
                      }`}
                    >
                      {/* Client Name */}
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1.5">
                          <AppWindow className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[150px] sm:max-w-[200px]" title={keyItem.name}>
                            {keyItem.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => handleStartEdit(keyItem)}
                            title={t('proxy.keys.rename', 'Rename')}
                          >
                            <Edit2 className="size-3" />
                          </Button>
                        </div>
                      </td>

                      {/* API Key */}
                      <td className="px-3 py-2 font-mono text-[11px]">
                        <div className="flex items-center gap-1">
                          <span className="select-all truncate max-w-[180px] sm:max-w-[250px]">
                            {maskedKey}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => toggleVisibility(keyItem.id)}
                            title={isVisible ? 'Hide Key' : 'Show Key'}
                          >
                            {isVisible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-5 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => copyKeyText(keyItem)}
                            title="Copy Key"
                          >
                            {isCopied ? (
                              <CheckCircle2 className="size-3 text-green-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </Button>
                        </div>
                      </td>

                      {/* Status Toggle */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={keyItem.enabled !== false}
                            onCheckedChange={() => handleToggleKey(keyItem)}
                          />
                          <Badge
                            variant={keyItem.enabled !== false ? 'default' : 'secondary'}
                            className={`text-[10px] px-1.5 py-0 h-4 font-normal ${
                              keyItem.enabled !== false
                                ? 'bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {keyItem.enabled !== false
                              ? t('proxy.keys.active', 'Active')
                              : t('proxy.keys.disabled', 'Disabled')}
                          </Badge>
                        </div>
                      </td>

                      {/* Last Used */}
                      <td className="px-3 py-2 text-muted-foreground text-[11px]">
                        {formatRelativeTime(keyItem.last_used_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {onViewClientStats && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] text-primary"
                              onClick={() => onViewClientStats(keyItem.id)}
                            >
                              {t('proxy.keys.stats_link', 'Stats')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteKey(keyItem)}
                            title="Delete Key"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Create Key Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('proxy.keys.create_title', 'Create API Key for Client App')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t(
                'proxy.keys.create_desc',
                'Each key can be associated with an app (e.g. Cursor, OpenCode, Claude Dev, Chatbot) to monitor and track usage.',
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label htmlFor="client-app-name">{t('proxy.keys.app_name_label', 'Client / App Name')}</Label>
              <Input
                id="client-app-name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Cursor IDE, OpenCode, Work Laptop"
                className="h-8 text-xs"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="client-api-key">{t('proxy.keys.key_label', 'Generated Secret Key')}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={handleRegenerateNewKey}
                >
                  <RefreshCw className="size-3 mr-1" />
                  {t('proxy.keys.regenerate', 'Generate New')}
                </Button>
              </div>
              <Input
                id="client-api-key"
                value={newKeyValue}
                onChange={(e) => setNewKeyValue(e.target.value)}
                className="h-8 font-mono text-xs select-all"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button size="sm" onClick={handleCreateKey}>
              {t('proxy.keys.confirm_create', 'Create Key')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={!!editKey} onOpenChange={(open) => !open && setEditKey(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('proxy.keys.rename_title', 'Rename Client App')}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="edit-app-name" className="text-xs mb-1 block">
              {t('proxy.keys.app_name_label', 'Client / App Name')}
            </Label>
            <Input
              id="edit-app-name"
              value={editKeyName}
              onChange={(e) => setEditKeyName(e.target.value)}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditKey(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button size="sm" onClick={handleSaveEdit}>
              {t('common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteKey} onOpenChange={(open) => !open && setDeleteKey(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('proxy.keys.delete_title', 'Delete API Key?')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t(
                'proxy.keys.delete_desc',
                'Deleting this key will immediately prevent clients using it from authenticating. Historical usage data will be preserved.',
              )}
              {deleteKey && (
                <div className="mt-2 font-semibold text-foreground">
                  {deleteKey.name} ({deleteKey.key.slice(0, 14)}...)
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteKey(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteKey}>
              {t('common.delete', 'Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
