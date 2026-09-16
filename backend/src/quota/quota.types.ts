export type QuotaPeriod = 'daily' | 'monthly' | 'pool' | 'unlimited';
export type QuotaTier = 1 | 2 | 3;

export type QuotaKind = 'search' | 'mail';

export type ProviderQuotaMeta = {
  label: string;
  period: QuotaPeriod;
  /** Soft free-tier limit; null = unlimited */
  limit: number | null;
  /** 1 = daily prefer, 2 = monthly, 3 = last resort */
  tier: QuotaTier;
  /** Exclude from auto search rotation (e.g. Firecrawl scrape-only) */
  excludeFromSearchRotation?: boolean;
  /** Exclude from auto mail routing (e.g. console) */
  excludeFromMailAuto?: boolean;
};

export type UsageItem = {
  id: string;
  label: string;
  configured: boolean;
  period: QuotaPeriod;
  tier: QuotaTier;
  limit: number | null;
  used: number;
  remaining: number | null;
  exhausted: boolean;
  resetLabel: string;
};

export type UsageSnapshot = {
  generatedAt: string;
  timezone: 'UTC';
  mail: {
    mode: 'auto' | 'locked';
    lockedProvider: string | null;
    nextProvider: string | null;
    items: UsageItem[];
  };
  search: {
    nextProvider: string | null;
    items: UsageItem[];
  };
};

export class QuotaExhaustedError extends Error {
  constructor(message = 'Tous les quotas sont épuisés') {
    super(message);
    this.name = 'QuotaExhaustedError';
  }
}

export function isQuotaHttpError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /HTTP 429|quota|rate.?limit|too many requests|credits? (exhausted|exceeded|depleted)|limit exceeded/i.test(
    msg,
  );
}
