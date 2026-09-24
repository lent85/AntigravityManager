import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_APP_CONFIG } from '@/modules/config/types';
import { LandingController } from '@/modules/proxy-gateway/server/modules/landing/landing.controller';
import { getServerConfig, setServerConfig } from '@/server/server-config';

function createReply() {
  const reply: Record<string, unknown> = {};
  reply.send = vi.fn(() => reply);
  reply.type = vi.fn(() => reply);
  return reply;
}

describe('LandingController', () => {
  const previousConfig = getServerConfig();

  afterEach(() => {
    setServerConfig(previousConfig ?? DEFAULT_APP_CONFIG.proxy);
  });

  it.each([
    ['root', 'handleRoot'],
    ['docs', 'handleDocs'],
    ['portal', 'handlePortal'],
  ] as const)('serves the public status payload at the %s alias', (_name, method) => {
    setServerConfig({ ...DEFAULT_APP_CONFIG.proxy, public_landing_enabled: false });
    const controller = new LandingController({ getAllCollectedModels: () => [] } as never);
    const reply = createReply();

    controller[method](
      { headers: { accept: 'application/json', host: 'localhost:8045' } } as never,
      reply as never,
    );

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'online',
        endpoints: expect.objectContaining({
          openai_chat: 'http://localhost:8045/v1/chat/completions',
          openai_quote: 'http://localhost:8045/v1/models/quote',
        }),
      }),
    );
  });
});
