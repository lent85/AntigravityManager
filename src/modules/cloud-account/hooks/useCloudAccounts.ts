import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listCloudAccounts,
  addGoogleAccount,
  deleteCloudAccount,
  refreshAccountQuota,
  setAccountProxy,
  listOAuthClients,
  setActiveOAuthClient,
  getCloudAccountSecurityStatus,
  type OAuthClientDescriptor,
} from '@/modules/cloud-account/actions/cloud';
import { CloudAccount } from '@/modules/cloud-account/types';
import type { AntigravityAppTarget } from '@/shared/platform/antigravityAppTarget';

import {
  switchCloudAccount,
  markActiveAccount,
  detectActiveAccounts,
  getAutoSwitchEnabled,
  setAutoSwitchEnabled,
  getAutoSwitchTargetsConfig,
  setAutoSwitchNoRestartEnabled,
  getAutoSwitchModelsConfig,
  setAutoSwitchModelsConfig,
  forcePollCloudMonitor,
  getWeeklyWarmupConfig,
  setWeeklyWarmupConfig,
} from '@/modules/cloud-account/actions/cloud';
import type { WeeklyWarmupConfig } from '@/modules/cloud-account/services/weekly-warmup-contract';
import { syncLocalAccount } from '@/modules/cloud-account/actions/cloud';
import { exportCloudAccounts, importCloudAccounts } from '@/modules/cloud-account/actions/cloud';
import { startAuthFlow } from '@/modules/cloud-account/actions/cloud';
import {
  getMetricsPollInterval,
  setMetricsPollInterval,
  getEmulationState,
  setEmulationEnabled,
  setEmulationTickInterval,
  generateEmulatedAccounts,
  updateEmulatedAccountStrategy,
  resetEmulatedQuotas,
  clearEmulatedAccounts,
} from '@/modules/cloud-account/actions/cloud';
import type { EmulationState } from '@/modules/cloud-account/emulation/types';

type SetAccountProxyInput = Parameters<typeof setAccountProxy>[0];
type SetAccountProxyResult = Awaited<ReturnType<typeof setAccountProxy>>;
type ImportCloudAccountsInput = Parameters<typeof importCloudAccounts>[0];
type ImportCloudAccountsResult = Awaited<ReturnType<typeof importCloudAccounts>>;

export const QUERY_KEYS = {
  cloudAccounts: ['cloudAccounts'],
  securityStatus: ['cloudAccountSecurityStatus'],
  oauthClients: ['oauthClients'],
  emulationState: ['emulationState'],
};

export function useCloudAccounts(refetchInterval: number | false = false) {
  return useQuery<CloudAccount[]>({
    queryKey: QUERY_KEYS.cloudAccounts,
    queryFn: listCloudAccounts,
    staleTime: 1000 * 60, // 1 minute
    refetchInterval,
  });
}

export function useCloudAccountSecurityStatus() {
  return useQuery({
    queryKey: QUERY_KEYS.securityStatus,
    queryFn: getCloudAccountSecurityStatus,
    staleTime: Infinity,
  });
}

export function useAddGoogleAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addGoogleAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useOAuthClients() {
  return useQuery<OAuthClientDescriptor[]>({
    queryKey: QUERY_KEYS.oauthClients,
    queryFn: listOAuthClients,
    staleTime: 1000 * 60 * 5,
  });
}

export function useSetActiveOAuthClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setActiveOAuthClient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.oauthClients });
    },
  });
}

export function useDeleteCloudAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteCloudAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useRefreshQuota() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['refreshAccountQuota'],
    mutationFn: refreshAccountQuota,
    onSuccess: (updatedAccount: CloudAccount) => {
      // Optimistically update
      queryClient.setQueryData(QUERY_KEYS.cloudAccounts, (oldData: CloudAccount[] | undefined) => {
        if (!oldData) return [updatedAccount];
        return oldData.map((acc) => (acc.id === updatedAccount.id ? updatedAccount : acc));
      });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useSwitchCloudAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: switchCloudAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
      queryClient.invalidateQueries({ queryKey: ['currentAccount'] });
    },
  });
}

export function useMarkActiveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markActiveAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
      queryClient.invalidateQueries({ queryKey: ['currentAccount'] });
    },
  });
}

export function useDetectActiveAccounts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: detectActiveAccounts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
      queryClient.invalidateQueries({ queryKey: ['currentAccount'] });
    },
  });
}

export const AUTO_SWITCH_KEY = ['autoSwitchEnabled'];

export function useAutoSwitchEnabled(appTarget?: AntigravityAppTarget) {
  return useQuery<boolean>({
    queryKey: [...AUTO_SWITCH_KEY, appTarget],
    queryFn: () => getAutoSwitchEnabled(appTarget ? { appTarget } : undefined),
    staleTime: Infinity, // Settings don't change often unless we change them
  });
}

