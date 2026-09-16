import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export type SendMailPayload = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  from: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

@Injectable()
export class MailRelayService {
  private readonly logger = new Logger(MailRelayService.name);

  constructor(private readonly settings: SettingsService) {}

  async send(payload: SendMailPayload): Promise<{
    ok: boolean;
    messageId?: string;
    response?: string;
  }> {
    const base = await this.settings.getMailserverUrl();
    const apiKey = await this.settings.getSecret('mailserverApiKey');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const response = await fetch(`${base}/api/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text().catch(() => '');
    let parsed: {
      ok?: boolean;
      messageId?: string;
      response?: string;
      error?: string;
      detail?: string;
    } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!response.ok) {
      const msg =
        parsed.detail ||
        parsed.error ||
        `Mailserver HTTP ${response.status}: ${text.slice(0, 200)}`;
      this.logger.error(msg);
      throw new Error(msg);
    }
    return {
      ok: true,
      messageId: parsed.messageId,
      response: parsed.response,
    };
  }
}
