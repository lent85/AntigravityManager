export interface RecordUsageInput {
  keyId?: string;
  keyName?: string;
  accountId?: string;
  accountEmail?: string;
  protocol: 'openai' | 'anthropic' | 'gemini' | 'unknown';
  endpoint: string;
  model?: string;
  statusCode: number;
  durationMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  cost?: number;
  errorMessage?: string;
  ip?: string;
  userAgent?: string;
  timestamp?: number;
}

export interface ProxyUsageRecord {
  id: number;
  timestamp: number;
  keyId: string | null;
  keyName: string | null;
  accountId: string | null;
  accountEmail: string | null;
  protocol: string;
  endpoint: string;
  model: string | null;
  statusCode: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cost: number;
  errorMessage: string | null;
  ip: string | null;
  userAgent: string | null;
}

export interface ProxyUsageTimelineBucket {
  time: string;
  timestamp: number;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
}

export interface ProxyUsageClientBreakdown {
  keyId: string;
  keyName: string;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
  lastActive: number | null;
}

export interface ProxyUsageAccountBreakdown {
  accountId: string;
  accountEmail: string;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
  lastActive: number | null;
}

export interface ProxyUsageModelBreakdown {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
  errors: number;
  avgDurationMs: number;
}

export interface ProxyUsageProtocolBreakdown {
  protocol: string;
  requests: number;
  tokens: number;
}

export interface ProxyUsageStatusBreakdown {
  statusRange: string;
  count: number;
}

export interface ProxyUsageSummary {
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  estimatedCost: number;
  avgDurationMs: number;
  activeClientsCount: number;
  activeAccountsCount: number;
}

export interface ProxyUsageStatsResult {
  summary: ProxyUsageSummary;
  timeline: ProxyUsageTimelineBucket[];
  clientBreakdown: ProxyUsageClientBreakdown[];
  accountBreakdown: ProxyUsageAccountBreakdown[];
  modelBreakdown: ProxyUsageModelBreakdown[];
  protocolBreakdown: ProxyUsageProtocolBreakdown[];
  statusBreakdown: ProxyUsageStatusBreakdown[];
}

export interface ProxyUsageLogsResult {
  total: number;
  logs: ProxyUsageRecord[];
}

export type UsageTimeRange = 'today' | '24h' | '7d' | '30d' | 'all';

export interface GetUsageStatsOptions {
  timeRange?: UsageTimeRange;
  keyId?: string;
  accountId?: string;
}

export interface GetUsageLogsOptions {
  timeRange?: UsageTimeRange;
  keyId?: string;
  accountId?: string;
  model?: string;
  status?: 'all' | 'success' | 'error' | 'auth';
  limit?: number;
  offset?: number;
}