export function useSetAutoSwitchEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setAutoSwitchEnabled,
    onSuccess: (_, variables) => {
      if (!variables.appTarget) {
        queryClient.setQueryData(AUTO_SWITCH_KEY, variables.enabled);
      }
      queryClient.invalidateQueries({ queryKey: AUTO_SWITCH_TARGETS_CONFIG_KEY });
      queryClient.invalidateQueries({ queryKey: AUTO_SWITCH_KEY });
    },
  });
}

export const AUTO_SWITCH_TARGETS_CONFIG_KEY = ['autoSwitchTargetsConfig'];

export function useAutoSwitchTargetsConfig() {
  return useQuery({
    queryKey: AUTO_SWITCH_TARGETS_CONFIG_KEY,
    queryFn: getAutoSwitchTargetsConfig,
    staleTime: 30_000,
  });
}

export function useSetAutoSwitchNoRestartEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setAutoSwitchNoRestartEnabled,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTO_SWITCH_TARGETS_CONFIG_KEY });
    },
  });
}

export const AUTO_SWITCH_MODELS_KEY = ['autoSwitchModelsConfig'];

export function useAutoSwitchModelsConfig() {
  return useQuery<Record<string, { enabled: boolean; priority: boolean }>>({
    queryKey: AUTO_SWITCH_MODELS_KEY,
    queryFn: getAutoSwitchModelsConfig,
    staleTime: Infinity,
  });
}

export function useSetAutoSwitchModelsConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setAutoSwitchModelsConfig,
    onSuccess: (_, variables) => {
      queryClient.setQueryData(AUTO_SWITCH_MODELS_KEY, variables);
    },
  });
}

export function useForcePollCloudMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['forcePollCloudMonitor'],
    mutationFn: forcePollCloudMonitor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export const WEEKLY_WARMUP_CONFIG_KEY = ['weeklyWarmupConfig'];

export function useWeeklyWarmupConfig() {
  return useQuery<WeeklyWarmupConfig>({
    queryKey: WEEKLY_WARMUP_CONFIG_KEY,
    queryFn: getWeeklyWarmupConfig,
    staleTime: Infinity,
  });
}

export function useSetWeeklyWarmupConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setWeeklyWarmupConfig,
    onSuccess: (_, config) => {
      queryClient.setQueryData(WEEKLY_WARMUP_CONFIG_KEY, config);
    },
  });
}

export function useSyncLocalAccount() {
  const queryClient = useQueryClient();
  return useMutation<CloudAccount | null, Error, { appTarget?: AntigravityAppTarget } | undefined>({
    mutationKey: ['syncLocalAccount'],
    mutationFn: syncLocalAccount,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export { startAuthFlow };

export function useSetAccountProxy() {
  const queryClient = useQueryClient();
  return useMutation<SetAccountProxyResult, Error, SetAccountProxyInput>({
    mutationFn: setAccountProxy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
    onError: (error) => {
      console.error('[Mutation] setAccountProxy failed:', error);
    },
  });
}

export function useExportCloudAccounts() {
  return useMutation<string, Error, { stripTokens?: boolean }>({
    mutationFn: exportCloudAccounts,
  });
}

export function useImportCloudAccounts() {
  const queryClient = useQueryClient();
  return useMutation<ImportCloudAccountsResult, Error, ImportCloudAccountsInput>({
    mutationFn: importCloudAccounts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
    onError: (error) => {
      console.error('[Mutation] importCloudAccounts failed:', error);
    },
  });
}

export const METRICS_POLL_INTERVAL_KEY = ['metricsPollInterval'];

export function useMetricsPollInterval() {
  return useQuery<number>({
    queryKey: METRICS_POLL_INTERVAL_KEY,
    queryFn: getMetricsPollInterval,
    staleTime: 60_000,
  });
}

export function useSetMetricsPollInterval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setMetricsPollInterval,
    onSuccess: (newInterval) => {
      queryClient.setQueryData(METRICS_POLL_INTERVAL_KEY, newInterval);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
      queryClient.invalidateQueries({ queryKey: ['gateway', 'modelAvailability'] });
    },
  });
}

export function useEmulationState(refetchInterval: number | false = false) {
  return useQuery<EmulationState>({
    queryKey: QUERY_KEYS.emulationState,
    queryFn: getEmulationState,
    staleTime: 5000,
    refetchInterval,
  });
}

export function useSetEmulationEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setEmulationEnabled,
    onSuccess: (state) => {
      queryClient.setQueryData(QUERY_KEYS.emulationState, state);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useSetEmulationTickInterval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setEmulationTickInterval,
    onSuccess: (state) => {
      queryClient.setQueryData(QUERY_KEYS.emulationState, state);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useGenerateEmulatedAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: generateEmulatedAccounts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.emulationState });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useUpdateEmulatedAccountStrategy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateEmulatedAccountStrategy,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.emulationState });
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useResetEmulatedQuotas() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetEmulatedQuotas,
    onSuccess: (state) => {
      queryClient.setQueryData(QUERY_KEYS.emulationState, state);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useClearEmulatedAccounts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearEmulatedAccounts,
    onSuccess: (state) => {
      queryClient.setQueryData(QUERY_KEYS.emulationState, state);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.cloudAccounts });
    },
  });
}

