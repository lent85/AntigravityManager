import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { getServerConfig } from '../../../../server/server-config';
import { extractApiKeyToken, type RequestHeaders } from './api-key-auth.util';
import { openCodeCredentialService } from '../../opencode-sync/opencode-credentials';
import { buildAuthErrorBody, resolveAuthErrorSurface } from '../common/auth-error-envelope';
import {
  attachClientInfo,
  resolveConfiguredApiKeys,
} from '../shared/services/request-usage-context';
import { proxyUsageStore } from '../shared/services/proxy-usage.store';

@Injectable()
export class ProxyGuard implements CanActivate {
  private readonly logger = new Logger(ProxyGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: RequestHeaders; ip: string; url?: string }>();

    const config = getServerConfig();
    const clientToken = extractApiKeyToken(request.headers);

    // The OpenCode credential is accepted only by this model-proxy guard.
    // AdminGuard intentionally knows nothing about it, so revocation and scope stay independent.
    // OpenCode is optional: a keyring failure must not block the configured proxy API key.
    try {
      if (openCodeCredentialService.matches(clientToken)) {
        attachClientInfo(request, { keyId: 'opencode', keyName: 'OpenCode Client' });
        return true;
      }
    } catch (error) {
      this.logger.warn(
        `OpenCode credential check failed; continuing with proxy API key auth (${request.ip})`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    const configuredKeys = resolveConfiguredApiKeys(config);

    // Bypass if no api_key set (Open Mode) or config missing
    if (configuredKeys.length === 0) {
      attachClientInfo(request, { keyId: 'open', keyName: 'Open Access (No Key)' });
      return true;
    }

    if (clientToken) {
      const trimmedToken = clientToken.trim();

      // Check active keys
      const activeMatch = configuredKeys.find(
        (k) => k.enabled !== false && k.key.trim() === trimmedToken,
      );
      if (activeMatch) {
        attachClientInfo(request, { keyId: activeMatch.id, keyName: activeMatch.name });
        proxyUsageStore.touchKeyLastUsed(activeMatch.id);
        return true;
      }

      // Check disabled keys
      const disabledMatch = configuredKeys.find(
        (k) => k.enabled === false && k.key.trim() === trimmedToken,
      );
      if (disabledMatch) {
        attachClientInfo(request, { keyId: disabledMatch.id, keyName: disabledMatch.name });
        this.logger.warn(`Rejected request using disabled key '${disabledMatch.name}' from ${request.ip}`);
        const surface = resolveAuthErrorSurface(request);
        throw new UnauthorizedException(buildAuthErrorBody(surface, 'API key is disabled'));
      }
    }

    this.logger.warn(`Rejected unauthorized request from ${request.ip}`);
    attachClientInfo(request, { keyId: 'unauthorized', keyName: 'Unauthorized' });

    const surface = resolveAuthErrorSurface(request);
    throw new UnauthorizedException(buildAuthErrorBody(surface, 'API key validation failed'));
  }
}
