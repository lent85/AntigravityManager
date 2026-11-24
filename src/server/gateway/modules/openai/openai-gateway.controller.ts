import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';

import { AdminGuard } from '../../guards/admin.guard';
import { ProxyGuard } from '../../guards/proxy.guard';
import { OpenAIOperations } from './openai-operations.service';

@Controller('v1/gateway')
export class OpenAIGatewayController {
  public constructor(@Inject(OpenAIOperations) private readonly operations: OpenAIOperations) {}

  @Get('quote')
  @UseGuards(ProxyGuard)
  public quote(@Res() res: FastifyReply): void {
    this.operations.listModelsQuote(res);
  }

  @Get('quota')
  @UseGuards(AdminGuard)
  public quota(@Res() res: FastifyReply): void {
    this.operations.getGatewayQuotaSummary(res);
  }
}

@Controller('v1/dashboard/billing')
@UseGuards(AdminGuard)
export class OpenAIBillingController {
  public constructor(@Inject(OpenAIOperations) private readonly operations: OpenAIOperations) {}

  @Get('usage')
  public usage(@Res() res: FastifyReply): Promise<void> {
    return this.operations.getDashboardBillingUsage(res);
  }
}
