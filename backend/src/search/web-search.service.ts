import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { QuotaService } from '../quota/quota.service';
import { isQuotaHttpError } from '../quota/quota.types';
import {
  extractEmailsFromText,
  extractSameOriginContactUrls,
  isCompanyWebsite,
  isPublicHttpUrl,
} from '../prospects/prospect.utils';
import {
  SEARCH_AUTO_ORDER,
  WEB_SEARCH_PROVIDER_META,
  type WebSearchHit,
  type WebSearchOptions,
  type WebSearchProvider,
  type WebSearchResult,
} from './web-search.types';

@Injectable()
export class WebSearchService {
  private readonly logger = new Logger(WebSearchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly quota: QuotaService,
  ) {}

  async listConfiguredProviders(): Promise<WebSearchProvider[]> {
    const configured: WebSearchProvider[] = [];
    for (const provider of SEARCH_AUTO_ORDER) {
      if (await this.quota.isSearchConfigured(provider)) {
        configured.push(provider);
      }
    }
    if (await this.quota.isSearchConfigured('firecrawl')) {
      configured.push('firecrawl');
    }
    return configured;
  }

  async search(options: WebSearchOptions): Promise<WebSearchResult> {
    const query = options.query?.trim() ?? '';
    if (!query) throw new Error('query is required');

    if (options.provider) {
      if (!(await this.quota.isSearchConfigured(options.provider))) {
        throw new Error(`Provider « ${options.provider} » non configuré.`);
      }
      return this.runSearch(options.provider, options);
    }

    const tried: string[] = [];
    let lastError: unknown;

    while (true) {
      const provider = await this.quota.pick('search', tried);
      if (!provider) {
        if (lastError) throw lastError;
        throw new Error(
          'Aucun provider de recherche avec quota disponible. Ajoutez une clé ou attendez le reset.',
        );
      }
      tried.push(provider);
      try {
        return await this.runSearch(provider as WebSearchProvider, options);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        if (isQuotaHttpError(error)) {
          await this.quota.markExhausted('search', provider);
        }
        this.logger.warn(
          `${provider} failed (${message.slice(0, 120)}); trying next`,
        );
      }
    }
  }

  private async runSearch(
    provider: WebSearchProvider,
    options: WebSearchOptions,
  ): Promise<WebSearchResult> {
    const result = await this.searchWithProvider(provider, options);
    await this.quota.recordSuccess('search', provider);
    return result;
  }

