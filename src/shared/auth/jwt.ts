/**
 * Safely extracts normalized email from a JWT token (e.g. Google id_token) without network or external libraries.
 */
export function extractEmailFromJwt(jwt?: string): string | undefined {
  if (!jwt || typeof jwt !== 'string') {
    return undefined;
  }

  try {
    const parts = jwt.split('.');
    if (parts.length >= 2) {
      const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded = payloadBase64 + '='.repeat((4 - (payloadBase64.length % 4)) % 4);
      const jsonStr = Buffer.from(padded, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr) as { email?: unknown };
      if (typeof payload.email === 'string' && payload.email.trim() !== '') {
        return payload.email.trim().toLowerCase();
      }
    }
  } catch {
    // Ignore malformed or unparseable JWT
  }

  return undefined;
}
