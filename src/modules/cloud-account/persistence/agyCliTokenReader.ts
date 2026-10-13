import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import { logger } from '@/shared/logging/logger';
import {
  parseCredentialStorePayload,
  type CredentialStoreToken,
} from '@/modules/antigravity-runtime/credentials/antigravityCredentialStore';

/**
 * Reads and parses the Antigravity CLI token payload from any discovered session file.
 * Returns null if no valid token file is found or readable.
 */
export function readAgyCliToken(): CredentialStoreToken | null {
  const tokenPath = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'antigravity-oauth-token');
  try {
    if (!fs.existsSync(tokenPath)) {
      return null;
    }
    const raw = fs.readFileSync(tokenPath, 'utf-8').trim();
    if (!raw) {
      return null;
    }
    const token = parseCredentialStorePayload(raw);
    if (token && token.refreshToken) {
      return token;
    }
  } catch (error) {
    logger.warn(`Failed to read Antigravity CLI token from ${tokenPath}`, error);
  }
  return null;
}
