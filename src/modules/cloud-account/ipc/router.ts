import { CloudAccountSwitchStatusSchema } from '../services/cloud-account-switch-status.schema';
import { toCloudAccountSwitchStatusError } from '../services/cloud-account-switch-status.error';
import {
  CloudMonitorEnabledInputSchema,
  CloudMonitorModelsSchema,
  CloudMonitorModelsInputSchema,
  CloudMonitorWarmupSchema,
} from '../services/cloud-account-monitor.schema';
import { toCloudMonitorORPCError } from '../services/cloud-account-monitor.error';
import {
  chooseAndImportCloudAccountFile,
  chooseAndExportCloudAccountFile,
} from './cloud-account-file-desktop';
import {
  CloudAccountImportInputSchema,
  CloudAccountExportInputSchema,
  CloudAccountImportResultSchema,
  CloudAccountExportResultSchema,
} from '../services/cloud-account-file.schema';
import { z } from 'zod';
import { os } from '@orpc/server';
import {
  openCloudIdentityStorageFolder,
  markActiveAccount,
  detectActiveAccounts,
  getAutoSwitchEnabled,
  setAutoSwitchEnabled,
  getAutoSwitchTargetsConfig,
  setAutoSwitchNoRestartEnabled,
  togglePauseCloudAccount,
  batchSetCloudAccountsPaused,
  getMetricsPollInterval,
  setMetricsPollInterval,
  getMetricsSyncDelayConfig,
  setMetricsSyncDelayConfig,
  getSyncingAccountId,
  getEmulationState,
  setEmulationEnabled,
  setEmulationTickInterval,
  generateEmulatedAccounts,
  updateEmulatedAccountStrategy,
  resetEmulatedQuotas,
  clearEmulatedAccounts,
  getFamilyGroups,
  saveFamilyGroup,
  deleteFamilyGroup,
  linkAccountsToFamily,
  unlinkAccountFromFamily,
} from './handler';
import { AccountFamilyGroupSchema } from '@/modules/cloud-account/persistence/family-group-store';
import {
  AccountEmulationStrategyConfigSchema,
  EmulationStateSchema,
} from '@/modules/cloud-account/emulation/types';
import {
  CloudAccountIdSchema,
  DeleteCloudAccountInputSchema,
  SetCloudAccountProxyInputSchema,
} from '@/modules/cloud-account/services/cloud-account-mutation.schema';
import { AntigravityAppTargetSchema } from '@/shared/platform/antigravityAppTarget';
import { CloudAccountSchema } from '@/modules/cloud-account/types';
import {
  ActiveOAuthClientSchema,
  OAuthClientDescriptorSchema,
  SetActiveOAuthClientInputSchema,
} from '@/modules/cloud-account/services/oauth-client-preference.schema';
import { SyncFromIdeInputSchema } from '@/modules/cloud-account/services/ide-account-sync.schema';
import { toSyncLocalAccountORPCError } from '@/modules/cloud-account/services/ide-account-sync-error';
import { CloudAccountViewSchema } from '@/modules/cloud-account/services/cloud-account-view';
import { getCloudAccountAdapter } from '@/modules/cloud-account/ipc/cloud-account-adapter';
import { CloudAccountSecurityStatusSchema } from '@/modules/cloud-account/services/cloud-account-security-status.schema';
import { toAccountValidationLinkORPCError } from '@/modules/cloud-account/services/account-validation-link.error';
import {
  DesktopOAuthCodeInputSchema,
  DesktopOAuthLoginInputSchema,
} from '@/modules/cloud-account/services/desktop-oauth-login.schema';
import { toDesktopOAuthLoginORPCError } from '@/modules/cloud-account/services/desktop-oauth-login.error';
import { CloudAccountSwitchInputSchema } from '@/modules/cloud-account/services/cloud-account-switch.schema';
import { toCloudAccountSwitchORPCError } from '@/modules/cloud-account/services/cloud-account-switch.error';
import {
  CloudIdentityProfileAccountInputSchema,
  CloudIdentityProfileBindInputSchema,
  CloudIdentityProfilePayloadInputSchema,
  CloudIdentityProfileRevisionInputSchema,
  CloudIdentityProfileSchema,
  CloudIdentityProfilesSnapshotSchema,
} from '@/modules/cloud-account/services/cloud-account-identity-profile.schema';
import { toCloudIdentityProfileORPCError } from '@/modules/cloud-account/services/cloud-account-identity-profile.error';
import { localAccountImportRouter } from '@/modules/cloud-account/local-import/ipc/router';
export {
  type LocalAccountImportORPCErrorData,
  parseLocalAccountImportORPCErrorData,
} from '@/modules/cloud-account/local-import/ipc/error-data';
export {
  type CloudAccountSwitchORPCErrorData,
  parseCloudAccountSwitchORPCErrorData,
} from '@/modules/cloud-account/services/cloud-account-switch.schema';

