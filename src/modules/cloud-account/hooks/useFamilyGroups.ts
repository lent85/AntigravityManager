import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getFamilyGroups,
  saveFamilyGroup,
  deleteFamilyGroup,
  linkAccountsToFamily,
  unlinkAccountFromFamily,
} from '@/modules/cloud-account/actions/cloud';
import type { AccountFamilyGroup } from '@/modules/cloud-account/persistence/family-group-store';

export const FAMILY_QUERY_KEYS = {
  familyGroups: ['familyGroups'] as const,
  cloudAccounts: ['cloudAccounts'] as const,
};

export function useFamilyGroups() {
  return useQuery({
    queryKey: FAMILY_QUERY_KEYS.familyGroups,
    queryFn: getFamilyGroups,
    staleTime: 30_000,
  });
}

export function useSaveFamilyGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (group: AccountFamilyGroup) => saveFamilyGroup(group),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.familyGroups });
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useDeleteFamilyGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteFamilyGroup({ groupId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.familyGroups });
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useLinkAccountsToFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      accountIds: string[];
      groupName?: string;
      groupId?: string;
      primaryAccountId?: string;
    }) => linkAccountsToFamily(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.familyGroups });
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.cloudAccounts });
    },
  });
}

export function useUnlinkAccountFromFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => unlinkAccountFromFamily({ accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.familyGroups });
      queryClient.invalidateQueries({ queryKey: FAMILY_QUERY_KEYS.cloudAccounts });
    },
  });
}