  async scrapeUrl(
    url: string,
    options?: { maxChars?: number; onlyMainContent?: boolean },
  ): Promise<string | null> {
    const apiKey = await this.resolveApiKey('firecrawl');
    if (!apiKey) return null;

    const meta = WEB_SEARCH_PROVIDER_META.firecrawl;
    const ok = await this.quota.hasCapacity(
      'search',
      'firecrawl',
      meta.period,
      meta.limit,
    );
    if (!ok) {
      this.logger.warn('Firecrawl scrape skipped: monthly quota exhausted');
      return null;
    }

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: options?.onlyMainContent ?? true,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text().catch(() => '');
      if (!response.ok) {
        this.logger.warn(`Firecrawl scrape failed: ${response.status}`);
        if (response.status === 429) {
          await this.quota.markExhausted('search', 'firecrawl');
        }
        return null;
      }
      const parsed = JSON.parse(text) as {
        data?: { markdown?: string };
        markdown?: string;
      };
      const md = parsed.data?.markdown || parsed.markdown || '';
      await this.quota.recordSuccess('search', 'firecrawl');
      const maxChars = options?.maxChars ?? 4000;
      return md.trim().slice(0, maxChars) || null;
    } catch (err) {
      this.logger.warn(
        `Firecrawl scrape error: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /** Public HTML fetch (no Firecrawl quota). Blocks private/localhost URLs. */
  async fetchPublicPage(url: string): Promise<string | null> {
    if (!isPublicHttpUrl(url)) return null;
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.6',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return null;
      const ctype = response.headers.get('content-type') || '';
      if (ctype && !/html|xml|json|text/i.test(ctype)) return null;
      const buf = await response.arrayBuffer();
      const slice = buf.byteLength > 700_000 ? buf.slice(0, 700_000) : buf;
      const text = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      return text.trim() || null;
    } catch (err) {
      this.logger.warn(
        `Direct fetch failed ${url}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  /**
   * Emails on a public page: HTML fetch first, then Firecrawl if empty
   * (JS-rendered or blocked). Also returns same-origin contact/legal links.
   */
  async collectEmailsFromUrl(url: string): Promise<{
    emails: string[];
    extraUrls: string[];
    usedFirecrawl: boolean;
  }> {
    if (!isPublicHttpUrl(url) || !isCompanyWebsite(url)) {
      return { emails: [], extraUrls: [], usedFirecrawl: false };
    }
    const html = await this.fetchPublicPage(url);
    let emails = html ? extractEmailsFromText(html) : [];
    let extraUrls = html ? extractSameOriginContactUrls(html, url) : [];
    if (emails.length) {
      return { emails, extraUrls, usedFirecrawl: false };
    }
    // Prefer following a real /contact link over Firecrawl on a homepage.
    if (html && extraUrls.length) {
      return { emails: [], extraUrls, usedFirecrawl: false };
    }

    const raw = await this.firecrawlHtml(url);
    if (!raw) return { emails: [], extraUrls, usedFirecrawl: false };
    emails = extractEmailsFromText(raw);
    extraUrls = [
      ...new Set([...extraUrls, ...extractSameOriginContactUrls(raw, url)]),
    ];
    return { emails, extraUrls, usedFirecrawl: true };
  }

  private async firecrawlHtml(url: string): Promise<string | null> {
    const apiKey = await this.resolveApiKey('firecrawl');
    if (!apiKey) return null;

    const meta = WEB_SEARCH_PROVIDER_META.firecrawl;
    const ok = await this.quota.hasCapacity(
      'search',
      'firecrawl',
      meta.period,
      meta.limit,
    );
    if (!ok) {
      this.logger.warn('Firecrawl scrape skipped: monthly quota exhausted');
      return null;
    }

    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['html', 'markdown'],
          onlyMainContent: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const text = await response.text().catch(() => '');
      if (!response.ok) {
        this.logger.warn(`Firecrawl scrape failed: ${response.status}`);
        if (response.status === 429) {
          await this.quota.markExhausted('search', 'firecrawl');
        }
        return null;
      }
      const parsed = JSON.parse(text) as {
        data?: { markdown?: string; html?: string };
        markdown?: string;
        html?: string;
      };
      await this.quota.recordSuccess('search', 'firecrawl');
      const html = parsed.data?.html || parsed.html || '';
      const md = parsed.data?.markdown || parsed.markdown || '';
      return `${html}\n${md}`.trim() || null;
    } catch (err) {
      this.logger.warn(
        `Firecrawl scrape error: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private async searchWithProvider(
    provider: WebSearchProvider,
    options: WebSearchOptions,
  ): Promise<WebSearchResult> {
    switch (provider) {
      case 'tavily':
        return this.searchTavily(options);
      case 'you':
        return this.searchYou(options);
      case 'nimble':
        return this.searchNimble(options);
      case 'firecrawl':
        return this.searchFirecrawl(options);
      case 'serpapi':
        return this.searchSerpApi(options);
      case 'exa':
        return this.searchExa(options);
      default: {
        const _exhaustive: never = provider;
        throw new Error(`Unhandled provider: ${_exhaustive}`);
      }
    }
  }

  private clampMaxResults(n?: number) {
    return Math.min(Math.max(n ?? 5, 1), 10);
  }

  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
    }
  }

  private formatHttpError(label: string, status: number, text: string) {
    return `${label} HTTP ${status}: ${text.slice(0, 300)}`;
  }

  private async searchTavily(
    options: WebSearchOptions,
  ): Promise<WebSearchResult> {
    const apiKey = await this.requireKey('tavily');
    const maxResults = this.clampMaxResults(options.maxResults);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: options.query.trim(),
        max_results: maxResults,
        search_depth: options.searchDepth ?? 'basic',
        include_answer: true,
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(this.formatHttpError('Tavily', response.status, text));
    }
    const parsed = this.parseJson(text) as {
      answer?: string;
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        score?: number;
      }>;
    };
    const results: WebSearchHit[] = (parsed.results ?? [])
      .filter((h) => typeof h.url === 'string' && h.url.trim())
      .map((h) => ({
        title: (h.title ?? '').trim() || h.url!.trim(),
        url: h.url!.trim(),
        content: (h.content ?? '').trim(),
        score: typeof h.score === 'number' ? h.score : null,
      }));
    return {
      provider: 'tavily',
      query: options.query.trim(),
      answer: parsed.answer?.trim() || null,
      count: results.length,
      results,
    };
  }

  private async searchYou(options: WebSearchOptions): Promise<WebSearchResult> {
    const apiKey = await this.requireKey('you');
    const count = this.clampMaxResults(options.maxResults);
    const url = new URL('https://api.you.com/v1/search');
    url.searchParams.set('query', options.query.trim());
    url.searchParams.set('count', String(count));
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(this.formatHttpError('You.com', response.status, text));
    }
    const parsed = this.parseJson(text) as {
      results?: {
        web?: Array<{
          title?: string;
          url?: string;
          snippets?: string[];
          description?: string;
        }>;
      };
      answer?: string;
    };
    const raw = parsed.results?.web ?? [];
    const results: WebSearchHit[] = raw
      .filter((h) => typeof h.url === 'string' && h.url.trim())
      .slice(0, count)
      .map((h) => ({
        title: (h.title ?? '').trim() || h.url!.trim(),
        url: h.url!.trim(),
        content: (
          h.snippets?.filter(Boolean).join('\n') ||
          h.description ||
          ''
        ).trim(),
        score: null,
      }));
    return {
      provider: 'you',
      query: options.query.trim(),
      answer: parsed.answer?.trim() || null,
      count: results.length,
      results,
    };
  }

  private async searchNimble(
    options: WebSearchOptions,
  ): Promise<WebSearchResult> {
    const apiKey = await this.requireKey('nimble');
    const maxResults = this.clampMaxResults(options.maxResults);
    const response = await fetch('https://sdk.nimbleway.com/v2/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: options.query.trim(),
        max_results: maxResults,
        search_depth: options.searchDepth === 'advanced' ? 'deep' : 'lite',
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(this.formatHttpError('Nimble', response.status, text));
    }
    const parsed = this.parseJson(text) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
        snippet?: string;
      }>;
      answer?: string;
    };
    const results: WebSearchHit[] = (parsed.results ?? [])
      .filter((h) => typeof h.url === 'string' && h.url.trim())
      .map((h) => ({
        title: (h.title ?? '').trim() || h.url!.trim(),
        url: h.url!.trim(),
        content: (h.content || h.snippet || '').trim(),
        score: null,
      }));
    return {
      provider: 'nimble',
      query: options.query.trim(),
      answer: parsed.answer?.trim() || null,
      count: results.length,
      results,
    };
  }

  private async searchFirecrawl(
    options: WebSearchOptions,
  ): Promise<WebSearchResult> {
    const apiKey = await this.requireKey('firecrawl');
    const limit = this.clampMaxResults(options.maxResults);
    const response = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: options.query.trim(), limit }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(
        this.formatHttpError('Firecrawl', response.status, text),
      );
    }
    const parsed = this.parseJson(text) as {
      data?: {
        web?: Array<{
          title?: string;
          url?: string;
          description?: string;
          markdown?: string;
        }>;
      };
      web?: Array<{
        title?: string;
        url?: string;
        description?: string;
        markdown?: string;
      }>;
    };
    const raw = parsed.data?.web ?? parsed.web ?? [];
    const results: WebSearchHit[] = raw
      .filter((h) => typeof h.url === 'string' && h.url.trim())
      .map((h) => ({
        title: (h.title ?? '').trim() || h.url!.trim(),
        url: h.url!.trim(),
        content: (h.description || h.markdown || '').trim().slice(0, 2000),
        score: null,
      }));
    return {
      provider: 'firecrawl',
      query: options.query.trim(),
      answer: null,
      count: results.length,
      results,
    };
  }

  private async searchSerpApi(
    options: WebSearchOptions,
  ): Promise<WebSearchResult> {
    const apiKey = await this.requireKey('serpapi');
    const num = this.clampMaxResults(options.maxResults);
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google');
    url.searchParams.set('q', options.query.trim());
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('num', String(num));
    url.searchParams.set('hl', 'fr');
    url.searchParams.set('gl', 'fr');
    const page = Math.max(options.page ?? 1, 1);
    if (page > 1) {
      url.searchParams.set('start', String((page - 1) * num));
    }
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(this.formatHttpError('SerpAPI', response.status, text));
    }
    const parsed = this.parseJson(text) as {
      organic_results?: Array<{
        title?: string;
        link?: string;
        snippet?: string;
      }>;
      answer_box?: { answer?: string; snippet?: string };
      error?: string;
    };
    if (parsed.error) throw new Error(`SerpAPI: ${parsed.error}`);
    const results: WebSearchHit[] = (parsed.organic_results ?? [])
      .filter((h) => typeof h.link === 'string' && h.link.trim())
      .map((h) => ({
        title: (h.title ?? '').trim() || h.link!.trim(),
        url: h.link!.trim(),
        content: (h.snippet ?? '').trim(),
        score: null,
      }));
    return {
      provider: 'serpapi',
      query: options.query.trim(),
      answer:
        parsed.answer_box?.answer?.trim() ||
        parsed.answer_box?.snippet?.trim() ||
        null,
      count: results.length,
      results,
    };
  }

  private async searchExa(options: WebSearchOptions): Promise<WebSearchResult> {
    const apiKey = await this.requireKey('exa');
    const numResults = this.clampMaxResults(options.maxResults);
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: options.query.trim(),
        numResults,
        type: options.searchDepth === 'advanced' ? 'deep' : 'auto',
        contents: {
          highlights: true,
          text: { maxCharacters: 1500 },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(this.formatHttpError('Exa', response.status, text));
    }
    const parsed = this.parseJson(text) as {
      results?: Array<{
        title?: string;
        url?: string;
        text?: string;
        highlights?: string[];
        score?: number;
      }>;
    };
    const results: WebSearchHit[] = (parsed.results ?? [])
      .filter((h) => typeof h.url === 'string' && h.url.trim())
      .map((h) => ({
        title: (h.title ?? '').trim() || h.url!.trim(),
        url: h.url!.trim(),
        content: (
          h.highlights?.filter(Boolean).join('\n') ||
          h.text ||
          ''
        )
          .trim()
          .slice(0, 2000),
        score: typeof h.score === 'number' ? h.score : null,
      }));
    return {
      provider: 'exa',
      query: options.query.trim(),
      answer: null,
      count: results.length,
      results,
    };
  }

  private async requireKey(provider: WebSearchProvider): Promise<string> {
    const key = await this.resolveApiKey(provider);
    if (!key) {
      const meta = WEB_SEARCH_PROVIDER_META[provider];
      throw new Error(
        `${meta.label} non configuré — ${meta.envKeys.join(' / ')}`,
      );
    }
    return key;
  }

  async resolveApiKey(provider: WebSearchProvider): Promise<string | null> {
    const meta = WEB_SEARCH_PROVIDER_META[provider];
    const secretKey =
      provider === 'you' ? 'youApiKey' : (`${provider}ApiKey` as const);
    const fromSettings = await this.settings.getSecret(secretKey);
    if (fromSettings) return fromSettings;
    for (const envKey of meta.envKeys) {
      const v = this.config.get<string>(envKey)?.trim();
      if (v) return v;
    }
    return null;
  }
}