export const cloudRouter = os.router({
  localImport: localAccountImportRouter,

  listCloudAccounts: os.output(z.array(CloudAccountViewSchema)).handler(async () => {
    return getCloudAccountAdapter().listViews();
  }),

  getSecurityStatus: os.output(CloudAccountSecurityStatusSchema).handler(async () => {
    return getCloudAccountAdapter().getSecurityStatus();
  }),

  deleteCloudAccount: os
    .input(DeleteCloudAccountInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      await getCloudAccountAdapter().delete(input.accountId);
    }),

  togglePauseCloudAccount: os
    .input(z.object({ accountId: z.string(), paused: z.boolean() }))
    .output(CloudAccountSchema)
    .handler(async ({ input }) => {
      return togglePauseCloudAccount(input.accountId, input.paused);
    }),

  batchSetCloudAccountsPaused: os
    .input(z.object({ accountIds: z.array(z.string()), paused: z.boolean() }))
    .output(z.array(CloudAccountSchema))
    .handler(async ({ input }) => {
      return batchSetCloudAccountsPaused(input.accountIds, input.paused);
    }),

  openAccountValidationLink: os
    .input(z.strictObject({ accountId: CloudAccountIdSchema }))
    .output(z.void())
    .handler(async ({ input }) => {
      try {
        await getCloudAccountAdapter().openValidationLink(input.accountId);
      } catch (error) {
        throw toAccountValidationLinkORPCError(error);
      }
    }),

  refreshAccountQuota: os
    .input(z.strictObject({ accountId: CloudAccountIdSchema }))
    .output(CloudAccountViewSchema)
    .handler(async ({ input }) => {
      return getCloudAccountAdapter().refreshQuota(input.accountId);
    }),

  switchCloudAccount: os
    .input(CloudAccountSwitchInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      try {
        await getCloudAccountAdapter().switchAccount(input.accountId, input.appTarget);
      } catch (error) {
        throw toCloudAccountSwitchORPCError(error);
      }
    }),

  markActiveAccount: os
    .input(z.object({ accountId: z.string(), appTarget: AntigravityAppTargetSchema.optional() }))
    .output(CloudAccountSchema)
    .handler(async ({ input }) => {
      return markActiveAccount(input.accountId, input.appTarget);
    }),

  detectActiveAccounts: os
    .output(
      z.object({
        classic: z.object({ accountId: z.string(), email: z.string() }).nullable(),
        ide: z.object({ accountId: z.string(), email: z.string() }).nullable(),
        agy: z.object({ accountId: z.string(), email: z.string() }).nullable(),
      }),
    )
    .handler(async () => {
      return detectActiveAccounts();
    }),

  getAutoSwitchEnabled: os
    .input(z.object({ appTarget: AntigravityAppTargetSchema.optional() }).optional())
    .output(z.boolean())
    .handler(async ({ input }) => {
      return getAutoSwitchEnabled(input?.appTarget);
    }),

  setAutoSwitchEnabled: os
    .input(z.object({ enabled: z.boolean(), appTarget: AntigravityAppTargetSchema.optional() }))
    .output(z.void())
    .handler(async ({ input }) => {
      await setAutoSwitchEnabled(input.enabled, input.appTarget);
    }),

  getAutoSwitchTargetsConfig: os
    .output(
      z.object({
        classic: z.boolean(),
        ide: z.boolean(),
        agy: z.boolean(),
        global: z.boolean(),
        noRestart: z.boolean(),
      }),
    )
    .handler(async () => {
      return getAutoSwitchTargetsConfig();
    }),

  setAutoSwitchNoRestartEnabled: os
    .input(z.object({ enabled: z.boolean() }))
    .output(z.void())
    .handler(async ({ input }) => {
      setAutoSwitchNoRestartEnabled(input.enabled);
    }),

  getAutoSwitchModelsConfig: os.output(CloudMonitorModelsSchema).handler(async () => {
    try {
      return await getCloudAccountAdapter().getAutoSwitchModelsConfig();
    } catch {
      throw toCloudMonitorORPCError();
    }
  }),

  setAutoSwitchModelsConfig: os
    .input(CloudMonitorModelsInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().setAutoSwitchModelsConfig(input);
      } catch {
        throw toCloudMonitorORPCError();
      }
    }),

  getWeeklyWarmupConfig: os.output(CloudMonitorWarmupSchema).handler(async () => {
    try {
      return await getCloudAccountAdapter().getWeeklyWarmupConfig();
    } catch {
      throw toCloudMonitorORPCError();
    }
  }),

  setWeeklyWarmupConfig: os
    .input(CloudMonitorWarmupSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().setWeeklyWarmupConfig(input);
      } catch {
        throw toCloudMonitorORPCError();
      }
    }),

  forcePollCloudMonitor: os.output(z.void()).handler(async () => {
    try {
      return await getCloudAccountAdapter().forcePoll();
    } catch {
      throw toCloudMonitorORPCError();
    }
  }),
  startAuthFlow: os
    .input(DesktopOAuthLoginInputSchema.optional())
    .output(CloudAccountViewSchema)
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().startLogin(input?.oauthClientKey);
      } catch (error) {
        throw toDesktopOAuthLoginORPCError(error);
      }
    }),

  submitAuthCode: os
    .input(DesktopOAuthCodeInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      try {
        await getCloudAccountAdapter().submitLoginCode(input.code);
      } catch (error) {
        throw toDesktopOAuthLoginORPCError(error);
      }
    }),

  listOAuthClients: os.output(z.array(OAuthClientDescriptorSchema)).handler(async () => {
    return getCloudAccountAdapter().listOAuthClients();
  }),

  getActiveOAuthClient: os.output(ActiveOAuthClientSchema).handler(async () => {
    return {
      client_key: await getCloudAccountAdapter().getActiveOAuthClient(),
    };
  }),

  setActiveOAuthClient: os
    .input(SetActiveOAuthClientInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      await getCloudAccountAdapter().setActiveOAuthClient(input.clientKey);
    }),

  setAccountProxy: os
    .input(SetCloudAccountProxyInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      await getCloudAccountAdapter().setProxy(input.accountId, input.proxyUrl);
    }),

  syncLocalAccount: os
    .input(SyncFromIdeInputSchema.optional())
    .output(CloudAccountViewSchema.nullable())
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().syncFromIde(input?.appTarget);
      } catch (error) {
        throw toSyncLocalAccountORPCError(error);
      }
    }),

  getSwitchStatus: os.output(CloudAccountSwitchStatusSchema).handler(async () => {
    try {
      return await getCloudAccountAdapter().getSwitchStatus();
    } catch {
      throw toCloudAccountSwitchStatusError();
    }
  }),

  getIdentityProfiles: os
    .input(CloudIdentityProfileAccountInputSchema)
    .output(CloudIdentityProfilesSnapshotSchema)
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().getIdentityProfiles(input.accountId);
      } catch (error) {
        throw toCloudIdentityProfileORPCError(error);
      }
    }),

  previewIdentityProfile: os.output(CloudIdentityProfileSchema).handler(async () => {
    try {
      return await getCloudAccountAdapter().previewIdentityProfile();
    } catch (error) {
      throw toCloudIdentityProfileORPCError(error);
    }
  }),

  bindIdentityProfile: os
    .input(CloudIdentityProfileBindInputSchema)
    .output(CloudIdentityProfileSchema)
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().bindIdentityProfile(input.accountId, input.mode);
      } catch (error) {
        throw toCloudIdentityProfileORPCError(error);
      }
    }),

  bindIdentityProfileWithPayload: os
    .input(CloudIdentityProfilePayloadInputSchema)
    .output(CloudIdentityProfileSchema)
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().bindIdentityProfileWithPayload(
          input.accountId,
          input.profile,
        );
      } catch (error) {
        throw toCloudIdentityProfileORPCError(error);
      }
    }),

  restoreIdentityProfileRevision: os
    .input(CloudIdentityProfileRevisionInputSchema)
    .output(CloudIdentityProfileSchema)
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().restoreIdentityProfileRevision(
          input.accountId,
          input.versionId,
        );
      } catch (error) {
        throw toCloudIdentityProfileORPCError(error);
      }
    }),

  restoreBaselineProfile: os
    .input(CloudIdentityProfileAccountInputSchema)
    .output(CloudIdentityProfileSchema)
    .handler(async ({ input }) => {
      try {
        return await getCloudAccountAdapter().restoreBaselineProfile(input.accountId);
      } catch (error) {
        throw toCloudIdentityProfileORPCError(error);
      }
    }),

  deleteIdentityProfileRevision: os
    .input(CloudIdentityProfileRevisionInputSchema)
    .output(z.void())
    .handler(async ({ input }) => {
      try {
        await getCloudAccountAdapter().deleteIdentityProfileRevision(
          input.accountId,
          input.versionId,
        );
      } catch (error) {
        throw toCloudIdentityProfileORPCError(error);
      }
    }),

  openIdentityStorageFolder: os.output(z.void()).handler(async () => {
    try {
      await openCloudIdentityStorageFolder();
    } catch (error) {
      throw toCloudIdentityProfileORPCError(error);
    }
  }),

  exportCloudAccounts: os
    .input(CloudAccountExportInputSchema)
    .output(CloudAccountExportResultSchema)
    .handler(({ input }) => chooseAndExportCloudAccountFile(input.stripTokens)),
  importCloudAccounts: os
    .input(CloudAccountImportInputSchema)
    .output(CloudAccountImportResultSchema)
    .handler(({ input }) => chooseAndImportCloudAccountFile(input.strategy)),

  getMetricsPollInterval: os.output(z.number()).handler(async () => {
    return getMetricsPollInterval();
  }),

  setMetricsPollInterval: os
    .input(z.object({ intervalMinutes: z.number().min(0).max(1440) }))
    .output(z.number())
    .handler(async ({ input }) => {
      return setMetricsPollInterval(input.intervalMinutes);
    }),

  getMetricsSyncDelayConfig: os
    .output(
      z.object({
        minDelaySeconds: z.number(),
        maxDelaySeconds: z.number(),
      }),
    )
    .handler(async () => {
      return getMetricsSyncDelayConfig();
    }),

  setMetricsSyncDelayConfig: os
    .input(
      z.object({
        minDelaySeconds: z.number().min(0).max(3600),
        maxDelaySeconds: z.number().min(0).max(3600),
      }),
    )
    .output(
      z.object({
        minDelaySeconds: z.number(),
        maxDelaySeconds: z.number(),
      }),
    )
    .handler(async ({ input }) => {
      return setMetricsSyncDelayConfig(input);
    }),

  getSyncingAccountId: os.output(z.string().nullable()).handler(async () => {
    return getSyncingAccountId();
  }),

  getEmulationState: os.output(EmulationStateSchema).handler(async () => {
    return getEmulationState();
  }),

  setEmulationEnabled: os
    .input(z.object({ enabled: z.boolean() }))
    .output(EmulationStateSchema)
    .handler(async ({ input }) => {
      return setEmulationEnabled(input.enabled);
    }),

  setEmulationTickInterval: os
    .input(z.object({ seconds: z.number().min(5).max(3600) }))
    .output(EmulationStateSchema)
    .handler(async ({ input }) => {
      return setEmulationTickInterval(input.seconds);
    }),

  generateEmulatedAccounts: os
    .input(
      z.object({
        count: z.number().min(1).max(200),
        preset: z
          .enum([
            'drain_demo',
            'auto_switch_test_bench',
            'bursty_workload',
            'rate_limited_test',
            'balanced_pool',
            'random_modern_mix',
          ])
          .optional(),
        randomizeQuota: z.boolean().optional(),
        randomizeModels: z.boolean().optional(),
        minModelsPerAccount: z.number().min(1).max(20).optional(),
        maxModelsPerAccount: z.number().min(1).max(20).optional(),
      }),
    )
    .output(z.array(z.any()))
    .handler(async ({ input }) => {
      return generateEmulatedAccounts(input.count, input.preset, {
        randomizeQuota: input.randomizeQuota,
        randomizeModels: input.randomizeModels,
        minModelsPerAccount: input.minModelsPerAccount,
        maxModelsPerAccount: input.maxModelsPerAccount,
      });
    }),

  updateEmulatedAccountStrategy: os
    .input(
      z.object({
        accountId: z.string(),
        strategy: AccountEmulationStrategyConfigSchema,
      }),
    )
    .output(z.any().nullable())
    .handler(async ({ input }) => {
      return updateEmulatedAccountStrategy(input.accountId, input.strategy);
    }),

  resetEmulatedQuotas: os.output(EmulationStateSchema).handler(async () => {
    return resetEmulatedQuotas();
  }),

  clearEmulatedAccounts: os.output(EmulationStateSchema).handler(async () => {
    return clearEmulatedAccounts();
  }),

  getFamilyGroups: os.output(z.array(AccountFamilyGroupSchema)).handler(async () => {
    return getFamilyGroups();
  }),

  saveFamilyGroup: os
    .input(AccountFamilyGroupSchema)
    .output(AccountFamilyGroupSchema)
    .handler(async ({ input }) => {
      return saveFamilyGroup(input);
    }),

  deleteFamilyGroup: os
    .input(z.object({ groupId: z.string() }))
    .output(z.void())
    .handler(async ({ input }) => {
      deleteFamilyGroup(input.groupId);
    }),

  linkAccountsToFamily: os
    .input(
      z.object({
        accountIds: z.array(z.string()),
        groupName: z.string().optional(),
        groupId: z.string().optional(),
        primaryAccountId: z.string().optional(),
      }),
    )
    .output(AccountFamilyGroupSchema)
    .handler(async ({ input }) => {
      return linkAccountsToFamily(
        input.accountIds,
        input.groupName,
        input.groupId,
        input.primaryAccountId,
      );
    }),

  unlinkAccountFromFamily: os
    .input(z.object({ accountId: z.string() }))
    .output(z.void())
    .handler(async ({ input }) => {
      unlinkAccountFromFamily(input.accountId);
    }),
});
