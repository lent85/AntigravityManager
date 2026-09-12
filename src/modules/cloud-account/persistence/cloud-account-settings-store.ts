import { eq } from 'drizzle-orm';
import {
  type AntigravityAppTarget,
  resolveAntigravityAppTarget,
} from '@/shared/platform/antigravityAppTarget';
import { logger } from '@/shared/logging/logger';
import { settings } from '@/shared/persistence/database/schema';
import { getCloudDb } from './cloud-account-db';

const ACTIVE_ACCOUNT_SETTING_PREFIX = 'active_cloud_account';

export class CloudAccountSettingsStore {
  /** Missing settings use the default; corrupt or unavailable storage must remain an error. */
  static readSetting(key: string): unknown {
    const { raw, orm } = getCloudDb();
    try {
      const row = orm
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key))
        .get();
      return row ? JSON.parse(row.value) : undefined;
    } finally {
      raw.close();
    }
  }

  static getSetting<T>(key: string, defaultValue: T): T {
    const { raw, orm } = getCloudDb();
    try {
      const rows = orm
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, key))
        .all();
      const row = rows[0];
      if (!row) {
        return defaultValue;
      }
      return JSON.parse(row.value) as T;
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
    const value = this.getSetting<unknown>(key, '');

    if (typeof value !== 'string') {
      logger.warn(`Ignored invalid active account setting ${key}: expected a string`);
      return '';
    }

    return value.trim();
  }

  static getAutoSwitchEnabledForTarget(target?: AntigravityAppTarget | null): boolean {
    if (!target) {
      return this.getSetting<boolean>('auto_switch_enabled', false);
    }
    const normalizedTarget = resolveAntigravityAppTarget(target);
    const targetKey = `auto_switch_enabled.${normalizedTarget}`;
    const targetSetting = this.readSetting(targetKey);
    if (typeof targetSetting === 'boolean') {
      return targetSetting;
    }
    return this.getSetting<boolean>('auto_switch_enabled', false);
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
    return this.getSetting<boolean>('auto_switch_no_restart', false);
  }

  static setNoRestartEnabled(enabled: boolean): void {
    this.setSetting('auto_switch_no_restart', enabled);
  }
}
