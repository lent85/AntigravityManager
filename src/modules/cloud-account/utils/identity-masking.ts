export const MASKED_NAME = '••••••••';
export const MASKED_EMAIL = '••••••••@••••';
export const MASKED_INITIAL = '•';

/**
 * Returns a completely masked email when masking is enabled.
 */
export function maskEmail(email: string | undefined | null, enabled: boolean = true): string {
  if (!enabled || !email) {
    return email || '';
  }
  return MASKED_EMAIL;
}

/**
 * Returns a completely masked name when masking is enabled.
 */
export function maskName(
  name: string | undefined | null,
  enabled: boolean = true,
  fallback: string = '',
): string {
  if (!enabled) {
    return name || fallback;
  }
  return MASKED_NAME;
}

/**
 * Returns a masked avatar initial character when masking is enabled.
 */
export function maskInitial(
  name: string | undefined | null,
  email?: string | null,
  enabled: boolean = true,
): string {
  if (!enabled) {
    return name?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || 'A';
  }
  return MASKED_INITIAL;
}
