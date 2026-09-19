import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { IsEmail, IsISO8601, IsOptional, IsString } from 'class-validator';
import { createHash, timingSafeEqual } from 'crypto';
import { Webhook } from 'svix';
import { Public } from '../auth/public.decorator';
import { CommercialPipelineService } from './commercial-pipeline.service';
import { AurelMeetingService } from './aurel-meeting.service';
import { SettingsService } from '../settings/settings.service';
import { MailService } from '../mail/mail.service';
import { extractEmail, freshReplyText } from './reply-webhook.helpers';

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
  bodyText?: string | null;

  /** RFC Message-ID from Gmail when available, used to preserve threading. */
  @IsOptional()
  @IsString()
  replyToMessageId?: string | null;

  /** Stable relay id used only for deduplication. */
  @IsOptional()
  @IsString()
  messageId?: string | null;
}

@Controller('replies')
export class ReplyWebhookController {
  constructor(
    private readonly pipeline: CommercialPipelineService,
    private readonly meetings: AurelMeetingService,
    private readonly settings: SettingsService,
    private readonly mail: MailService,
  ) {}

  /**
   * Resend receiving webhook. The signature is checked against the untouched
   * request bytes, then the full email is fetched with the already configured
   * Resend API key. This is separate from the provider-neutral relay endpoint.
   */
  @Public()
  @Post('resend')
  @HttpCode(200)
  async ingestResend(
    @Req() request: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string | undefined,
    @Headers('svix-timestamp') svixTimestamp: string | undefined,
    @Headers('svix-signature') svixSignature: string | undefined,
  ) {
    const webhookSecret = await this.settings.getSecret('resendWebhookSecret');
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Secret webhook Resend non configuré',
      );
    }
    if (!request.rawBody || !svixId || !svixTimestamp || !svixSignature) {
      throw new UnauthorizedException('Signature Resend absente');
    }

    let event: ResendReceivedEvent;
    try {
      event = new Webhook(webhookSecret).verify(
        request.rawBody.toString('utf8'),
        {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        },
      ) as ResendReceivedEvent;
    } catch {
      throw new UnauthorizedException('Signature Resend invalide');
    }

    if (event.type !== 'email.received') {
      return { ok: true, ignored: true };
    }

    const values = await this.settings.getRaw();
    const inboundAddress = String(values.resendInboundAddress || '')
      .trim()
      .toLowerCase();
    if (!inboundAddress) {
      throw new ServiceUnavailableException(
        'Adresse de réception Resend non configurée',
      );
    }
    const recipients = [
      ...(event.data.to || []),
      ...(event.data.received_for || []),
    ].map((value) => value.trim().toLowerCase());
    if (!recipients.includes(inboundAddress)) {
      return { ok: true, ignored: true, reason: 'recipient_not_configured' };
    }

    const email = await this.retrieveResendEmail(event.data.email_id);
    const fromEmail = extractEmail(email.from || event.data.from);
    if (!fromEmail)
      return { ok: true, ignored: true, reason: 'invalid_sender' };
    const bodyText = freshReplyText(email.text || htmlToText(email.html || ''));
    const result = await this.pipeline.recordInboundReply({
      fromEmail,
      receivedAt: new Date(email.created_at || event.data.created_at),
      subject: email.subject || event.data.subject || null,
      bodyText: bodyText || null,
      replyToMessageId: email.message_id || event.data.message_id || null,
      messageId: `resend:${event.data.email_id}`,
    });

    let forwarded = false;
    let forwardError: string | null = null;
    const forwardTo = String(values.replyForwardTo || '').trim();
    if (forwardTo && result.matched && !result.duplicate) {
      try {
        await this.mail.send({
          to: forwardTo,
          from: 'Kynexy <contact@kynexy.fr>',
          replyTo: fromEmail,
          subject: `[Réponse prospect] ${email.subject || event.data.subject || '(sans objet)'}`,
          text: [
            `Réponse de ${fromEmail}`,
            '',
            bodyText || '(message sans texte)',
            '',
            'Aurel a enregistré la réponse et stoppé les relances automatiques.',
          ].join('\n'),
        });
        forwarded = true;
      } catch (error) {
        forwardError = error instanceof Error ? error.message : String(error);
      }
    }

    return { ...result, forwarded, forwardError };
  }

  private async retrieveResendEmail(
    emailId: string,
  ): Promise<ResendReceivedEmail> {
    const apiKey = await this.settings.getSecret('resendApiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException('Clé API Resend non configurée');
    }
    const response = await fetch(
      `https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const data = (await response
      .json()
      .catch(() => ({}))) as ResendReceivedEmail & {
      message?: string;
    };
    if (!response.ok) {
      throw new ServiceUnavailableException(
        data.message ||
          `Lecture email Resend impossible (HTTP ${response.status})`,
      );
    }
    return data;
  }

  @Public()
  @Post('inbound')
  async ingest(
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

    const result = await this.pipeline.recordInboundReply({
      fromEmail: dto.fromEmail,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : null,
      subject: dto.subject || null,
      bodyText: dto.bodyText || null,
      replyToMessageId: dto.replyToMessageId || null,
      messageId: dto.messageId || null,
    });
    const reply = result as typeof result & {
      matched?: boolean;
      duplicate?: boolean;
      prospectId?: string;
      replyIntent?: string | null;
      analysis?: { intent?: string | null } | null;
    };

    if (!reply.duplicate && reply.matched) {
      const meeting = await this.meetings.handle({
        prospectId: reply.prospectId,
        intent: reply.analysis?.intent || reply.replyIntent || null,
        fromEmail: dto.fromEmail,
        subject: dto.subject || null,
      });
      return { ...result, meeting };
    }

    return result;
  }
}

type ResendReceivedEvent = {
  type: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to?: string[];
    received_for?: string[];
    message_id?: string | null;
    subject?: string | null;
  };
};

type ResendReceivedEmail = {
  from?: string;
  created_at?: string;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  message_id?: string | null;
};

function htmlToText(html: string) {
  return html
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function safeSecretEqual(left: string, right: string) {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
