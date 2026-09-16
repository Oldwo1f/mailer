import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import {
  SettingsService,
  type MailProviderSetting,
} from '../settings/settings.service';
import { MailRelayService, type SendMailPayload } from './mail-relay.service';
import { QuotaService } from '../quota/quota.service';
import {
  isQuotaHttpError,
  QuotaExhaustedError,
} from '../quota/quota.types';

export type MailProviderId = MailProviderSetting;

type ParsedFrom = { email: string; name?: string };

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly settings: SettingsService,
    private readonly mailRelay: MailRelayService,
    private readonly quota: QuotaService,
  ) {}

  async send(payload: SendMailPayload): Promise<{
    ok: boolean;
    messageId?: string;
    provider: MailProviderId;
    response?: string;
  }> {
    const mode = await this.settings.getMailProviderMode();

    if (mode !== 'auto') {
      this.logger.log(
        `Sending via ${mode} (locked) → ${Array.isArray(payload.to) ? payload.to.join(',') : payload.to}`,
      );
      try {
        const result = await this.dispatch(mode, payload);
        await this.quota.recordSuccess('mail', mode);
        return result;
      } catch (error) {
        if (isQuotaHttpError(error)) {
          await this.quota.markExhausted('mail', mode);
        }
        throw error;
      }
    }

    const tried: string[] = [];
    let lastError: unknown;

    while (true) {
      const provider = (await this.quota.pick('mail', tried)) as
        | MailProviderSetting
        | null;
      if (!provider) {
        if (lastError instanceof Error) throw lastError;
        throw new QuotaExhaustedError(
          'Aucun provider email avec quota disponible',
        );
      }
      tried.push(provider);
      this.logger.log(
        `Sending via ${provider} (auto) → ${Array.isArray(payload.to) ? payload.to.join(',') : payload.to}`,
      );
      try {
        const result = await this.dispatch(provider, payload);
        await this.quota.recordSuccess('mail', provider);
        return result;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (isQuotaHttpError(error)) {
          await this.quota.markExhausted('mail', provider);
        }
        this.logger.warn(
          `${provider} failed (${message.slice(0, 120)}); trying next`,
        );
      }
    }
  }

  private async dispatch(
    provider: MailProviderSetting,
    payload: SendMailPayload,
  ) {
    switch (provider) {
      case 'resend':
        return this.sendViaResend(payload);
      case 'brevo':
        return this.sendViaBrevo(payload);
      case 'sendgrid':
        return this.sendViaSendgrid(payload);
      case 'mailjet':
        return this.sendViaMailjet(payload);
      case 'mailgun':
        return this.sendViaMailgun(payload);
      case 'smtp':
        return this.sendViaSmtp(payload);
      case 'console':
        return this.sendViaConsole(payload);
      case 'mailserver':
      default:
        return {
          ...(await this.mailRelay.send(payload)),
          provider: 'mailserver' as const,
        };
    }
  }

  private parseFrom(from: string): ParsedFrom {
    const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
    if (match) {
      const name = match[1].replace(/^["']|["']$/g, '').trim();
      return { email: match[2].trim(), name: name || undefined };
    }
    return { email: from.trim() };
  }

  private toList(to: string | string[]): string[] {
    return Array.isArray(to) ? to : [to];
  }

  private async sendViaConsole(payload: SendMailPayload) {
    const id = `console:${Date.now()}`;
    this.logger.log(
      `[console] from=${payload.from} to=${payload.to} subject=${payload.subject}`,
    );
    return { ok: true, messageId: id, provider: 'console' as const };
  }

  private async sendViaResend(payload: SendMailPayload) {
    const apiKey = await this.settings.getSecret('resendApiKey');
    if (!apiKey) {
      throw new Error(
        'Clé Resend manquante. Configurez RESEND_API_KEY ou Réglages → Email.',
      );
    }

    const body: Record<string, unknown> = {
      from: payload.from,
      to: this.toList(payload.to),
      subject: payload.subject,
    };
    if (payload.html) body.html = payload.html;
    if (payload.text) body.text = payload.text;
    if (payload.replyTo) body.reply_to = payload.replyTo;
    if (payload.headers && Object.keys(payload.headers).length) {
      body.headers = payload.headers;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const parsed = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!response.ok) {
      throw new Error(
        parsed.message || parsed.name || `Resend HTTP ${response.status}`,
      );
    }

    return {
      ok: true,
      messageId: parsed.id,
      provider: 'resend' as const,
    };
  }

  private async sendViaBrevo(payload: SendMailPayload) {
    const apiKey = await this.settings.getSecret('brevoApiKey');
    if (!apiKey) {
      throw new Error(
        'Clé Brevo manquante. Configurez BREVO_API_KEY ou Réglages → Email.',
      );
    }

    const from = this.parseFrom(payload.from);
    const body: Record<string, unknown> = {
      sender: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      to: this.toList(payload.to).map((email) => ({ email })),
      subject: payload.subject,
    };
    if (payload.html) body.htmlContent = payload.html;
    if (payload.text) body.textContent = payload.text;
    if (payload.replyTo) {
      body.replyTo = { email: this.parseFrom(payload.replyTo).email };
    }
    if (payload.headers && Object.keys(payload.headers).length) {
      body.headers = payload.headers;
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const parsed = (await response.json().catch(() => ({}))) as {
      messageId?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(parsed.message || `Brevo HTTP ${response.status}`);
    }

    return {
      ok: true,
      messageId: parsed.messageId,
      provider: 'brevo' as const,
    };
  }

  private async sendViaSendgrid(payload: SendMailPayload) {
    const apiKey = await this.settings.getSecret('sendgridApiKey');
    if (!apiKey) {
      throw new Error(
        'Clé SendGrid manquante. Configurez SENDGRID_API_KEY ou Réglages → Email.',
      );
    }

    const from = this.parseFrom(payload.from);
    const content: Array<{ type: string; value: string }> = [];
    if (payload.text) content.push({ type: 'text/plain', value: payload.text });
    if (payload.html) content.push({ type: 'text/html', value: payload.html });
    if (!content.length) {
      content.push({ type: 'text/plain', value: payload.subject });
    }

    const body: Record<string, unknown> = {
      personalizations: [
        { to: this.toList(payload.to).map((email) => ({ email })) },
      ],
      from: { email: from.email, ...(from.name ? { name: from.name } : {}) },
      subject: payload.subject,
      content,
    };
    if (payload.replyTo) {
      body.reply_to = { email: this.parseFrom(payload.replyTo).email };
    }
    if (payload.headers && Object.keys(payload.headers).length) {
      body.headers = payload.headers;
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as {
        errors?: Array<{ message?: string }>;
      };
      throw new Error(
        err.errors?.[0]?.message || `SendGrid HTTP ${response.status}`,
      );
    }

    return {
      ok: true,
      messageId: response.headers.get('x-message-id') || undefined,
      provider: 'sendgrid' as const,
    };
  }

  private async sendViaMailjet(payload: SendMailPayload) {
    const apiKey = await this.settings.getSecret('mailjetApiKey');
    const secret = await this.settings.getSecret('mailjetSecretKey');
    if (!apiKey || !secret) {
      throw new Error(
        'Clés Mailjet manquantes (API + Secret). Configurez Réglages → Email.',
      );
    }

    const from = this.parseFrom(payload.from);
    const message: Record<string, unknown> = {
      From: { Email: from.email, ...(from.name ? { Name: from.name } : {}) },
      To: this.toList(payload.to).map((Email) => ({ Email })),
      Subject: payload.subject,
    };
    if (payload.html) message.HTMLPart = payload.html;
    if (payload.text) message.TextPart = payload.text;
    if (payload.replyTo) {
      message.ReplyTo = { Email: this.parseFrom(payload.replyTo).email };
    }
    if (payload.headers && Object.keys(payload.headers).length) {
      message.Headers = payload.headers;
    }

    const auth = Buffer.from(`${apiKey}:${secret}`).toString('base64');
    const response = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Messages: [message] }),
      signal: AbortSignal.timeout(60_000),
    });

    const parsed = (await response.json().catch(() => ({}))) as {
      Messages?: Array<{
        Status?: string;
        To?: Array<{ MessageID?: number }>;
        Errors?: Array<{ ErrorMessage?: string }>;
      }>;
      ErrorMessage?: string;
    };

    if (!response.ok) {
      const msg =
        parsed.Messages?.[0]?.Errors?.[0]?.ErrorMessage ||
        parsed.ErrorMessage ||
        `Mailjet HTTP ${response.status}`;
      throw new Error(msg);
    }

    const messageId = parsed.Messages?.[0]?.To?.[0]?.MessageID;
    return {
      ok: true,
      messageId: messageId != null ? String(messageId) : undefined,
      provider: 'mailjet' as const,
    };
  }

  private async sendViaMailgun(payload: SendMailPayload) {
    const apiKey = await this.settings.getSecret('mailgunApiKey');
    const domain = await this.settings.getMailgunDomain();
    if (!apiKey || !domain) {
      throw new Error(
        'Mailgun incomplet (API key + domaine). Configurez Réglages → Email.',
      );
    }

    const form = new URLSearchParams();
    form.set('from', payload.from);
    for (const to of this.toList(payload.to)) form.append('to', to);
    form.set('subject', payload.subject);
    if (payload.html) form.set('html', payload.html);
    if (payload.text) form.set('text', payload.text);
    if (payload.replyTo) form.set('h:Reply-To', payload.replyTo);
    if (payload.headers) {
      for (const [k, v] of Object.entries(payload.headers)) {
        form.set(`h:${k}`, v);
      }
    }

    const auth = Buffer.from(`api:${apiKey}`).toString('base64');
    const response = await fetch(
      `https://api.mailgun.net/v3/${encodeURIComponent(domain)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(60_000),
      },
    );

    const parsed = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    if (!response.ok) {
      throw new Error(parsed.message || `Mailgun HTTP ${response.status}`);
    }

    return {
      ok: true,
      messageId: parsed.id,
      provider: 'mailgun' as const,
    };
  }

  private async sendViaSmtp(payload: SendMailPayload) {
    const host = await this.settings.getSmtpHost();
    if (!host) {
      throw new Error(
        'SMTP_HOST manquant. Configurez le SMTP direct dans Réglages → Email.',
      );
    }
    const port = await this.settings.getSmtpPort();
    const secure = await this.settings.getSmtpSecure();
    const user = await this.settings.getSecret('smtpUser');
    const pass = await this.settings.getSecret('smtpPass');

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    const info = await transporter.sendMail({
      from: payload.from,
      to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      replyTo: payload.replyTo,
      headers: payload.headers,
    });

    return {
      ok: true,
      messageId: info.messageId,
      response: info.response,
      provider: 'smtp' as const,
    };
  }
}
