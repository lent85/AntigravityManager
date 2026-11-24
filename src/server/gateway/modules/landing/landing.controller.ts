import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getServerConfig } from '@/server/server-config';
import { AccountLeaseService } from '../account-lease/account-lease.service';
import { renderLandingPageHtml } from './landing-page.template';
import { getOpenAICompatibleModels } from '@/modules/proxy-gateway/antigravity/ModelMapping';
import { getConfiguredModelMapping } from '@/modules/config/model-aliases';

@Controller()
export class LandingController {
  public constructor(
    @Inject(AccountLeaseService) private readonly accountLeaseService: AccountLeaseService,
  ) {}

  @Get('/')
  public handleRoot(@Req() req: FastifyRequest, @Res() res: FastifyReply): void {
    this.serveLandingOrStatus(req, res);
  }

  @Get('/docs')
  public handleDocs(@Req() req: FastifyRequest, @Res() res: FastifyReply): void {
    this.serveLandingOrStatus(req, res);
  }

  @Get('/portal')
  public handlePortal(@Req() req: FastifyRequest, @Res() res: FastifyReply): void {
    this.serveLandingOrStatus(req, res);
  }

  private serveLandingOrStatus(req: FastifyRequest, res: FastifyReply): void {
    const config = getServerConfig();
    const isLandingEnabled = config?.public_landing_enabled ?? true;
    const acceptHeader = (req.headers.accept || '').toLowerCase();
    const isBrowserRequest =
      acceptHeader.includes('text/html') || acceptHeader.includes('*/*') || acceptHeader === '';

    const modelIds = getOpenAICompatibleModels(
      getConfiguredModelMapping(config),
      this.accountLeaseService.getAllCollectedModels(),
      config?.only_raw_quota_models ?? false,
    );

    const port = config?.port || 8045;
    const hostHeader = (req.headers.host as string) || `localhost:${port}`;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const baseUrl = `${protocol}://${hostHeader}`;

    if (isLandingEnabled && isBrowserRequest) {
      const pricingMap = config?.model_pricing ?? {};

      const modelsData = modelIds.map((id) => {
        const normalized = id.toLowerCase();
        const pricing = pricingMap[id] ?? pricingMap[normalized];

        return {
          id,
          displayName: id,
          ...(pricing ? { pricing } : {}),
        };
      });

      const html = renderLandingPageHtml({
        title: config?.public_landing_title || 'Antigravity AI Gateway',
        description:
          config?.public_landing_description ||
          'High-performance OpenAI, Anthropic & Gemini unified proxy gateway',
        port,
        modelsCount: modelIds.length,
        models: modelsData,
        baseUrl,
      });

      res.type('text/html').send(html);
      return;
    }

    res.send({
      status: 'online',
      service: config?.public_landing_title || 'Antigravity Manager AI Gateway',
      version: '1.0.0',
      port,
      models_count: modelIds.length,
      endpoints: {
        openai_chat: `${baseUrl}/v1/chat/completions`,
        openai_models: `${baseUrl}/v1/models`,
        openai_quote: `${baseUrl}/v1/models/quote`,
        gateway_quota: `${baseUrl}/v1/gateway/quota`,
        anthropic_messages: `${baseUrl}/v1/messages`,
        gemini_generate: `${baseUrl}/v1beta`,
      },
    });
  }
}
