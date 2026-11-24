import fs from 'fs';
import path from 'path';
import { logger } from '@/shared/logging/logger';
import { isDurableStoreTestEnvironment } from '@/shared/persistence/durable-store-settings';
import { getProxyStateDir } from '@/shared/platform/paths';
import type {
  GetUsageLogsOptions,
  GetUsageStatsOptions,
  ProxyUsageAccountBreakdown,
  ProxyUsageClientBreakdown,
  ProxyUsageLogsResult,
  ProxyUsageModelBreakdown,
  ProxyUsageProtocolBreakdown,
  ProxyUsageRecord,
  ProxyUsageStatsResult,
  ProxyUsageStatusBreakdown,
  ProxyUsageSummary,
  ProxyUsageTimelineBucket,
  RecordUsageInput,
  UsageTimeRange,
} from './proxy-usage.types';

export interface IProxyUsageStore {
  record(input: RecordUsageInput): void;
  getStats(options?: GetUsageStatsOptions): Promise<ProxyUsageStatsResult>;
  getLogs(options?: GetUsageLogsOptions): Promise<ProxyUsageLogsResult>;
  clear(): void;
  touchKeyLastUsed(keyId: string): void;
  getKeyLastUsed(keyId: string): number | null;
}

function resolveStartTime(range: UsageTimeRange = '24h'): number {
  const now = Date.now();
  switch (range) {
    case 'today': {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today.getTime();
    }
    case '24h':
      return now - 24 * 3600 * 1000;
    case '7d':
      return now - 7 * 86400 * 1000;
    case '30d':
      return now - 30 * 86400 * 1000;
    case 'all':
    default:
      return 0;
  }
}

/** In-memory fallback used during test execution or when SQLite is unavailable. */
class InMemoryProxyUsageStore implements IProxyUsageStore {
  private records: ProxyUsageRecord[] = [];
  private nextId = 1;
  private lastUsedMap = new Map<string, number>();

  public record(input: RecordUsageInput): void {
    const timestamp = input.timestamp ?? Date.now();
    const totalTokens =
      input.totalTokens ?? (input.promptTokens ?? 0) + (input.completionTokens ?? 0);

    const record: ProxyUsageRecord = {
      id: this.nextId++,
      timestamp,
      keyId: input.keyId ?? null,
      keyName: input.keyName ?? null,
      accountId: input.accountId ?? null,
      accountEmail: input.accountEmail ?? null,
      protocol: input.protocol,
      endpoint: input.endpoint,
      model: input.model ?? null,
      statusCode: input.statusCode,
      durationMs: input.durationMs,
      promptTokens: input.promptTokens ?? 0,
      completionTokens: input.completionTokens ?? 0,
      totalTokens,
      cachedTokens: input.cachedTokens ?? 0,
      cost: Number((input.cost ?? 0).toFixed(6)),
      errorMessage: input.errorMessage ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    };

    this.records.push(record);

    if (input.keyId) {
      this.lastUsedMap.set(input.keyId, timestamp);
    }

    // Keep bounded in memory
    if (this.records.length > 5000) {
      this.records.splice(0, this.records.length - 5000);
    }
  }

  public touchKeyLastUsed(keyId: string): void {
    this.lastUsedMap.set(keyId, Date.now());
  }

  public getKeyLastUsed(keyId: string): number | null {
    return this.lastUsedMap.get(keyId) ?? null;
  }

