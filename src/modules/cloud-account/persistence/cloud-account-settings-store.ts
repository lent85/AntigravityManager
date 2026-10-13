import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  type AntigravityAppTarget,
  AntigravityAppTargetSchema,
  resolveAntigravityAppTarget,
} from '@/shared/platform/antigravityAppTarget';
import { logger } from '@/shared/logging/logger';
import { accounts, settings } from '@/shared/persistence/database/schema';
import { getCloudDb, type DrizzleExecutor } from './cloud-account-db';
import type { CloudAccountAlertPolicyUpdate } from '../services/cloud-account-alert-policy.schema';

const ACTIVE_ACCOUNT_SETTING_PREFIX = 'active_cloud_account';
const StringSettingSchema = z.string();
const BooleanSettingSchema = z.boolean();

export class CloudAccountSettingsStore {
  /** Run inside the account mutation transaction so a failed cleanup cannot leave partial state. */
  static removeMissingActiveAccountReferences(transaction: DrizzleExecutor): void {
    for (const target of AntigravityAppTargetSchema.options) {
      const key = `${ACTIVE_ACCOUNT_SETTING_PREFIX}.${target}`;
      const row = transaction.select().from(settings).where(eq(settings.key, key)).get();
      if (!row) {
        continue;
      }
      let value: unknown;
      try {
        value = JSON.parse(row.value);
      } catch {
        // Corrupt settings keep their existing read-time diagnostics and default behavior.
        continue;
      }
      const parsed = StringSettingSchema.safeParse(value);
      if (!parsed.success || !parsed.data.trim()) {
        continue;
      }
      const account = transaction
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, parsed.data.trim()))
        .get();
      if (!account) {
        transaction.delete(settings).where(eq(settings.key, key)).run();
      }
    }
  }

  /** One SQLite transaction; no JSON configuration writes participate in this policy update. */
  static setAlertPolicy(input: CloudAccountAlertPolicyUpdate): void {
    const entries = Object.entries(input).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return;
    }
    const { raw, orm } = getCloudDb();
    try {
      orm.transaction((transaction) => {
        for (const [key, value] of entries) {
          const encoded = JSON.stringify(value);
          transaction
            .insert(settings)
            .values({ key, value: encoded })
            .onConflictDoUpdate({ target: settings.key, set: { value: encoded } })
            .run();
        }
      });
    } finally {
      raw.close();
    }
  }
  /** Missing settings use the default; corrupt or unavailable storage must remain an error. */
  static readSetting(key: string): unknown {
    const { raw, orm } = getCloudDb();
    try {
      const row = orm
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key))
        .get();
      if (!row) {
        return undefined;
      }
      const rawSetting: unknown = JSON.parse(row.value);
      return rawSetting;
    } finally {
      raw.close();
    }
  }

  static getSetting<T>(key: string, defaultValue: T, schema: z.ZodType<T>): T {
    const { raw, orm } = getCloudDb();
    try {
      const row = orm
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key))
        .get();
      if (!row) {
        return defaultValue;
      }
      const rawSetting: unknown = JSON.parse(row.value);
      const parsed = schema.safeParse(rawSetting);
      if (!parsed.success) {
        logger.warn(`Ignored invalid setting ${key}; using default value`, parsed.error);
        return defaultValue;
      }
      return parsed.data;
    } catch (error) {
      logger.error(`Failed to get setting ${key}`, error);
      return defaultValue;
    } finally {
      raw.close();
    }
  }

  static setSetting(key: string, value: unknown): void {
    const { raw, orm } = getCloudDb();
    try {
      const stringValue = JSON.stringify(value);
      orm
        .insert(settings)
        .values({ key, value: stringValue })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: stringValue },
        })
        .run();
    } finally {
      raw.close();
    }
  }

  static setActiveForTarget(target: AntigravityAppTarget | undefined, id: string): void {
    const normalizedTarget = resolveAntigravityAppTarget(target);
    this.setSetting(`${ACTIVE_ACCOUNT_SETTING_PREFIX}.${normalizedTarget}`, id);
  }

  static getActiveAccountIdForTarget(target: AntigravityAppTarget | undefined): string {
    const normalizedTarget = resolveAntigravityAppTarget(target);
    const key = `${ACTIVE_ACCOUNT_SETTING_PREFIX}.${normalizedTarget}`;
    const value = this.getSetting(key, '', StringSettingSchema);

    if (typeof value !== 'string') {
      logger.warn(`Ignored invalid active account setting ${key}: expected a string`);
      return '';
    }

    return value.trim();
  }

  static getAutoSwitchEnabledForTarget(target?: AntigravityAppTarget | null): boolean {
    if (!target) {
      return this.getSetting<boolean>('auto_switch_enabled', false, BooleanSettingSchema);
    }
    const normalizedTarget = resolveAntigravityAppTarget(target);
    const targetKey = `auto_switch_enabled.${normalizedTarget}`;
    const targetSetting = this.readSetting(targetKey);
    if (typeof targetSetting === 'boolean') {
      return targetSetting;
    }
    return this.getSetting<boolean>('auto_switch_enabled', false, BooleanSettingSchema);
  }

  static setAutoSwitchEnabledForTarget(
    target: AntigravityAppTarget | undefined | null,
    enabled: boolean,
  ): void {
    if (!target) {
      this.setSetting('auto_switch_enabled', enabled);
      for (const t of ['classic', 'ide', 'agy'] as const) {
        this.setSetting(`auto_switch_enabled.${t}`, enabled);
      }
      return;
    }
    const normalizedTarget = resolveAntigravityAppTarget(target);
    this.setSetting(`auto_switch_enabled.${normalizedTarget}`, enabled);
  }

  static isNoRestartEnabled(): boolean {
    return this.getSetting<boolean>('auto_switch_no_restart', false, BooleanSettingSchema);
  }

  static setNoRestartEnabled(enabled: boolean): void {
    this.setSetting('auto_switch_no_restart', enabled);
  }

  static getMetricsDelayMinSeconds(): number {
    return this.getSetting<number>('metrics_delay_min_seconds', 30, z.number());
  }

  static setMetricsDelayMinSeconds(seconds: number): void {
    this.setSetting('metrics_delay_min_seconds', Math.max(0, seconds));
  }

  static getMetricsDelayMaxSeconds(): number {
    return this.getSetting<number>('metrics_delay_max_seconds', 45, z.number());
  }

  static setMetricsDelayMaxSeconds(seconds: number): void {
    this.setSetting('metrics_delay_max_seconds', Math.max(0, seconds));
  }
}
