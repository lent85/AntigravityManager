import type { CloudQuotaModelInfo } from '@/modules/cloud-account/types';
import type { QuotaStatus } from '@/modules/cloud-account/utils/quota-display';

export const QUOTA_TEXT_COLOR_CLASS_BY_STATUS: Record<QuotaStatus, string> = {
  high: 'text-emerald-600 dark:text-emerald-400 font-semibold',
  medium: 'text-amber-600 dark:text-amber-500 font-semibold',
  low: 'text-rose-600 dark:text-rose-400 font-semibold',
};

export const QUOTA_BAR_COLOR_CLASS_BY_STATUS: Record<QuotaStatus, string> = {
  high: 'bg-gradient-to-r from-emerald-400 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
  medium: 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.25)]',
  low: 'bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
};

export type ModelGenerationKey =
  | 'gemini-4.0'
  | 'gemini-3.8'
  | 'gemini-3.7'
  | 'gemini-3.6'
  | 'gemini-3.1-pro'
  | 'gemini-3.5-flash'
  | 'gemini-image'
  | 'claude'
  | 'gpt'
  | 'other';

export interface ModelGenerationMeta {
  key: ModelGenerationKey;
  label: string;
  badgeLabel: string;
  badgeClass: string;
  headerBorderClass: string;
  sortOrder: number;
}

export const MODEL_GENERATION_METAS: Record<ModelGenerationKey, ModelGenerationMeta> = {
  'gemini-4.0': {
    key: 'gemini-4.0',
    label: 'Gemini 4.0',
    badgeLabel: 'Gemini 4.0',
    badgeClass: 'border-purple-500/40 bg-purple-500/15 text-purple-600 dark:text-purple-300',
    headerBorderClass: 'border-purple-500/30',
    sortOrder: 1,
  },
  'gemini-3.8': {
    key: 'gemini-3.8',
    label: 'Gemini 3.8',
    badgeLabel: 'Gemini 3.8',
    badgeClass: 'border-indigo-500/40 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
    headerBorderClass: 'border-indigo-500/30',
    sortOrder: 2,
  },
  'gemini-3.7': {
    key: 'gemini-3.7',
    label: 'Gemini 3.7',
    badgeLabel: 'Gemini 3.7',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    headerBorderClass: 'border-emerald-500/30',
    sortOrder: 3,
  },
  'gemini-3.6': {
    key: 'gemini-3.6',
    label: 'Gemini 3.6',
    badgeLabel: 'Gemini 3.6',
    badgeClass: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
    headerBorderClass: 'border-cyan-500/30',
    sortOrder: 4,
  },
  'gemini-3.1-pro': {
    key: 'gemini-3.1-pro',
    label: 'Gemini 3.1 Pro',
    badgeLabel: 'Gemini 3.1 Pro',
    badgeClass: 'border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-300',
    headerBorderClass: 'border-amber-500/30',
    sortOrder: 5,
  },
  'gemini-3.5-flash': {
    key: 'gemini-3.5-flash',
    label: 'Gemini 3.5 & Flash',
    badgeLabel: 'Gemini 3.5 Flash',
    badgeClass: 'border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300',
    headerBorderClass: 'border-sky-500/30',
    sortOrder: 6,
  },
  'gemini-image': {
    key: 'gemini-image',
    label: 'Gemini Image',
    badgeLabel: 'Gemini Image',
    badgeClass: 'border-pink-500/40 bg-pink-500/15 text-pink-600 dark:text-pink-300',
    headerBorderClass: 'border-pink-500/30',
    sortOrder: 7,
  },
  claude: {
    key: 'claude',
    label: 'Anthropic Claude',
    badgeLabel: 'Claude',
    badgeClass: 'border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-300',
    headerBorderClass: 'border-orange-500/30',
    sortOrder: 8,
  },
  gpt: {
    key: 'gpt',
    label: 'GPT OSS',
    badgeLabel: 'GPT OSS',
    badgeClass: 'border-teal-500/40 bg-teal-500/15 text-teal-600 dark:text-teal-300',
    headerBorderClass: 'border-teal-500/30',
    sortOrder: 9,
  },
  other: {
    key: 'other',
    label: 'Other Models',
    badgeLabel: 'Other',
    badgeClass: 'border-zinc-500/40 bg-zinc-500/15 text-zinc-600 dark:text-zinc-300',
    headerBorderClass: 'border-zinc-500/30',
    sortOrder: 10,
  },
};

