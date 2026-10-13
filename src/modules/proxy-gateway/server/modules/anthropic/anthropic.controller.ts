import {
  Body,
  Controller,
  HttpStatus,
  Inject,
  Optional,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, type FastifyRequest } from 'fastify';
import {
  AnthropicChatRequest,
  type AnthropicChatResponse,
} from '@/modules/proxy-gateway/server/common/interfaces/request-interfaces';
import { BaseProxyController } from '@/modules/proxy-gateway/server/common/base-proxy.controller';
import { ProxyGuard } from '@/modules/proxy-gateway/server/guards/proxy.guard';
import { FilesService } from '@/modules/proxy-gateway/server/modules/files/files.service';
import {
  expandFileReferences,
  FileReferenceError,
} from '@/modules/proxy-gateway/server/modules/files/file-reference-expander';
import { setResponseUsage } from '../../shared/services/request-usage-context';
import { AnthropicService } from './anthropic.service';

@Controller('v1')
@UseGuards(ProxyGuard)
export class AnthropicController extends BaseProxyController {
  constructor(
    @Inject(AnthropicService) private readonly proxyService: AnthropicService,
    @Optional() @Inject(FilesService) private readonly files?: FilesService,
  ) {
    super();
  }

  @Post('messages/count_tokens')
  async countTokens(@Body() body: AnthropicChatRequest, @Res() res: FastifyReply) {
    try {
      const request = await this.expandFileHandles(body);
      const inputTokens = await this.proxyService.handleAnthropicCountTokens(request);
      res.status(HttpStatus.OK).send({ input_tokens: inputTokens });
    } catch (error) {
      if (error instanceof FileReferenceError) {
        this.sendFileReferenceError(res, 'anthropic', error);
        return;
      }
      this.sendAnthropicErrorResponse(res, '/v1/messages/count_tokens', error);
    }
  }

  @Post('messages')
  async anthropicMessages(
    @Body() body: AnthropicChatRequest,
    @Res() res: FastifyReply,
    @Req() req?: FastifyRequest,
  ) {
    try {
      const request = await this.expandFileHandles(body);
      const result = await this.proxyService.handleAnthropicMessages(
        request,
        req ? { headers: req.headers, url: req.url } : undefined,
      );

      if (body.stream && this.isObservableLike(result)) {
        this.writeSseResponse(res, result, req, body.model);
        return;
      } else {
        const response = result as AnthropicChatResponse;
        if (req) {
          setResponseUsage(req, {
            protocol: 'anthropic',
            model: response.model || body.model,
            promptTokens: response.usage?.input_tokens,
            completionTokens: response.usage?.output_tokens,
            totalTokens:
              (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
          });
        }
        res.status(HttpStatus.OK).send(result);
      }
    } catch (error) {
      if (error instanceof FileReferenceError) {
        this.sendFileReferenceError(res, 'anthropic', error);
        return;
      }
      this.sendAnthropicErrorResponse(res, '/v1/messages', error);
    }
  }

  /**
   * Turns any `file_id` source in the request into the inline bytes the
   * upstream transport takes, before anything else looks at the body.
   */
  private expandFileHandles(body: AnthropicChatRequest): Promise<AnthropicChatRequest> {
    return expandFileReferences(body, 'anthropic', this.files);
  }
}
