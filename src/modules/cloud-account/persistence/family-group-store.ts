import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { CloudAccountSettingsStore } from './cloud-account-settings-store';
import { logger } from '@/shared/logging/logger';

export const AccountFamilyGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  accountIds: z.array(z.string()),
  primaryAccountId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export type AccountFamilyGroup = z.infer<typeof AccountFamilyGroupSchema>;

const FAMILY_GROUPS_SETTING_KEY = 'account_family_groups';

export class FamilyGroupStore {
  /**
   * Retrieves all registered family groups.
   */
  static getFamilyGroups(): AccountFamilyGroup[] {
    const raw = CloudAccountSettingsStore.getSetting<unknown[]>(FAMILY_GROUPS_SETTING_KEY, [], z.array(z.unknown()));
    if (!Array.isArray(raw)) {
      return [];
    }

    const groups: AccountFamilyGroup[] = [];
    for (const item of raw) {
      const parsed = AccountFamilyGroupSchema.safeParse(item);
      if (parsed.success) {
        groups.push(parsed.data);
      } else {
        logger.warn('Skipping invalid family group entry in settings', parsed.error);
      }
    }
    return groups;
  }

  /**
   * Saves the entire list of family groups.
   */
  static setFamilyGroups(groups: AccountFamilyGroup[]): void {
    CloudAccountSettingsStore.setSetting(FAMILY_GROUPS_SETTING_KEY, groups);
  }

  /**
   * Finds the family group that an account belongs to, if any.
   */
  static getFamilyGroupByAccountId(accountId: string): AccountFamilyGroup | undefined {
    const groups = this.getFamilyGroups();
    return groups.find((group) => group.accountIds.includes(accountId));
  }

  /**
   * Gets a family group by its unique ID.
   */
  static getFamilyGroupById(groupId: string): AccountFamilyGroup | undefined {
    const groups = this.getFamilyGroups();
    return groups.find((group) => group.id === groupId);
  }

  /**
   * Creates or updates a family group.
   */
  static saveFamilyGroup(group: AccountFamilyGroup): AccountFamilyGroup {
    AccountFamilyGroupSchema.parse(group);
    const groups = this.getFamilyGroups();
    const index = groups.findIndex((g) => g.id === group.id);

    const now = Date.now();
    const effectivePrimary =
      group.primaryAccountId && group.accountIds.includes(group.primaryAccountId)
        ? group.primaryAccountId
        : group.accountIds[0];

    const updatedGroup: AccountFamilyGroup = {
      ...group,
      primaryAccountId: effectivePrimary,
      updatedAt: now,
      createdAt: group.createdAt || now,
    };

    if (index >= 0) {
      groups[index] = updatedGroup;
    } else {
      groups.push(updatedGroup);
    }

    this.setFamilyGroups(groups);
    return updatedGroup;
  }

  /**
   * Deletes a family group by ID.
   */
  static deleteFamilyGroup(groupId: string): void {
    const groups = this.getFamilyGroups().filter((g) => g.id !== groupId);
    this.setFamilyGroups(groups);
  }

  /**
   * Links multiple account IDs into a family group (either creating a new one or updating an existing one).
   * Automatically unlinks these accounts from any previous family groups to prevent duplicate memberships.
   */
  static linkAccounts(
    accountIds: string[],
    groupName?: string,
    existingGroupId?: string,
    primaryAccountId?: string,
  ): AccountFamilyGroup {
    if (accountIds.length === 0) {
      throw new Error('At least one account is required to link a family group');
    }

    const uniqueAccountIds = Array.from(new Set(accountIds));
    let groups = this.getFamilyGroups();
    const now = Date.now();

    // 1. Remove accounts from any other existing groups
    groups = groups.map((g) => {
      if (existingGroupId && g.id === existingGroupId) {
        return g;
      }
      const remaining = g.accountIds.filter((id) => !uniqueAccountIds.includes(id));
      const newPrimary =
        g.primaryAccountId && remaining.includes(g.primaryAccountId)
          ? g.primaryAccountId
          : remaining[0];
      return {
        ...g,
        accountIds: remaining,
        primaryAccountId: newPrimary,
        updatedAt: now,
      };
    });

    let targetGroup: AccountFamilyGroup;
    if (existingGroupId) {
      const existing = groups.find((g) => g.id === existingGroupId);
      if (!existing) {
        throw new Error(`Family group with ID ${existingGroupId} not found`);
      }
      const mergedAccountIds = Array.from(new Set([...existing.accountIds, ...uniqueAccountIds]));
      const chosenPrimary =
        primaryAccountId && mergedAccountIds.includes(primaryAccountId)
          ? primaryAccountId
          : existing.primaryAccountId && mergedAccountIds.includes(existing.primaryAccountId)
            ? existing.primaryAccountId
            : mergedAccountIds[0];

      targetGroup = {
        ...existing,
        name: groupName?.trim() || existing.name,
        accountIds: mergedAccountIds,
        primaryAccountId: chosenPrimary,
        updatedAt: now,
      };
      const index = groups.findIndex((g) => g.id === existingGroupId);
      groups[index] = targetGroup;
    } else {
      const chosenPrimary =
        primaryAccountId && uniqueAccountIds.includes(primaryAccountId)
          ? primaryAccountId
          : uniqueAccountIds[0];

      targetGroup = {
        id: uuidv4(),
        name: groupName?.trim() || 'Google One Family',
        accountIds: uniqueAccountIds,
        primaryAccountId: chosenPrimary,
        createdAt: now,
        updatedAt: now,
      };
      groups.push(targetGroup);
    }

    // Filter out any groups that now have 0 accounts
    groups = groups.filter((g) => g.accountIds.length > 0);
    this.setFamilyGroups(groups);

    return targetGroup;
  }

  /**
   * Removes a single account from whichever family group it belongs to.
   * If the group becomes empty, it is automatically removed.
   */
  static unlinkAccount(accountId: string): void {
    const now = Date.now();
    let groups = this.getFamilyGroups();
    let changed = false;

    groups = groups
      .map((g) => {
        if (g.accountIds.includes(accountId)) {
          changed = true;
          const remaining = g.accountIds.filter((id) => id !== accountId);
          const newPrimary =
            g.primaryAccountId && remaining.includes(g.primaryAccountId)
              ? g.primaryAccountId
              : remaining[0];
          return {
            ...g,
            accountIds: remaining,
            primaryAccountId: newPrimary,
            updatedAt: now,
          };
        }
        return g;
      })
      .filter((g) => g.accountIds.length > 0);

    if (changed) {
      this.setFamilyGroups(groups);
    }
  }

  /**
   * Prunes account IDs that no longer exist in the system.
   */
  static pruneMissingAccounts(validAccountIds: string[]): void {
    const validSet = new Set(validAccountIds);
    const now = Date.now();
    let groups = this.getFamilyGroups();
    let changed = false;

    groups = groups
      .map((g) => {
        const filtered = g.accountIds.filter((id) => validSet.has(id));
        if (filtered.length !== g.accountIds.length) {
          changed = true;
          const newPrimary =
            g.primaryAccountId && filtered.includes(g.primaryAccountId)
              ? g.primaryAccountId
              : filtered[0];
          return {
            ...g,
            accountIds: filtered,
            primaryAccountId: newPrimary,
            updatedAt: now,
          };
        }
        return g;
      })
      .filter((g) => g.accountIds.length > 0);

    if (changed) {
      this.setFamilyGroups(groups);
    }
  }
}