/**
 * Detect the high-level model generation/family for UI presentation.
 */
export function detectModelGeneration(modelId: string): ModelGenerationKey {
  const normalized = modelId.toLowerCase().replace(/^models\//i, '').trim();

  if (normalized.includes('claude')) {
    return 'claude';
  }
  if (normalized.startsWith('gpt')) {
    return 'gpt';
  }
  if (normalized.includes('image')) {
    return 'gemini-image';
  }
  if (/(?:gemini-4(?:\.0)?(?:-|$|\/)|gemini-4)/i.test(normalized)) {
    return 'gemini-4.0';
  }
  if (/gemini-3\.8/i.test(normalized)) {
    return 'gemini-3.8';
  }
  if (/gemini-3\.7/i.test(normalized)) {
    return 'gemini-3.7';
  }
  if (/gemini-3\.6/i.test(normalized)) {
    return 'gemini-3.6';
  }
  if (
    /gemini-3\.1-pro/i.test(normalized) ||
    /gemini-3-pro/i.test(normalized) ||
    /gemini-pro/i.test(normalized)
  ) {
    return 'gemini-3.1-pro';
  }
  if (
    /gemini-3\.5/i.test(normalized) ||
    /gemini-3-flash/i.test(normalized) ||
    /gemini-flash/i.test(normalized)
  ) {
    return 'gemini-3.5-flash';
  }
  if (normalized.includes('gemini')) {
    return 'gemini-3.7';
  }
  return 'other';
}

/**
 * Get distinct % bar gradient classes reflecting the model generation
 * with depth (vibrant/deep when high, medium when 50-79%, light when 20-49%, red warning when < 20%).
 */
export function getModelQuotaBarColorClass(modelId: string, percentage: number): string {
  // Critical warning regardless of model
  if (percentage < 20) {
    return 'bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_8px_rgba(239,68,68,0.35)]';
  }

  const gen = detectModelGeneration(modelId);

  // High (>= 80%): Đậm (vivid, deep tone, soft glow)
  if (percentage >= 80) {
    switch (gen) {
      case 'gemini-4.0':
        return 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-indigo-600 shadow-[0_0_8px_rgba(168,85,247,0.35)]';
      case 'gemini-3.8':
        return 'bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 shadow-[0_0_8px_rgba(59,130,246,0.35)]';
      case 'gemini-3.7':
        return 'bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 shadow-[0_0_8px_rgba(16,185,129,0.35)]';
      case 'gemini-3.6':
        return 'bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 shadow-[0_0_8px_rgba(6,182,212,0.35)]';
      case 'gemini-3.1-pro':
        return 'bg-gradient-to-r from-amber-600 via-orange-600 to-yellow-600 shadow-[0_0_8px_rgba(217,119,6,0.35)]';
      case 'gemini-3.5-flash':
        return 'bg-gradient-to-r from-sky-600 via-teal-600 to-emerald-600 shadow-[0_0_8px_rgba(14,165,233,0.35)]';
      case 'gemini-image':
        return 'bg-gradient-to-r from-pink-600 via-rose-600 to-fuchsia-600 shadow-[0_0_8px_rgba(236,72,153,0.35)]';
      case 'claude':
        return 'bg-gradient-to-r from-orange-600 via-amber-600 to-rose-600 shadow-[0_0_8px_rgba(234,88,12,0.35)]';
      case 'gpt':
        return 'bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-600 shadow-[0_0_8px_rgba(20,184,166,0.35)]';
      default:
        return 'bg-gradient-to-r from-emerald-600 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]';
    }
  }

  // Medium (50% - 79%): Vừa (balanced saturation)
  if (percentage >= 50) {
    switch (gen) {
      case 'gemini-4.0':
        return 'bg-gradient-to-r from-purple-500 to-fuchsia-400';
      case 'gemini-3.8':
        return 'bg-gradient-to-r from-blue-500 to-indigo-400';
      case 'gemini-3.7':
        return 'bg-gradient-to-r from-emerald-500 to-teal-400';
      case 'gemini-3.6':
        return 'bg-gradient-to-r from-cyan-500 to-sky-400';
      case 'gemini-3.1-pro':
        return 'bg-gradient-to-r from-amber-500 to-orange-400';
      case 'gemini-3.5-flash':
        return 'bg-gradient-to-r from-sky-500 to-teal-400';
      case 'gemini-image':
        return 'bg-gradient-to-r from-pink-500 to-rose-400';
      case 'claude':
        return 'bg-gradient-to-r from-orange-500 to-amber-400';
      case 'gpt':
        return 'bg-gradient-to-r from-teal-500 to-emerald-400';
      default:
        return 'bg-gradient-to-r from-emerald-500 to-teal-400';
    }
  }

  // Low (20% - 49%): Nhạt (softer / lighter tint)
  switch (gen) {
    case 'gemini-4.0':
      return 'bg-gradient-to-r from-purple-400/80 to-fuchsia-300/80 dark:from-purple-500/50 dark:to-fuchsia-400/50';
    case 'gemini-3.8':
      return 'bg-gradient-to-r from-blue-400/80 to-sky-300/80 dark:from-blue-500/50 dark:to-sky-400/50';
    case 'gemini-3.7':
      return 'bg-gradient-to-r from-emerald-400/80 to-teal-300/80 dark:from-emerald-500/50 dark:to-teal-400/50';
    case 'gemini-3.6':
      return 'bg-gradient-to-r from-cyan-400/80 to-sky-300/80 dark:from-cyan-500/50 dark:to-sky-400/50';
    case 'gemini-3.1-pro':
      return 'bg-gradient-to-r from-amber-400/80 to-yellow-300/80 dark:from-amber-500/50 dark:to-yellow-400/50';
    case 'gemini-3.5-flash':
      return 'bg-gradient-to-r from-sky-400/80 to-teal-300/80 dark:from-sky-500/50 dark:to-teal-400/50';
    case 'gemini-image':
      return 'bg-gradient-to-r from-pink-400/80 to-rose-300/80 dark:from-pink-500/50 dark:to-rose-400/50';
    case 'claude':
      return 'bg-gradient-to-r from-orange-400/80 to-amber-300/80 dark:from-orange-500/50 dark:to-amber-400/50';
    case 'gpt':
      return 'bg-gradient-to-r from-teal-400/80 to-emerald-300/80 dark:from-teal-500/50 dark:to-emerald-400/50';
    default:
      return 'bg-gradient-to-r from-emerald-400/80 to-teal-300/80 dark:from-emerald-500/50 dark:to-teal-400/50';
  }
}

/**
 * Text color for quota numbers with generation affinity and intensity levels.
 */
export function getModelQuotaTextColorClass(modelId: string, percentage: number): string {
  if (percentage < 20) {
    return 'text-rose-600 dark:text-rose-400 font-bold';
  }

  const gen = detectModelGeneration(modelId);

  if (percentage >= 80) {
    switch (gen) {
      case 'gemini-4.0':
        return 'text-purple-600 dark:text-purple-400 font-bold';
      case 'gemini-3.8':
        return 'text-blue-600 dark:text-blue-400 font-bold';
      case 'gemini-3.7':
        return 'text-emerald-600 dark:text-emerald-400 font-bold';
      case 'gemini-3.6':
        return 'text-cyan-600 dark:text-cyan-400 font-bold';
      case 'gemini-3.1-pro':
        return 'text-amber-600 dark:text-amber-400 font-bold';
      case 'gemini-3.5-flash':
        return 'text-sky-600 dark:text-sky-400 font-bold';
      case 'gemini-image':
        return 'text-pink-600 dark:text-pink-400 font-bold';
      case 'claude':
        return 'text-orange-600 dark:text-orange-400 font-bold';
      case 'gpt':
        return 'text-teal-600 dark:text-teal-400 font-bold';
      default:
        return 'text-emerald-600 dark:text-emerald-400 font-bold';
    }
  }

  if (percentage >= 50) {
    switch (gen) {
      case 'gemini-4.0':
        return 'text-purple-600/90 dark:text-purple-300 font-semibold';
      case 'gemini-3.8':
        return 'text-blue-600/90 dark:text-blue-300 font-semibold';
      case 'gemini-3.7':
        return 'text-emerald-600/90 dark:text-emerald-300 font-semibold';
      case 'gemini-3.6':
        return 'text-cyan-600/90 dark:text-cyan-300 font-semibold';
      case 'gemini-3.1-pro':
        return 'text-amber-600/90 dark:text-amber-300 font-semibold';
      case 'gemini-3.5-flash':
        return 'text-sky-600/90 dark:text-sky-300 font-semibold';
      case 'gemini-image':
        return 'text-pink-600/90 dark:text-pink-300 font-semibold';
      case 'claude':
        return 'text-orange-600/90 dark:text-orange-300 font-semibold';
      case 'gpt':
        return 'text-teal-600/90 dark:text-teal-300 font-semibold';
      default:
        return 'text-emerald-600/90 dark:text-emerald-300 font-semibold';
    }
  }

  // Low (20% - 49%)
  return 'text-amber-600 dark:text-amber-400 font-semibold';
}

/**
 * Standard progress bar colors with depth by percentage for non-model progress bars.
 */
export function getQuotaBarColorClassByPercentage(percentage: number): string {
  if (percentage < 20) {
    return 'bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_8px_rgba(239,68,68,0.35)]';
  }
  if (percentage >= 80) {
    return 'bg-gradient-to-r from-emerald-600 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.35)]';
  }
  if (percentage >= 50) {
    return 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_6px_rgba(16,185,129,0.2)]';
  }
  return 'bg-gradient-to-r from-amber-400/85 to-orange-400/85';
}