  public async getStats(options: GetUsageStatsOptions = {}): Promise<ProxyUsageStatsResult> {
    const startTime = resolveStartTime(options.timeRange);
    const filtered = this.records.filter((r) => {
      if (r.timestamp < startTime) {
        return false;
      }
      if (options.keyId && r.keyId !== options.keyId) {
        return false;
      }
      if (options.accountId && r.accountId !== options.accountId) {
        return false;
      }
      return true;
    });

    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;
    let cachedTokens = 0;
    let estimatedCost = 0;
    let successRequests = 0;
    let failedRequests = 0;
    let totalDurationMs = 0;
    const activeClientsSet = new Set<string>();
    const activeAccountsSet = new Set<string>();

    const clientMap = new Map<string, ProxyUsageClientBreakdown>();
    const accountMap = new Map<string, ProxyUsageAccountBreakdown>();
    const modelMap = new Map<
      string,
      { requests: number; tokens: number; cost: number; errors: number; totalDuration: number }
    >();
    const protocolMap = new Map<string, { requests: number; tokens: number }>();
    const statusMap = new Map<string, number>();
    const timelineMap = new Map<string, ProxyUsageTimelineBucket>();

    for (const r of filtered) {
      promptTokens += r.promptTokens;
      completionTokens += r.completionTokens;
      totalTokens += r.totalTokens;
      cachedTokens += r.cachedTokens;
      estimatedCost += r.cost;
      totalDurationMs += r.durationMs;

      const isError = r.statusCode >= 400;
      if (isError) {
        failedRequests++;
      } else {
        successRequests++;
      }

      if (r.keyId) {
        activeClientsSet.add(r.keyId);
      }
      if (r.accountId) {
        activeAccountsSet.add(r.accountId);
      }

      // Client breakdown
      const clientKey = r.keyId || 'unassigned';
      const clientEntry = clientMap.get(clientKey) ?? {
        keyId: clientKey,
        keyName: r.keyName || 'Unassigned',
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        lastActive: null,
      };
      clientEntry.requests++;
      clientEntry.tokens += r.totalTokens;
      clientEntry.cost += r.cost;
      if (isError) {
        clientEntry.errors++;
      }
      clientEntry.lastActive = Math.max(clientEntry.lastActive ?? 0, r.timestamp);
      clientMap.set(clientKey, clientEntry);

      // Account breakdown
      if (r.accountId) {
        const accEntry = accountMap.get(r.accountId) ?? {
          accountId: r.accountId,
          accountEmail: r.accountEmail || r.accountId,
          requests: 0,
          tokens: 0,
          cost: 0,
          errors: 0,
          lastActive: null,
        };
        accEntry.requests++;
        accEntry.tokens += r.totalTokens;
        accEntry.cost += r.cost;
        if (isError) {
          accEntry.errors++;
        }
        accEntry.lastActive = Math.max(accEntry.lastActive ?? 0, r.timestamp);
        accountMap.set(r.accountId, accEntry);
      }

      // Model breakdown
      const modelName = r.model || 'unknown';
      const modelEntry = modelMap.get(modelName) ?? {
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
        totalDuration: 0,
      };
      modelEntry.requests++;
      modelEntry.tokens += r.totalTokens;
      modelEntry.cost += r.cost;
      modelEntry.totalDuration += r.durationMs;
      if (isError) {
        modelEntry.errors++;
      }
      modelMap.set(modelName, modelEntry);

      // Protocol breakdown
      const protoEntry = protocolMap.get(r.protocol) ?? { requests: 0, tokens: 0 };
      protoEntry.requests++;
      protoEntry.tokens += r.totalTokens;
      protocolMap.set(r.protocol, protoEntry);

      // Status breakdown
      const statusGroup =
        r.statusCode >= 200 && r.statusCode < 300
          ? '2xx'
          : r.statusCode >= 400 && r.statusCode < 500
            ? '4xx'
            : r.statusCode >= 500
              ? '5xx'
              : 'other';
      statusMap.set(statusGroup, (statusMap.get(statusGroup) ?? 0) + 1);

      // Timeline bucket
      const bucketDate = new Date(r.timestamp);
      const isHourly = (options.timeRange ?? '24h') === '24h' || options.timeRange === 'today';
      const timeKey = isHourly
        ? `${String(bucketDate.getHours()).padStart(2, '0')}:00`
        : `${bucketDate.getMonth() + 1}/${bucketDate.getDate()}`;

      const timelineBucket = timelineMap.get(timeKey) ?? {
        time: timeKey,
        timestamp: r.timestamp,
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
      };
      timelineBucket.requests++;
      timelineBucket.tokens += r.totalTokens;
      timelineBucket.cost += r.cost;
      if (isError) {
        timelineBucket.errors++;
      }
      timelineMap.set(timeKey, timelineBucket);
    }

    const totalRequests = filtered.length;
    const avgDurationMs = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0;

    const summary: ProxyUsageSummary = {
      totalRequests,
      successRequests,
      failedRequests,
      totalTokens,
      promptTokens,
      completionTokens,
      cachedTokens,
      estimatedCost: Number(estimatedCost.toFixed(6)),
      avgDurationMs,
      activeClientsCount: activeClientsSet.size,
      activeAccountsCount: activeAccountsSet.size,
    };

    const clientBreakdown: ProxyUsageClientBreakdown[] = Array.from(clientMap.values()).sort(
      (a, b) => b.requests - a.requests,
    );

    const accountBreakdown: ProxyUsageAccountBreakdown[] = Array.from(accountMap.values()).sort(
      (a, b) => b.requests - a.requests,
    );

    const modelBreakdown: ProxyUsageModelBreakdown[] = Array.from(modelMap.entries())
      .map(([model, data]) => ({
        model,
        requests: data.requests,
        tokens: data.tokens,
        cost: Number(data.cost.toFixed(6)),
        errors: data.errors,
        avgDurationMs: data.requests > 0 ? Math.round(data.totalDuration / data.requests) : 0,
      }))
      .sort((a, b) => b.requests - a.requests);

    const protocolBreakdown: ProxyUsageProtocolBreakdown[] = Array.from(protocolMap.entries()).map(
      ([protocol, data]) => ({
        protocol,
        requests: data.requests,
        tokens: data.tokens,
      }),
    );

    const statusBreakdown: ProxyUsageStatusBreakdown[] = Array.from(statusMap.entries()).map(
      ([statusRange, count]) => ({
        statusRange,
        count,
      }),
    );

    const timeline: ProxyUsageTimelineBucket[] = Array.from(timelineMap.values()).sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    return {
      summary,
      timeline,
      clientBreakdown,
      accountBreakdown,
      modelBreakdown,
      protocolBreakdown,
      statusBreakdown,
    };
  }

