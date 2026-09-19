import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from '../entities/app-settings.entity';
import type { ProviderQuotaMeta } from '../quota/quota.types';
import {
  WEB_SEARCH_PROVIDER_META,
  WEB_SEARCH_PROVIDERS,
} from '../search/web-search.types';

const SECRET_KEYS = [
  'openaiApiKey',
  'tavilyApiKey',
  'youApiKey',
  'nimbleApiKey',
  'firecrawlApiKey',
  'serpapiApiKey',
  'exaApiKey',
  'mailserverApiKey',
  'resendApiKey',
  'resendWebhookSecret',
  'brevoApiKey',
  'sendgridApiKey',
  'mailjetApiKey',
  'mailjetSecretKey',
  'mailgunApiKey',
  'smtpUser',
  'smtpPass',
] as const;

export type SecretKey = (typeof SECRET_KEYS)[number];

export const MAIL_PROVIDERS = [
  'resend',
  'brevo',
  'sendgrid',
  'mailjet',
  'mailgun',
  'mailserver',
  'smtp',
  'console',
] as const;

export type MailProviderSetting = (typeof MAIL_PROVIDERS)[number];
export type MailProviderMode = 'auto' | MailProviderSetting;

export const MAIL_PROVIDER_META: Record<
  MailProviderSetting,
  {
    label: string;
    hint: string;
    freeTierHint: string;
    docsUrl: string;
  } & ProviderQuotaMeta
