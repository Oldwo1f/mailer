import {
  Body,
  Controller,
  Headers,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsISO8601, IsOptional, IsString } from 'class-validator';
import { createHash, timingSafeEqual } from 'crypto';
import { Public } from '../auth/public.decorator';
import { CommercialPipelineService } from './commercial-pipeline.service';

class InboundReplyDto {
  @IsEmail()
  fromEmail: string;

  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  subject?: string | null;

  @IsOptional()
  @IsString()
  messageId?: string | null;
}

@Controller('replies')
export class ReplyWebhookController {
  constructor(private readonly pipeline: CommercialPipelineService) {}

  @Public()
  @Post('inbound')
  ingest(
    @Headers('x-reply-webhook-secret') suppliedSecret: string | undefined,
    @Body() dto: InboundReplyDto,
  ) {
    const configuredSecret = process.env.REPLY_WEBHOOK_SECRET?.trim();
    if (!configuredSecret || configuredSecret.length < 24) {
      throw new ServiceUnavailableException(
        'REPLY_WEBHOOK_SECRET absent ou trop court sur le serveur',
      );
    }
    if (!suppliedSecret || !safeSecretEqual(suppliedSecret, configuredSecret)) {
      throw new UnauthorizedException('Webhook non autorisé');
    }

    return this.pipeline.recordInboundReply({
      fromEmail: dto.fromEmail,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : null,
      subject: dto.subject || null,
      messageId: dto.messageId || null,
    });
  }
}

function safeSecretEqual(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