  public async getLogs(options: GetUsageLogsOptions = {}): Promise<ProxyUsageLogsResult> {
    const startTime = resolveStartTime(options.timeRange);
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const filtered = this.records
      .filter((r) => {
        if (r.timestamp < startTime) {
          return false;
        }
        if (options.keyId && r.keyId !== options.keyId) {
          return false;
        }
        if (options.accountId && r.accountId !== options.accountId) {
          return false;
        }
        if (options.model && r.model !== options.model) {
          return false;
        }
        if (options.status === 'success') {
          if (r.statusCode < 200 || r.statusCode >= 300) {
            return false;
          }
        } else if (options.status === 'error') {
          if (r.statusCode < 400) {
            return false;
          }
        } else if (options.status === 'auth') {
          if (r.statusCode !== 401 && r.statusCode !== 403) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    const total = filtered.length;
    const logs = filtered.slice(offset, offset + limit);

    return { total, logs };
  }

  public clear(): void {
    this.records = [];
    this.lastUsedMap.clear();
  }
}

/** Persistent SQLite proxy usage storage. */
class SqliteProxyUsageStore implements IProxyUsageStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any = null;
  private isInitialized = false;
  private inMemoryFallback = new InMemoryProxyUsageStore();

  private ensureInitialized(): boolean {
    if (this.isInitialized) {
      return this.db !== null;
    }
    this.isInitialized = true;

    if (isDurableStoreTestEnvironment()) {
      return false;
    }

    try {
      // Dynamic import / require of better-sqlite3 to remain resilient
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const BetterSqlite3 = require('better-sqlite3');
      if (typeof BetterSqlite3 !== 'function') {
        return false;
      }

      const stateDir = getProxyStateDir();
      if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
      }

      const dbPath = path.join(stateDir, 'proxy_usage.db');
      const db = new BetterSqlite3(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 3000');

      db.exec(`
        CREATE TABLE IF NOT EXISTS proxy_usage_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          key_id TEXT,
          key_name TEXT,
          account_id TEXT,
          account_email TEXT,
          protocol TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          model TEXT,
          status_code INTEGER NOT NULL,
          duration_ms INTEGER NOT NULL,
          prompt_tokens INTEGER DEFAULT 0,
          completion_tokens INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          cached_tokens INTEGER DEFAULT 0,
          cost REAL DEFAULT 0,
          error_message TEXT,
          ip TEXT,
          user_agent TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON proxy_usage_records(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_key_id ON proxy_usage_records(key_id);
        CREATE INDEX IF NOT EXISTS idx_usage_account_id ON proxy_usage_records(account_id);
        CREATE INDEX IF NOT EXISTS idx_usage_model ON proxy_usage_records(model);
      `);

      // Column migration checks for existing SQLite databases
      try {
        const columns = db.pragma('table_info(proxy_usage_records)') as { name: string }[];
        const colNames = new Set(columns.map((c) => c.name));
        if (!colNames.has('account_id')) {
          db.exec('ALTER TABLE proxy_usage_records ADD COLUMN account_id TEXT');
        }
        if (!colNames.has('account_email')) {
          db.exec('ALTER TABLE proxy_usage_records ADD COLUMN account_email TEXT');
        }
      } catch (colErr) {
        logger.debug('Column migration check error:', colErr);
      }

      // Auto-prune records older than 30 days
      const pruneCutoff = Date.now() - 30 * 86400 * 1000;
      db.prepare('DELETE FROM proxy_usage_records WHERE timestamp < ?').run(pruneCutoff);

      this.db = db;
      return true;
    } catch (e) {
      logger.warn('Failed to initialize SQLite usage database, falling back to in-memory store', e);
      this.db = null;
      return false;
    }
  }

  public record(input: RecordUsageInput): void {
    const hasSqlite = this.ensureInitialized();
    if (!hasSqlite || !this.db) {
      this.inMemoryFallback.record(input);
      return;
    }

    try {
      const timestamp = input.timestamp ?? Date.now();
      const totalTokens =
        input.totalTokens ?? (input.promptTokens ?? 0) + (input.completionTokens ?? 0);

      const stmt = this.db.prepare(`
        INSERT INTO proxy_usage_records (
          timestamp, key_id, key_name, account_id, account_email, protocol, endpoint, model,
          status_code, duration_ms, prompt_tokens, completion_tokens,
          total_tokens, cached_tokens, cost, error_message, ip, user_agent
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        timestamp,
        input.keyId ?? null,
        input.keyName ?? null,
        input.accountId ?? null,
        input.accountEmail ?? null,
        input.protocol,
        input.endpoint,
        input.model ?? null,
        input.statusCode,
        input.durationMs,
        input.promptTokens ?? 0,
        input.completionTokens ?? 0,
        totalTokens,
        input.cachedTokens ?? 0,
        Number((input.cost ?? 0).toFixed(6)),
        input.errorMessage ?? null,
        input.ip ?? null,
        input.userAgent ?? null,
      );

      if (input.keyId) {
        this.inMemoryFallback.touchKeyLastUsed(input.keyId);
      }
    } catch (err) {
      logger.error('Failed to record proxy usage to SQLite, recording to in-memory fallback', err);
      this.inMemoryFallback.record(input);
    }
  }

  public touchKeyLastUsed(keyId: string): void {
    this.inMemoryFallback.touchKeyLastUsed(keyId);
  }

  public getKeyLastUsed(keyId: string): number | null {
    if (!this.ensureInitialized() || !this.db) {
      return this.inMemoryFallback.getKeyLastUsed(keyId);
    }

    try {
      const row = this.db
        .prepare(
          'SELECT MAX(timestamp) as last_used FROM proxy_usage_records WHERE key_id = ? LIMIT 1',
        )
        .get(keyId);
      return row?.last_used ?? this.inMemoryFallback.getKeyLastUsed(keyId);
    } catch {
      return this.inMemoryFallback.getKeyLastUsed(keyId);
    }
  }

  public async getStats(options: GetUsageStatsOptions = {}): Promise<ProxyUsageStatsResult> {
    if (!this.ensureInitialized() || !this.db) {
      return this.inMemoryFallback.getStats(options);
    }

    try {
      const startTime = resolveStartTime(options.timeRange);
      const params: unknown[] = [startTime];
      let keyFilter = '';
      let accountFilter = '';

      if (options.keyId) {
        keyFilter = 'AND key_id = ?';
        params.push(options.keyId);
      }
      if (options.accountId) {
        accountFilter = 'AND account_id = ?';
        params.push(options.accountId);
      }

      // Summary
      const summaryRow = this.db
        .prepare(
          `SELECT
            COUNT(*) as total_requests,
            SUM(CASE WHEN status_code < 400 THEN 1 ELSE 0 END) as success_requests,
            SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as failed_requests,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
            COALESCE(SUM(completion_tokens), 0) as completion_tokens,
            COALESCE(SUM(cached_tokens), 0) as cached_tokens,
            COALESCE(SUM(cost), 0) as estimated_cost,
            COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
            COUNT(DISTINCT key_id) as active_clients_count,
            COUNT(DISTINCT account_id) as active_accounts_count
          FROM proxy_usage_records
          WHERE timestamp >= ? ${keyFilter} ${accountFilter}`,
        )
        .get(...params);

      const summary: ProxyUsageSummary = {
        totalRequests: Number(summaryRow?.total_requests || 0),
        successRequests: Number(summaryRow?.success_requests || 0),
        failedRequests: Number(summaryRow?.failed_requests || 0),
        totalTokens: Number(summaryRow?.total_tokens || 0),
        promptTokens: Number(summaryRow?.prompt_tokens || 0),
        completionTokens: Number(summaryRow?.completion_tokens || 0),
        cachedTokens: Number(summaryRow?.cached_tokens || 0),
        estimatedCost: Number(Number(summaryRow?.estimated_cost || 0).toFixed(6)),
        avgDurationMs: Math.round(Number(summaryRow?.avg_duration_ms || 0)),
        activeClientsCount: Number(summaryRow?.active_clients_count || 0),
        activeAccountsCount: Number(summaryRow?.active_accounts_count || 0),
      };

      // Client breakdown
      const clientRows = this.db
        .prepare(
          `SELECT
            COALESCE(key_id, 'unassigned') as key_id,
            COALESCE(key_name, 'Unassigned') as key_name,
            COUNT(*) as requests,
            COALESCE(SUM(total_tokens), 0) as tokens,
            COALESCE(SUM(cost), 0) as cost,
            SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
            MAX(timestamp) as last_active
          FROM proxy_usage_records
          WHERE timestamp >= ? ${keyFilter} ${accountFilter}
          GROUP BY key_id, key_name
          ORDER BY requests DESC`,
        )
        .all(...params);

      const clientBreakdown: ProxyUsageClientBreakdown[] = clientRows.map((r: any) => ({
        keyId: String(r.key_id),
        keyName: String(r.key_name),
        requests: Number(r.requests),
        tokens: Number(r.tokens),
        cost: Number(Number(r.cost).toFixed(6)),
        errors: Number(r.errors),
        lastActive: r.last_active ? Number(r.last_active) : null,
      }));

      // Account breakdown
      const accountRows = this.db
        .prepare(
          `SELECT
            account_id,
            COALESCE(account_email, account_id) as account_email,
            COUNT(*) as requests,
            COALESCE(SUM(total_tokens), 0) as tokens,
            COALESCE(SUM(cost), 0) as cost,
            SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
            MAX(timestamp) as last_active
          FROM proxy_usage_records
          WHERE timestamp >= ? AND account_id IS NOT NULL ${keyFilter} ${accountFilter}
          GROUP BY account_id, account_email
          ORDER BY requests DESC`,
        )
        .all(...params);

      const accountBreakdown: ProxyUsageAccountBreakdown[] = accountRows.map((r: any) => ({
        accountId: String(r.account_id),
        accountEmail: String(r.account_email),
        requests: Number(r.requests),
        tokens: Number(r.tokens),
        cost: Number(Number(r.cost).toFixed(6)),
        errors: Number(r.errors),
        lastActive: r.last_active ? Number(r.last_active) : null,
      }));

      // Model breakdown
      const modelRows = this.db
        .prepare(
          `SELECT
            COALESCE(model, 'unknown') as model,
            COUNT(*) as requests,
            COALESCE(SUM(total_tokens), 0) as tokens,
            COALESCE(SUM(cost), 0) as cost,
            SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors,
            COALESCE(AVG(duration_ms), 0) as avg_duration_ms
          FROM proxy_usage_records
          WHERE timestamp >= ? ${keyFilter} ${accountFilter}
          GROUP BY model
          ORDER BY requests DESC`,
        )
        .all(...params);

      const modelBreakdown: ProxyUsageModelBreakdown[] = modelRows.map((r: any) => ({
        model: String(r.model),
        requests: Number(r.requests),
        tokens: Number(r.tokens),
        cost: Number(Number(r.cost).toFixed(6)),
        errors: Number(r.errors),
        avgDurationMs: Math.round(Number(r.avg_duration_ms)),
      }));

      // Protocol breakdown
      const protocolRows = this.db
        .prepare(
          `SELECT
            protocol,
            COUNT(*) as requests,
            COALESCE(SUM(total_tokens), 0) as tokens
          FROM proxy_usage_records
          WHERE timestamp >= ? ${keyFilter} ${accountFilter}
          GROUP BY protocol
          ORDER BY requests DESC`,
        )
        .all(...params);

      const protocolBreakdown: ProxyUsageProtocolBreakdown[] = protocolRows.map((r: any) => ({
        protocol: String(r.protocol),
        requests: Number(r.requests),
        tokens: Number(r.tokens),
      }));

      // Status breakdown
      const statusRows = this.db
        .prepare(
          `SELECT
            CASE
              WHEN status_code >= 200 AND status_code < 300 THEN '2xx'
              WHEN status_code >= 400 AND status_code < 500 THEN '4xx'
              WHEN status_code >= 500 THEN '5xx'
              ELSE 'other'
            END as status_range,
            COUNT(*) as count
          FROM proxy_usage_records
          WHERE timestamp >= ? ${keyFilter} ${accountFilter}
          GROUP BY status_range`,
        )
        .all(...params);

      const statusBreakdown: ProxyUsageStatusBreakdown[] = statusRows.map((r: any) => ({
        statusRange: String(r.status_range),
        count: Number(r.count),
      }));

      // Timeline hourly / daily
      const isHourly = (options.timeRange ?? '24h') === '24h' || options.timeRange === 'today';
      const timeFormat = isHourly ? '%H:00' : '%m/%d';

      const timelineRows = this.db
        .prepare(
          `SELECT
            strftime('${timeFormat}', timestamp / 1000, 'unixepoch', 'localtime') as time_bucket,
            MIN(timestamp) as bucket_timestamp,
            COUNT(*) as requests,
            COALESCE(SUM(total_tokens), 0) as tokens,
            COALESCE(SUM(cost), 0) as cost,
            SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) as errors
          FROM proxy_usage_records
          WHERE timestamp >= ? ${keyFilter} ${accountFilter}
          GROUP BY time_bucket
          ORDER BY bucket_timestamp ASC`,
        )
        .all(...params);

      const timeline: ProxyUsageTimelineBucket[] = timelineRows.map((r: any) => ({
        time: String(r.time_bucket),
        timestamp: Number(r.bucket_timestamp),
        requests: Number(r.requests),
        tokens: Number(r.tokens),
        cost: Number(Number(r.cost).toFixed(6)),
        errors: Number(r.errors),
      }));

      return {
        summary,
        timeline,
        clientBreakdown,
        accountBreakdown,
        modelBreakdown,
        protocolBreakdown,
        statusBreakdown,
      };
    } catch (err) {
      logger.error('Failed to get stats from SQLite usage store', err);
      return this.inMemoryFallback.getStats(options);
    }
  }

  public async getLogs(options: GetUsageLogsOptions = {}): Promise<ProxyUsageLogsResult> {
    if (!this.ensureInitialized() || !this.db) {
      return this.inMemoryFallback.getLogs(options);
    }

    try {
      const startTime = resolveStartTime(options.timeRange);
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;

      const whereClauses = ['timestamp >= ?'];
      const params: unknown[] = [startTime];

      if (options.keyId) {
        whereClauses.push('key_id = ?');
        params.push(options.keyId);
      }

      if (options.accountId) {
        whereClauses.push('account_id = ?');
        params.push(options.accountId);
      }

      if (options.model) {
        whereClauses.push('model = ?');
        params.push(options.model);
      }

      if (options.status === 'success') {
        whereClauses.push('status_code >= 200 AND status_code < 300');
      } else if (options.status === 'error') {
        whereClauses.push('status_code >= 400');
      } else if (options.status === 'auth') {
        whereClauses.push('(status_code = 401 OR status_code = 403)');
      }

      const whereSql = whereClauses.join(' AND ');

      const countRow = this.db
        .prepare(`SELECT COUNT(*) as total FROM proxy_usage_records WHERE ${whereSql}`)
        .get(...params);
      const total = Number(countRow?.total || 0);

      const rows = this.db
        .prepare(
          `SELECT * FROM proxy_usage_records
          WHERE ${whereSql}
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset);

      const logs: ProxyUsageRecord[] = rows.map((r: any) => ({
        id: Number(r.id),
        timestamp: Number(r.timestamp),
        keyId: r.key_id ? String(r.key_id) : null,
        keyName: r.key_name ? String(r.key_name) : null,
        accountId: r.account_id ? String(r.account_id) : null,
        accountEmail: r.account_email ? String(r.account_email) : null,
        protocol: String(r.protocol),
        endpoint: String(r.endpoint),
        model: r.model ? String(r.model) : null,
        statusCode: Number(r.status_code),
        durationMs: Number(r.duration_ms),
        promptTokens: Number(r.prompt_tokens || 0),
        completionTokens: Number(r.completion_tokens || 0),
        totalTokens: Number(r.total_tokens || 0),
        cachedTokens: Number(r.cached_tokens || 0),
        cost: Number(Number(r.cost || 0).toFixed(6)),
        errorMessage: r.error_message ? String(r.error_message) : null,
        ip: r.ip ? String(r.ip) : null,
        userAgent: r.user_agent ? String(r.user_agent) : null,
      }));

      return { total, logs };
    } catch (err) {
      logger.error('Failed to get access logs from SQLite usage store', err);
      return this.inMemoryFallback.getLogs(options);
    }
  }

  public clear(): void {
    this.inMemoryFallback.clear();
    if (this.ensureInitialized() && this.db) {
      try {
        this.db.prepare('DELETE FROM proxy_usage_records').run();
      } catch (err) {
        logger.error('Failed to clear SQLite usage records', err);
      }
    }
  }
}

export const proxyUsageStore: IProxyUsageStore = new SqliteProxyUsageStore();
