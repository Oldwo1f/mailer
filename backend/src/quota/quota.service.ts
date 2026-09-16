import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ProviderUsage,
  type QuotaKind,
  type QuotaPeriodKind,
} from '../entities/provider-usage.entity';
import {
  MAIL_PROVIDER_META,
  MAIL_PROVIDERS,
  SettingsService,
  type MailProviderSetting,
} from '../settings/settings.service';
import {
  SEARCH_AUTO_ORDER,
  WEB_SEARCH_PROVIDER_META,
  WEB_SEARCH_PROVIDERS,
  type WebSearchProvider,
} from '../search/web-search.types';
import {
  QuotaExhaustedError,
  type QuotaPeriod,
  type UsageItem,
  type UsageSnapshot,
} from './quota.types';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);
  /** Round-robin within same tier for mail daily providers */
  private mailRr = 0;

  constructor(
    @InjectRepository(ProviderUsage)
    private readonly usage: Repository<ProviderUsage>,
    private readonly settings: SettingsService,
    private readonly config: ConfigService,
  ) {}

  periodKeyFor(period: QuotaPeriod, now = new Date()): string {
    if (period === 'daily') return now.toISOString().slice(0, 10);
    if (period === 'monthly') return now.toISOString().slice(0, 7);
    if (period === 'pool') return 'lifetime';
    return 'unlimited';
  }

  periodKindFor(period: QuotaPeriod): QuotaPeriodKind | null {
    if (period === 'daily' || period === 'monthly' || period === 'pool') {
      return period;
    }
    return null;
  }

  resetLabel(period: QuotaPeriod, periodKey: string): string {
    if (period === 'daily') return `aujourd’hui (UTC) · ${periodKey}`;
    if (period === 'monthly') {
      const [y, m] = periodKey.split('-');
      const months = [
        'janvier',
        'février',
        'mars',
        'avril',
        'mai',
        'juin',
        'juillet',
        'août',
        'septembre',
        'octobre',
        'novembre',
        'décembre',
      ];
      const idx = Number(m) - 1;
      const label = months[idx] ?? periodKey;
      return `${label} ${y}`;
    }
    if (period === 'pool') return 'pool free (lifetime)';
    return 'illimité';
  }

  async getUsageRow(
    kind: QuotaKind,
    provider: string,
    period: QuotaPeriod,
  ): Promise<ProviderUsage | null> {
    const periodKind = this.periodKindFor(period);
    if (!periodKind) return null;
    const periodKey = this.periodKeyFor(period);
    return this.usage.findOneBy({ kind, provider, periodKey });
  }

  async getUsed(
    kind: QuotaKind,
    provider: string,
    period: QuotaPeriod,
  ): Promise<{ used: number; exhausted: boolean }> {
    const row = await this.getUsageRow(kind, provider, period);
    return {
      used: row?.used ?? 0,
      exhausted: Boolean(row?.exhaustedAt),
    };
  }

  async hasCapacity(
    kind: QuotaKind,
    provider: string,
    period: QuotaPeriod,
    limit: number | null,
  ): Promise<boolean> {
    if (period === 'unlimited' || limit == null) return true;
    const { used, exhausted } = await this.getUsed(kind, provider, period);
    if (exhausted) return false;
    return used < limit;
  }

  async recordSuccess(kind: QuotaKind, provider: string): Promise<void> {
    const meta = this.metaFor(kind, provider);
    if (!meta || meta.period === 'unlimited' || meta.limit == null) return;
    const periodKind = this.periodKindFor(meta.period);
    if (!periodKind) return;
    const periodKey = this.periodKeyFor(meta.period);

    let row = await this.usage.findOneBy({ kind, provider, periodKey });
    if (!row) {
      row = this.usage.create({
        kind,
        provider,
        periodKind,
        periodKey,
        used: 0,
        exhaustedAt: null,
      });
    }
    row.used += 1;
    if (row.used >= meta.limit) {
      row.exhaustedAt = row.exhaustedAt ?? new Date();
    }
    await this.usage.save(row);
  }

  async markExhausted(kind: QuotaKind, provider: string): Promise<void> {
    const meta = this.metaFor(kind, provider);
    if (!meta || meta.period === 'unlimited') return;
    const periodKind = this.periodKindFor(meta.period);
    if (!periodKind) return;
    const periodKey = this.periodKeyFor(meta.period);

    let row = await this.usage.findOneBy({ kind, provider, periodKey });
    if (!row) {
      row = this.usage.create({
        kind,
        provider,
        periodKind,
        periodKey,
        used: 0,
        exhaustedAt: null,
      });
    }
    row.exhaustedAt = new Date();
    await this.usage.save(row);
    this.logger.warn(`${kind}/${provider} marked exhausted for ${periodKey}`);
  }

  /**
   * Pick next provider with remaining capacity.
   * @param exclude skip these (already tried in this request)
   */
  async pick(
    kind: QuotaKind,
    exclude: string[] = [],
  ): Promise<string | null> {
    if (kind === 'search') {
      return this.pickSearch(exclude);
    }
    return this.pickMail(exclude);
  }

  async pickOrThrow(kind: QuotaKind, exclude: string[] = []): Promise<string> {
    const id = await this.pick(kind, exclude);
    if (!id) {
      throw new QuotaExhaustedError(
        kind === 'mail'
          ? 'Aucun provider email avec quota disponible'
          : 'Aucun provider de recherche avec quota disponible',
      );
    }
    return id;
  }

  private async pickSearch(exclude: string[]): Promise<string | null> {
    for (const provider of SEARCH_AUTO_ORDER) {
      if (exclude.includes(provider)) continue;
      const meta = WEB_SEARCH_PROVIDER_META[provider];
      if (meta.excludeFromSearchRotation) continue;
      if (!(await this.isSearchConfigured(provider))) continue;
      if (
        await this.hasCapacity('search', provider, meta.period, meta.limit)
      ) {
        return provider;
      }
    }
    return null;
  }

  private async pickMail(exclude: string[]): Promise<string | null> {
    const candidates: MailProviderSetting[] = [];
    for (const id of MAIL_PROVIDERS) {
      if (id === 'console') continue;
      if (exclude.includes(id)) continue;
      const meta = MAIL_PROVIDER_META[id];
      if (meta.excludeFromMailAuto) continue;
      if (!(await this.isMailConfigured(id))) continue;
      if (await this.hasCapacity('mail', id, meta.period, meta.limit)) {
        candidates.push(id);
      }
    }
    if (!candidates.length) return null;

    // Prefer lower tier; within same tier round-robin
    const minTier = Math.min(...candidates.map((id) => MAIL_PROVIDER_META[id].tier));
    const tierPool = candidates.filter(
      (id) => MAIL_PROVIDER_META[id].tier === minTier,
    );
    const chosen = tierPool[this.mailRr % tierPool.length]!;
    this.mailRr = (this.mailRr + 1) % 10_000;
    return chosen;
  }

  async isSearchConfigured(provider: WebSearchProvider): Promise<boolean> {
    const meta = WEB_SEARCH_PROVIDER_META[provider];
    const secretKey =
      provider === 'you' ? 'youApiKey' : (`${provider}ApiKey` as const);
    if (await this.settings.getSecret(secretKey)) return true;
    return meta.envKeys.some((k) =>
      Boolean(this.config.get<string>(k)?.trim()),
    );
  }

  async isMailConfigured(id: MailProviderSetting): Promise<boolean> {
    if (id === 'console') return true;
    if (id === 'resend') {
      return Boolean(await this.settings.getSecret('resendApiKey'));
    }
    if (id === 'brevo') {
      return Boolean(await this.settings.getSecret('brevoApiKey'));
    }
    if (id === 'sendgrid') {
      return Boolean(await this.settings.getSecret('sendgridApiKey'));
    }
    if (id === 'mailjet') {
      return Boolean(
        (await this.settings.getSecret('mailjetApiKey')) &&
          (await this.settings.getSecret('mailjetSecretKey')),
      );
    }
    if (id === 'mailgun') {
      return Boolean(
        (await this.settings.getSecret('mailgunApiKey')) &&
          (await this.settings.getMailgunDomain()),
      );
    }
    if (id === 'mailserver') {
      return Boolean(await this.settings.getSecret('mailserverApiKey'));
    }
    if (id === 'smtp') {
      return Boolean(await this.settings.getSmtpHost());
    }
    return false;
  }

  private metaFor(kind: QuotaKind, provider: string) {
    if (kind === 'search' && isWebSearchId(provider)) {
      return WEB_SEARCH_PROVIDER_META[provider];
    }
    if (kind === 'mail' && isMailId(provider)) {
      return MAIL_PROVIDER_META[provider];
    }
    return null;
  }

  async snapshot(): Promise<UsageSnapshot> {
    const mode = await this.settings.getMailProviderMode();
    const locked =
      mode === 'auto' ? null : ((await this.settings.getMailProvider()) as string);

    const searchItems: UsageItem[] = [];
    for (const id of WEB_SEARCH_PROVIDERS) {
      searchItems.push(await this.buildSearchItem(id));
    }
    searchItems.sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));

    const mailItems: UsageItem[] = [];
    for (const id of MAIL_PROVIDERS) {
      mailItems.push(await this.buildMailItem(id));
    }
    mailItems.sort((a, b) => a.tier - b.tier || a.label.localeCompare(b.label));

    return {
      generatedAt: new Date().toISOString(),
      timezone: 'UTC',
      mail: {
        mode: mode === 'auto' ? 'auto' : 'locked',
        lockedProvider: locked,
        nextProvider:
          mode === 'auto'
            ? await this.pick('mail')
            : locked && (await this.isMailConfigured(locked as MailProviderSetting))
              ? locked
              : await this.pick('mail'),
        items: mailItems,
      },
      search: {
        nextProvider: await this.pick('search'),
        items: searchItems,
      },
    };
  }

  private async buildSearchItem(id: WebSearchProvider): Promise<UsageItem> {
    const meta = WEB_SEARCH_PROVIDER_META[id];
    const configured = await this.isSearchConfigured(id);
    const { used, exhausted } = await this.getUsed(
      'search',
      id,
      meta.period,
    );
    const periodKey = this.periodKeyFor(meta.period);
    const remaining =
      meta.limit == null ? null : Math.max(0, meta.limit - used);
    return {
      id,
      label: meta.label,
      configured,
      period: meta.period,
      tier: meta.tier,
      limit: meta.limit,
      used: meta.period === 'unlimited' ? used : used,
      remaining,
      exhausted: exhausted || (meta.limit != null && used >= meta.limit),
      resetLabel: this.resetLabel(meta.period, periodKey),
    };
  }

  private async buildMailItem(id: MailProviderSetting): Promise<UsageItem> {
    const meta = MAIL_PROVIDER_META[id];
    const configured = await this.isMailConfigured(id);
    const { used, exhausted } =
      meta.period === 'unlimited'
        ? { used: 0, exhausted: false }
        : await this.getUsed('mail', id, meta.period);
    // For unlimited, still show lifetime sent count from current "unlimited" key if we tracked — we don't track
    let displayUsed = used;
    if (meta.period === 'unlimited') {
      // Approximate today's sends attributed? Skip — show 0 or count from sends table later
      displayUsed = 0;
    }
    const periodKey = this.periodKeyFor(meta.period);
    const remaining =
      meta.limit == null ? null : Math.max(0, meta.limit - displayUsed);
    return {
      id,
      label: meta.label,
      configured,
      period: meta.period,
      tier: meta.tier,
      limit: meta.limit,
      used: displayUsed,
      remaining,
      exhausted:
        meta.period !== 'unlimited' &&
        (exhausted || (meta.limit != null && displayUsed >= meta.limit)),
      resetLabel: this.resetLabel(meta.period, periodKey),
    };
  }
}

function isWebSearchId(value: string): value is WebSearchProvider {
  return (WEB_SEARCH_PROVIDERS as readonly string[]).includes(value);
}

function isMailId(value: string): value is MailProviderSetting {
  return (MAIL_PROVIDERS as readonly string[]).includes(value);
}