/**
 * Standard text color with depth by percentage for non-model quotas.
 */
export function getQuotaTextColorClassByPercentage(percentage: number): string {
  if (percentage < 20) {
    return 'text-rose-600 dark:text-rose-400 font-bold';
  }
  if (percentage >= 80) {
    return 'text-emerald-600 dark:text-emerald-400 font-bold';
  }
  if (percentage >= 50) {
    return 'text-emerald-600/90 dark:text-emerald-300 font-semibold';
  }
  return 'text-amber-600 dark:text-amber-400 font-semibold';
}

const GEMINI_LEGACY_MODEL_PATTERN = /gemini-[12](\.|$|-)/i;

export interface ModelQuotaGroup {
  key: ModelGenerationKey;
  label: string;
  badgeLabel: string;
  badgeClass: string;
  headerBorderClass: string;
  sortOrder: number;
  models: Array<[string, CloudQuotaModelInfo]>;
}

/**
 * Groups models by their high-level generation (Gemini 4.0, 3.8, 3.7, 3.6, etc.)
 * and orders groups by priority with models inside sorted by percentage descending.
 */
export function groupModelsByGeneration(
  models: Record<string, CloudQuotaModelInfo>,
  customLabels?: Partial<Record<ModelGenerationKey, string>>,
): ModelQuotaGroup[] {
  const groupsMap = new Map<ModelGenerationKey, Array<[string, CloudQuotaModelInfo]>>();

  for (const [modelId, info] of Object.entries(models)) {
    if (GEMINI_LEGACY_MODEL_PATTERN.test(modelId)) {
      continue;
    }
    const genKey = detectModelGeneration(modelId);
    const list = groupsMap.get(genKey) ?? [];
    list.push([modelId, info]);
    groupsMap.set(genKey, list);
  }

  const result: ModelQuotaGroup[] = [];

  for (const [key, modelEntries] of groupsMap.entries()) {
    if (modelEntries.length === 0) {
      continue;
    }
    const meta = MODEL_GENERATION_METAS[key] ?? MODEL_GENERATION_METAS.other;
    const sortedModels = [...modelEntries].sort((a, b) => b[1].percentage - a[1].percentage);

    result.push({
      key,
      label: customLabels?.[key] ?? meta.label,
      badgeLabel: meta.badgeLabel,
      badgeClass: meta.badgeClass,
      headerBorderClass: meta.headerBorderClass,
      sortOrder: meta.sortOrder,
      models: sortedModels,
    });
  }

  return result.sort((a, b) => a.sortOrder - b.sortOrder);
}
