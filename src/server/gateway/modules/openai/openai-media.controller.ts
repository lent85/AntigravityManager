import { Body, Controller, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { ProxyGuard } from '../../guards/proxy.guard';
import { type ImageMonitoringRequest } from './media/image-monitoring-summary';
import { parseAudioMultipartRequest } from './media/audio-multipart-request';
import { OpenAIOperations } from './openai-operations.service';

@Controller('v1')
@UseGuards(ProxyGuard)
export class OpenAIMediaController {
  public constructor(@Inject(OpenAIOperations) private readonly operations: OpenAIOperations) {}

  @Post('images/generations')
  public imageGenerations(
    @Body() body: ImageMonitoringRequest,
    @Res() res: FastifyReply,
    @Req() req?: FastifyRequest,
  ): Promise<void> {
    return this.operations.imageGenerations(body, res, req);
  }

  @Post('images/edits')
  public imageEdits(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    return this.operations.imageEdits(req, res);
  }

  @Post('audio/transcriptions')
  public audioTranscriptions(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    return this.parseAndHandleAudio(req, res, 'transcriptions');
  }

  @Post('audio/translations')
  public audioTranslations(@Req() req: FastifyRequest, @Res() res: FastifyReply): Promise<void> {
    return this.parseAndHandleAudio(req, res, 'translations');
  }

  private async parseAndHandleAudio(
    req: FastifyRequest,
    res: FastifyReply,
    operation: 'transcriptions' | 'translations',
  ): Promise<void> {
    try {
      const body = await parseAudioMultipartRequest(req);
      if (operation === 'transcriptions') {
        await this.operations.audioTranscriptions(body, req, res);
      } else {
        await this.operations.audioTranslations(body, req, res);
      }
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).send({
        error: {
          code: 'invalid_multipart_form',
          message: error instanceof Error ? error.message : 'Invalid multipart request.',
          param: 'file',
          type: 'invalid_request_error',
        },
      });
    }
  }
}