> = {
  brevo: {
    label: 'Brevo',
    hint: 'ex-Sendinblue',
    freeTierHint: '~300 emails / jour',
    docsUrl: 'https://www.brevo.com',
    period: 'daily',
    limit: 300,
    tier: 1,
  },
  mailjet: {
    label: 'Mailjet',
    hint: 'API v3.1 (clé + secret)',
    freeTierHint: '~200 emails / jour',
    docsUrl: 'https://www.mailjet.com',
    period: 'daily',
    limit: 200,
    tier: 1,
  },
  sendgrid: {
    label: 'SendGrid',
    hint: 'Twilio SendGrid',
    freeTierHint: '~100 emails / jour',
    docsUrl: 'https://sendgrid.com',
    period: 'daily',
    limit: 100,
    tier: 1,
  },
  resend: {
    label: 'Resend',
    hint: 'API transactionnelle',
    freeTierHint: '~3 000 emails / mois',
    docsUrl: 'https://resend.com',
    period: 'monthly',
    limit: 3000,
    tier: 2,
  },
  mailgun: {
    label: 'Mailgun',
    hint: 'API + domaine vérifié',
    freeTierHint: '~1000 emails / mois (essai)',
    docsUrl: 'https://www.mailgun.com',
    period: 'monthly',
    limit: 1000,
    tier: 2,
  },
  mailserver: {
    label: 'Mailserver SMTP',
    hint: 'Relay maison (conteneur)',
    freeTierHint: 'Illimité (votre SMTP)',
    docsUrl: 'https://nodemailer.com',
    period: 'unlimited',
    limit: null,
    tier: 3,
  },
  smtp: {
    label: 'SMTP direct',
    hint: 'Hostinger / autre (nodemailer)',
    freeTierHint: 'Illimité (votre hébergeur)',
    docsUrl: 'https://nodemailer.com/about/',
    period: 'unlimited',
    limit: null,
    tier: 3,
  },
  console: {
    label: 'Console (dev)',
    hint: 'Log uniquement — pas d’envoi réel',
    freeTierHint: 'Dev only',
    docsUrl: '',
    period: 'unlimited',
    limit: null,
    tier: 3,
    excludeFromMailAuto: true,
  },
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings)
    private readonly repo: Repository<AppSettings>,
    private readonly config: ConfigService,
  ) {}

  async getRaw(): Promise<Record<string, string | number | boolean | null>> {
    const row = await this.repo.findOneBy({ id: 'default' });
    return { ...(row?.values ?? {}) };
  }

  async getPublic() {
    const values = await this.getRaw();
    const secrets: Record<string, boolean> = {};
    for (const key of SECRET_KEYS) {
      secrets[key] = Boolean(await this.getSecret(key));
    }

    const providers = WEB_SEARCH_PROVIDERS.map((p) => ({
      id: p,
      ...WEB_SEARCH_PROVIDER_META[p],
      configured:
        secrets[`${p === 'you' ? 'you' : p}ApiKey` as SecretKey] ||
        WEB_SEARCH_PROVIDER_META[p].envKeys.some((k) =>
          Boolean(this.config.get<string>(k)?.trim()),
        ),
    }));

    const openaiConfigured = Boolean(await this.getSecret('openaiApiKey'));

    return {
      publicUrl:
        (values.publicUrl as string) ||
        this.config.get('PUBLIC_URL') ||
        'http://localhost:3001',
      mailserverUrl: await this.getMailserverUrl(),
      sendDelayMs:
        Number(values.sendDelayMs) ||
        Number(this.config.get('SEND_DELAY_MS')) ||
        30000,
      openaiModel: await this.getOpenaiModel(),
      openaiConfigured,
      llmConfigured: openaiConfigured,
      productionSecretsLocked: false,
      mailserverApiKeyConfigured: Boolean(
        await this.getSecret('mailserverApiKey'),
      ),
      mailProvider: await this.getMailProviderMode(),
      mailProviders: await this.listMailProviders(),
      resendConfigured: Boolean(await this.getSecret('resendApiKey')),
      brevoConfigured: Boolean(await this.getSecret('brevoApiKey')),
      sendgridConfigured: Boolean(await this.getSecret('sendgridApiKey')),
      mailjetConfigured: Boolean(
        (await this.getSecret('mailjetApiKey')) &&
          (await this.getSecret('mailjetSecretKey')),
      ),
      mailgunConfigured: Boolean(
        (await this.getSecret('mailgunApiKey')) &&
          (await this.getMailgunDomain()),
      ),
      mailgunDomain: (await this.getMailgunDomain()) || '',
      smtpHost: (await this.getSmtpHost()) || '',
      smtpPort: await this.getSmtpPort(),
      smtpSecure: await this.getSmtpSecure(),
      mailFrom:
        (values.mailFrom as string) || this.config.get('MAIL_FROM') || '',
      mailFromName:
        (values.mailFromName as string) ||
        this.config.get('MAIL_FROM_NAME') ||
        '',
      resendInboundAddress: (values.resendInboundAddress as string) || '',
      replyForwardTo: (values.replyForwardTo as string) || '',
      providers,
      secrets,
    };
  }

  private async listMailProviders() {
    const out: Array<{
      id: MailProviderMode;
      label: string;
      hint: string;
      freeTierHint: string;
      docsUrl: string;
      period?: string;
      limit?: number | null;
      tier?: number;
      configured: boolean;
    }> = [
      {
        id: 'auto',
        label: 'Auto (quotas smart)',
        hint: 'Journalier → mensuel → SMTP',
        freeTierHint: 'Utilise les free tiers dans l’ordre',
        docsUrl: '',
        configured: true,
      },
    ];

    for (const id of MAIL_PROVIDERS) {
      let configured = true;
      if (id === 'resend') {
        configured = Boolean(await this.getSecret('resendApiKey'));
      } else if (id === 'brevo') {
        configured = Boolean(await this.getSecret('brevoApiKey'));
      } else if (id === 'sendgrid') {
        configured = Boolean(await this.getSecret('sendgridApiKey'));
      } else if (id === 'mailjet') {
        configured = Boolean(
          (await this.getSecret('mailjetApiKey')) &&
            (await this.getSecret('mailjetSecretKey')),
        );
      } else if (id === 'mailgun') {
        configured = Boolean(
          (await this.getSecret('mailgunApiKey')) &&
            (await this.getMailgunDomain()),
        );
      } else if (id === 'mailserver') {
        configured = Boolean(await this.getSecret('mailserverApiKey'));
      } else if (id === 'smtp') {
        configured = Boolean(await this.getSmtpHost());
      }

      const meta = MAIL_PROVIDER_META[id];
      out.push({
        id,
        label: meta.label,
        hint: meta.hint,
        freeTierHint: meta.freeTierHint,
        docsUrl: meta.docsUrl,
        period: meta.period,
        limit: meta.limit,
        tier: meta.tier,
        configured,
      });
    }

    return out;
  }

  async update(
    patch: Record<string, string | number | boolean | null | undefined>,
  ) {
    const row =
      (await this.repo.findOneBy({ id: 'default' })) ||
      this.repo.create({ id: 'default', values: {} });
    const values = { ...(row.values ?? {}) };

    for (const [key, val] of Object.entries(patch)) {
      if (val === undefined) continue;
      if (key === 'openrouterApiKey') continue;
      if (val === '' || val === null) {
        delete values[key];
      } else {
        values[key] = val as string | number | boolean;
      }
    }

    delete values.openrouterApiKey;
    row.values = values;
    await this.repo.save(row);
    return this.getPublic();
  }

  async getSecret(key: string): Promise<string | null> {
    const values = await this.getRaw();
    const fromDb = values[key];
    if (typeof fromDb === 'string' && fromDb.trim()) {
      return fromDb.trim();
    }

    const envMap: Record<string, string[]> = {
      openaiApiKey: ['OPENAI_API_KEY'],
      tavilyApiKey: ['TAVILY_API_KEY'],
      youApiKey: ['YDC_API_KEY', 'YOU_API_KEY'],
      nimbleApiKey: ['NIMBLE_API_KEY'],
      firecrawlApiKey: ['FIRECRAWL_API_KEY'],
      serpapiApiKey: ['SERPAPI_API_KEY'],
      exaApiKey: ['EXA_API_KEY'],
      mailserverApiKey: ['MAILSERVER_API_KEY'],
      resendApiKey: ['RESEND_API_KEY', 'RESEND__API_KEY'],
      resendWebhookSecret: ['RESEND_WEBHOOK_SECRET'],
      brevoApiKey: ['BREVO_API_KEY', 'SENDINBLUE_API_KEY'],
      sendgridApiKey: ['SENDGRID_API_KEY'],
      mailjetApiKey: ['MAILJET_API_KEY'],
      mailjetSecretKey: ['MAILJET_SECRET_KEY'],
      mailgunApiKey: ['MAILGUN_API_KEY'],
      smtpUser: ['SMTP_USER'],
      smtpPass: ['SMTP_PASS'],
    };

    for (const envKey of envMap[key] ?? []) {
      const v = this.config.get<string>(envKey)?.trim();
      if (v) return v;
    }
    return null;
  }

  async getPublicUrl(): Promise<string> {
    const values = await this.getRaw();
    return (
      (values.publicUrl as string) ||
      this.config.get('PUBLIC_URL') ||
      'http://localhost:3001'
    ).replace(/\/$/, '');
  }

  async getMailserverUrl(): Promise<string> {
    const values = await this.getRaw();
    return (
      (values.mailserverUrl as string) ||
      this.config.get('MAILSERVER_URL') ||
      'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
  }

  async getSendDelayMs(): Promise<number> {
    const values = await this.getRaw();
    return (
      Number(values.sendDelayMs) ||
      Number(this.config.get('SEND_DELAY_MS')) ||
      30000
    );
  }

  async getOpenaiModel(): Promise<string> {
    const values = await this.getRaw();
    let configured =
      (values.openaiModel as string) ||
      this.config.get('OPENAI_MODEL') ||
      'gpt-4o-mini';
    configured = configured.trim();
    if (configured.startsWith('openai/')) {
      configured = configured.slice('openai/'.length);
    }
    return configured || 'gpt-4o-mini';
  }

  async getLlmClientOptions(): Promise<{
    apiKey: string;
    provider: 'openai';
  }> {
    const openai = await this.getSecret('openaiApiKey');
    if (!openai) {
      throw new Error(
        'Clé OpenAI manquante. Configurez-la dans la page Config ou via OPENAI_API_KEY.',
      );
    }
    return { apiKey: openai, provider: 'openai' };
  }

  async getMailProvider(): Promise<MailProviderSetting> {
    const mode = await this.getMailProviderMode();
    if (mode !== 'auto') return mode;
    return 'resend';
  }

  async getMailProviderMode(): Promise<MailProviderMode> {
    const values = await this.getRaw();
    const raw = String(
      values.mailProvider || this.config.get('MAIL_PROVIDER') || 'auto',
    )
      .trim()
      .toLowerCase();
    if (raw === 'auto') return 'auto';
    if ((MAIL_PROVIDERS as readonly string[]).includes(raw)) {
      return raw as MailProviderSetting;
    }
    return 'auto';
  }

  async getMailgunDomain(): Promise<string | null> {
    const values = await this.getRaw();
    const domain =
      (values.mailgunDomain as string) ||
      this.config.get('MAILGUN_DOMAIN') ||
      '';
    return domain.trim() || null;
  }

  async getSmtpHost(): Promise<string | null> {
    const values = await this.getRaw();
    const host =
      (values.smtpHost as string) || this.config.get('SMTP_HOST') || '';
    return host.trim() || null;
  }

  async getSmtpPort(): Promise<number> {
    const values = await this.getRaw();
    return (
      Number(values.smtpPort) || Number(this.config.get('SMTP_PORT')) || 587
    );
  }

  async getSmtpSecure(): Promise<boolean> {
    const values = await this.getRaw();
    if (values.smtpSecure === true || values.smtpSecure === 'true') return true;
    if (values.smtpSecure === false || values.smtpSecure === 'false') {
      return false;
    }
    return this.config.get('SMTP_SECURE') === 'true';
  }
}
