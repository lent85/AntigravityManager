import fs from 'fs';
import { logger } from '@/shared/logging/logger';
import { getAgyCliTokenPaths } from './agyCliTokenPaths';
import {
  parseCredentialStorePayload,
  type CredentialStoreToken,
} from './antigravityCredentialStore';

/**
 * Reads and parses the Antigravity CLI token payload from any discovered session file.
 * Returns null if no valid token file is found or readable.
 */
export function readAgyCliToken(): CredentialStoreToken | null {
  const tokenPaths = getAgyCliTokenPaths();
  for (const tokenPath of tokenPaths) {
    try {
      if (!fs.existsSync(tokenPath)) {
        continue;
      }
      const raw = fs.readFileSync(tokenPath, 'utf-8').trim();
      if (!raw) {
        continue;
      }
      const token = parseCredentialStorePayload(raw);
      if (token && token.refreshToken) {
        return token;
      }
    } catch (error) {
      logger.warn(`Failed to read Antigravity CLI token from ${tokenPath}`, error);
    }
  }
  return null;
}
