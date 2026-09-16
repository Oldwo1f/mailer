import type { ProviderQuotaMeta } from '../quota/quota.types';

export const WEB_SEARCH_PROVIDERS = [
  'tavily',
  'you',
  'nimble',
  'firecrawl',
  'serpapi',
  'exa',
] as const;

export type WebSearchProvider = (typeof WEB_SEARCH_PROVIDERS)[number];

export function isWebSearchProvider(
  value: unknown,
): value is WebSearchProvider {
  return (
    typeof value === 'string' &&
    (WEB_SEARCH_PROVIDERS as readonly string[]).includes(value)
  );
}

export type WebSearchHit = {
  title: string;
  url: string;
  content: string;
  score: number | null;
};

export type WebSearchResult = {
  provider: WebSearchProvider;
  query: string;
  answer: string | null;
  count: number;
  results: WebSearchHit[];
};

export type WebSearchOptions = {
  query: string;
  provider?: WebSearchProvider;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  /** 1-based page for providers that support offset (SerpAPI) */
  page?: number;
};

export const WEB_SEARCH_PROVIDER_META: Record<
  WebSearchProvider,
  {
    label: string;
    freeTierHint: string;
    docsUrl: string;
    envKeys: string[];
  } & ProviderQuotaMeta
> = {
  you: {
    label: 'You.com',
    freeTierHint: '~100 recherches web / jour',
    docsUrl: 'https://you.com/platform',
    envKeys: ['YDC_API_KEY', 'YOU_API_KEY'],
    period: 'daily',
    limit: 100,
    tier: 1,
  },
  tavily: {
    label: 'Tavily',
    freeTierHint: '~1000 crédits / mois (estimation)',
    docsUrl: 'https://tavily.com',
    envKeys: ['TAVILY_API_KEY'],
    period: 'monthly',
    limit: 1000,
    tier: 2,
  },
  serpapi: {
    label: 'SerpAPI',
    freeTierHint: '~250 recherches / mois',
    docsUrl: 'https://serpapi.com/pricing',
    envKeys: ['SERPAPI_API_KEY'],
    period: 'monthly',
    limit: 250,
    tier: 2,
  },
  exa: {
    label: 'Exa',
    freeTierHint: '~10$ de crédits offerts / mois',
    docsUrl: 'https://exa.ai',
    envKeys: ['EXA_API_KEY'],
    period: 'monthly',
    limit: 1000,
    tier: 2,
  },
  nimble: {
    label: 'Nimble',
    freeTierHint: '~5K requêtes free',
    docsUrl: 'https://www.nimbleway.com/pricing',
    envKeys: ['NIMBLE_API_KEY'],
    period: 'pool',
    limit: 5000,
    tier: 3,
  },
  firecrawl: {
    label: 'Firecrawl',
    freeTierHint: '~1000 crédits / mois (search + scrape)',
    docsUrl: 'https://www.firecrawl.dev/pricing',
    envKeys: ['FIRECRAWL_API_KEY'],
    period: 'monthly',
    limit: 1000,
    tier: 2,
    excludeFromSearchRotation: true,
  },
};

/** Auto-search order: tier then fixed preference within tier */
export const SEARCH_AUTO_ORDER: WebSearchProvider[] = [
  'you',
  'tavily',
  'serpapi',
  'exa',
  'nimble',
];
