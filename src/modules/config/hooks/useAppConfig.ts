import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/ui/use-toast';
import { ipc } from '@/ipc/manager';
import { AppConfig } from '@/modules/config/types';

const SAVE_DEBOUNCE_MS = 400;

export type ConfigSaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface AppConfigSaveStatus {
  status: ConfigSaveState;
  lastSavedAt: number | null;
  errorMessage?: string | null;
}

let currentSaveStatus: AppConfigSaveStatus = {
  status: 'saved',
  lastSavedAt: null,
};

const saveStatusListeners = new Set<() => void>();

export function setAppConfigSaveStatus(
  updater: (prev: AppConfigSaveStatus) => AppConfigSaveStatus,
): void {
  currentSaveStatus = updater(currentSaveStatus);
  for (const listener of saveStatusListeners) {
    listener();
  }
}

export function useAppConfigSaveStatus(): AppConfigSaveStatus {
  return useSyncExternalStore(
    (onStoreChange) => {
      saveStatusListeners.add(onStoreChange);
      return () => {
        saveStatusListeners.delete(onStoreChange);
      };
    },
    () => currentSaveStatus,
    () => currentSaveStatus,
  );
}

export function useAppConfig() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const {
    data: config,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['appConfig'],
    queryFn: async () => {
      return (await ipc.client.config.load()) as AppConfig;
    },
  });

  const updateConfig = useMutation({
    mutationKey: ['appConfig', 'save'],
    mutationFn: async (newConfig: AppConfig) => {
      await ipc.client.config.save(newConfig);
      return newConfig;
    },
  });

  const latestConfigRef = useRef<AppConfig | null>(null);
  const lastStableConfigRef = useRef<AppConfig | null>(null);
  const pendingResolversRef = useRef<
    Array<{ resolve: () => void; reject: (error: Error) => void }>
  >([]);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (config) {
      lastStableConfigRef.current = config;
    }
  }, [config]);

  const flushPendingSave = useCallback(async () => {
    const pendingBatch = pendingResolversRef.current.splice(0);
    const nextConfig = latestConfigRef.current;
    if (!nextConfig) {
      for (const item of pendingBatch) {
        item.resolve();
      }
      return;
    }

    try {
      const savedConfig = await updateConfig.mutateAsync(nextConfig);
      queryClient.setQueryData(['appConfig'], savedConfig);
      lastStableConfigRef.current = savedConfig;
      setAppConfigSaveStatus(() => ({
        status: 'saved',
        lastSavedAt: Date.now(),
      }));
      for (const item of pendingBatch) {
        item.resolve();
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to save settings');
      const fallback = lastStableConfigRef.current;
      if (fallback) {
        queryClient.setQueryData(['appConfig'], fallback);
      } else {
        queryClient.invalidateQueries({ queryKey: ['appConfig'] });
      }
      setAppConfigSaveStatus((prev) => ({
        status: 'error',
        lastSavedAt: prev.lastSavedAt,
        errorMessage: error.message,
      }));
      toast({
        title: t('settings.toast.saveFailed.title'),
        description: error.message,
        variant: 'destructive',
      });
      for (const item of pendingBatch) {
        item.reject(error);
      }
    }
  }, [queryClient, t, updateConfig]);

  const saveConfig = useCallback(
    (newConfig: AppConfig) => {
      latestConfigRef.current = newConfig;
      queryClient.setQueryData(['appConfig'], newConfig);
      setAppConfigSaveStatus((prev) => ({
        status: 'saving',
        lastSavedAt: prev.lastSavedAt,
      }));

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      return new Promise<void>((resolve, reject) => {
        pendingResolversRef.current.push({ resolve, reject });
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          flushPendingSave();
        }, SAVE_DEBOUNCE_MS);
      });
    },
    [flushPendingSave, queryClient],
  );

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!debounceTimerRef.current) {
        return;
      }
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      flushPendingSave();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [flushPendingSave]);

  return {
    config,
    isLoading,
    error,
    saveConfig,
    isSaving: updateConfig.isPending,
  };
}
