import { logger } from '@/shared/logging/logger';
import type { CloudAccount } from '@/modules/cloud-account/types';
import type { CredentialStoreToken } from '@/modules/cloud-account/persistence/antigravityCredentialStore';
import { GoogleAPIService } from '@/modules/cloud-account/services/GoogleAPIService';
import { CloudAccountRepo } from '@/modules/cloud-account/persistence/cloudHandler';

export function normalizeAccountEmail(email: string | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

import { extractEmailFromJwt } from '@/shared/auth/jwt';
export { extractEmailFromJwt };

export interface MatchAccountOptions {
  updateRepoOnRefresh?: boolean;
}

/**
 * Matches a CredentialStoreToken (from CLI token file or OS Keyring or SQLite)
 * to a known CloudAccount using multi-tiered resolution:
 * 1. Exact refresh_token match
 * 2. Exact access_token match
 * 3. Offline JWT id_token email match
 * 4. Online Google API userinfo / tokeninfo match
 * 5. Online Google OAuth token refresh fallback
 */
export async function matchAccountFromCredentialToken(
  credToken: CredentialStoreToken,
  accounts: CloudAccount[],
  options: MatchAccountOptions = { updateRepoOnRefresh: true },
): Promise<CloudAccount | undefined> {
  const findAccountByEmail = (email?: string) => {
    if (!email) {
      return undefined;
    }
    const normalized = normalizeAccountEmail(email);
    return accounts.find((acc) => normalizeAccountEmail(acc.email) === normalized);
  };

  // Tier 1: Exact refresh_token match
  if (credToken.refreshToken) {
    const matched = accounts.find((acc) => acc.token.refresh_token === credToken.refreshToken);
    if (matched) {
      return matched;
    }
  }

  // Tier 2: Exact access_token match
  if (credToken.accessToken) {
    const matched = accounts.find((acc) => acc.token.access_token === credToken.accessToken);
    if (matched) {
      return matched;
    }
  }

  // Tier 3: Extract email from idToken (offline JWT decode)
  const idTokenEmail = extractEmailFromJwt(credToken.idToken);
  if (idTokenEmail) {
    const matched = findAccountByEmail(idTokenEmail);
    if (matched) {
      return matched;
    }
  }

  // Tier 4: Fetch userinfo with access_token (online)
  if (credToken.accessToken) {
    try {
      const userInfo = await GoogleAPIService.getUserInfo(credToken.accessToken);
      if (userInfo && userInfo.email) {
        const matched = findAccountByEmail(userInfo.email);
        if (matched) {
          return matched;
        }
      }
    } catch {
      // Access token may be expired or network temporarily down
    }
  }

  // Tier 5: Refresh token with Google OAuth and obtain verified email
  if (credToken.refreshToken) {
    try {
      const refreshed = await GoogleAPIService.refreshAccessToken(credToken.refreshToken);
      if (refreshed) {
        let refreshedEmail = extractEmailFromJwt(refreshed.id_token);
        if (!refreshedEmail && refreshed.access_token) {
          try {
            const userInfo = await GoogleAPIService.getUserInfo(refreshed.access_token);
            refreshedEmail = userInfo?.email ? normalizeAccountEmail(userInfo.email) : undefined;
          } catch {
            // ignore
          }
        }

        if (refreshedEmail) {
          const matched = findAccountByEmail(refreshedEmail);
          if (matched) {
            if (options.updateRepoOnRefresh) {
              try {
                const now = Math.floor(Date.now() / 1000);
                await CloudAccountRepo.updateToken(matched.id, {
                  ...matched.token,
                  access_token: refreshed.access_token,
                  refresh_token: refreshed.refresh_token ?? matched.token.refresh_token,
                  expires_in: refreshed.expires_in,
                  expiry_timestamp: now + refreshed.expires_in,
                  id_token: refreshed.id_token ?? matched.token.id_token,
                });
                logger.info(
                  `[AccountMatcher] Refreshed and updated token in repo for detected account ${matched.email}`,
                );
              } catch (updateErr) {
                logger.warn(
                  '[AccountMatcher] Failed to update refreshed token in repo for account',
                  updateErr,
                );
              }
            }
            return matched;
          }
        }
      }
    } catch {
      // Refresh token might be revoked, belong to a non-Google provider, or network offline
    }
  }

  return undefined;
}
