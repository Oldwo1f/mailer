import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DiscoveryJob } from '../entities/discovery-job.entity';
import { ListsService } from '../lists/lists.service';
import { LlmService } from '../llm/llm.service';
import { WebSearchService } from '../search/web-search.service';
import type { WebSearchResult } from '../search/web-search.types';
import {
  extractEmailsFromText,
  isCompanyWebsite,
  isProspectEmail,
  isPublicHttpUrl,
  normalizeCompanyName,
  normalizeEmail,
} from '../prospects/prospect.utils';
import { QuotaExhaustedError, isQuotaHttpError } from '../quota/quota.types';
import {
  buildDiscoverQueries,
  buildEmailHuntQueries,
  contactPageUrls,
} from './discover.queries';
import {
  discoverLimits,
  isDiscoverBatchSize,
  type DiscoverBatchSize,
  type DiscoverCandidate,
  type DiscoverLimits,
} from './discover.types';

type RunState = {
  job: DiscoveryJob;
  location: string;
  batchSize: DiscoverBatchSize;
  limits: DiscoverLimits;
  followUps: number;
  maxFollowUps: number;
  evaluated: number;
  llmCalls: number;
};

@Injectable()
export class DiscoverService implements OnModuleInit {
  private readonly logger = new Logger(DiscoverService.name);
  private readonly cancelFlags = new Set<string>();

  constructor(
    @InjectRepository(DiscoveryJob)
    private readonly jobs: Repository<DiscoveryJob>,
    private readonly lists: ListsService,
    private readonly webSearch: WebSearchService,
    private readonly llm: LlmService,
  ) {}

  async onModuleInit() {
    const interrupted = await this.jobs.find({
      where: { status: In(['queued', 'running']) },
    });
    for (const job of interrupted) {
      job.status = 'error';
      job.message = 'Interrompu (redémarrage du serveur)';
      job.finishedAt = new Date();
      await this.jobs.save(job);
    }
  }

  listJobs(status?: string) {
    const qb = this.jobs
      .createQueryBuilder('j')
      .orderBy('j.createdAt', 'DESC')
      .take(20);
    if (status) qb.andWhere('j.status = :status', { status });
    return qb.getMany();
  }

  async findOne(id: string) {
    const job = await this.jobs.findOneBy({ id });
    if (!job) throw new NotFoundException('Job de découverte introuvable');
    return job;
  }

  async start(dto: {
    keywords: string;
    location?: string;
    listId?: string;
    newListName?: string;
    batchSize: number;
  }) {
    const keywords = dto.keywords?.trim() ?? '';
    if (keywords.length < 2) {
      throw new BadRequestException('Indiquez au moins un mot-clé');
    }
    if (!isDiscoverBatchSize(dto.batchSize)) {
      throw new BadRequestException('Taille de lot : 10, 50 ou 100');
    }

    const running = await this.jobs.findOne({
      where: { status: In(['queued', 'running']) },
    });
    if (running) {
      throw new ConflictException(
        `Une découverte est déjà en cours (« ${running.keywords} »). Annulez-la ou attendez la fin.`,
      );
    }

    const newListName = dto.newListName?.trim();
    const list = newListName
      ? await this.lists.create({
          name: newListName,
          description: `Découverte web : ${keywords}`,
        })
      : dto.listId
        ? await this.lists.findOne(dto.listId)
        : null;
    if (!list) {
      throw new BadRequestException(
        'Choisissez une liste existante ou un nom de nouvelle liste',
      );
    }

    const job = this.jobs.create({
      status: 'queued',
      keywords,
      location: dto.location?.trim() || 'Polynésie française',
      listId: list.id,
      listName: list.name,
      batchSize: dto.batchSize,
      found: 0,
      merged: 0,
      skipped: 0,
      searches: 0,
      scrapes: 0,
      message: 'En file…',
      log: [],
      results: { prospects: [] },
      finishedAt: null,
    });
    const saved = await this.jobs.save(job);
    void this.run(saved.id);
    return saved;
  }

  async cancel(id: string) {
    const job = await this.findOne(id);
    if (job.status === 'queued' || job.status === 'running') {
      this.cancelFlags.add(id);
      job.status = 'cancelled';
      job.message = 'Annulation demandée…';
      await this.jobs.save(job);
    }
    return this.findOne(id);
  }

  private async run(id: string) {
    const job = await this.findOne(id);
    if (job.status === 'cancelled' || this.cancelFlags.has(id)) {
      job.status = 'cancelled';
      job.message = 'Annulé';
      job.finishedAt = new Date();
      await this.jobs.save(job);
      this.cancelFlags.delete(id);
      return;
    }

    job.status = 'running';
    job.message = 'Démarrage…';
    await this.jobs.save(job);

    try {
      await this.execute(job);
    } catch (err) {
      this.logger.error(
        `Discovery ${id} failed: ${err instanceof Error ? err.message : err}`,
      );
      job.status = 'error';
      job.message = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date();
      await this.jobs.save(job);
    } finally {
      this.cancelFlags.delete(id);
    }
  }

  private async execute(job: DiscoveryJob) {
    const batchSize = job.batchSize as DiscoverBatchSize;
    const limits = discoverLimits(batchSize);
    const location = job.location || 'Polynésie française';
    const queries = buildDiscoverQueries(job.keywords, location, batchSize);
    const state: RunState = {
      job,
      location,
      batchSize,
      limits,
      followUps: 0,
      maxFollowUps: Math.max(10, Math.floor(limits.searches * 0.6)),
      evaluated: 0,
      llmCalls: 0,
    };

    await this.log(
      job,
      `Objectif : ${batchSize} nouveaux prospects avec email · ${queries.length} requêtes`,
    );

    for (let i = 0; i < queries.length; i++) {
      if (this.shouldStop(state)) break;
      if (job.searches >= limits.searches) break;

      const query = queries[i];
      await this.log(job, `Recherche ${i + 1}/${queries.length} : ${query}`);

      let result: WebSearchResult;
      try {
        result = await this.webSearch.search({
          query,
          maxResults: 10,
          searchDepth: 'basic',
          page: 1,
        });
        job.searches += 1;
        await this.jobs.save(job);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.log(job, `Recherche échouée : ${message.slice(0, 180)}`);
        if (
          err instanceof QuotaExhaustedError ||
          isQuotaHttpError(err) ||
          /aucun provider de recherche/i.test(message)
        ) {
          await this.log(job, 'Quota recherche épuisé — arrêt');
          break;
        }
        continue;
      }

      await sleep(250);

      const snippets = formatSnippets(result);
      let candidates: DiscoverCandidate[] = [];
      if (state.llmCalls < limits.llm) {
        try {
          candidates = await this.llm.extractProspectCandidates({
            keywords: job.keywords,
            location,
            searchSnippets: snippets,
          });
          state.llmCalls += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.log(job, `Extraction IA : ${message.slice(0, 180)}`);
          if (/clé openai|openai_api_key|api key/i.test(message)) {
            state.llmCalls = limits.llm;
          } else {
            state.llmCalls += 1;
          }
        }
      }

      for (const hit of result.results) {
        const emails = extractEmailsFromText(
          `${hit.title}\n${hit.content}\n${result.answer ?? ''}`,
        );
        if (!isCompanyWebsite(hit.url) && !emails.length) continue;
        const company = companyFromTitle(hit.title);
        if (!company || !isLikelyCompanyName(company)) continue;
        if (!emails.length && !isCompanyWebsite(hit.url)) continue;
        candidates.push({
          company,
          emails,
          website: isCompanyWebsite(hit.url) ? hit.url : null,
          contactName: null,
          commune: null,
          type: null,
          notes: hit.content.slice(0, 180) || null,
          sourceUrl: hit.url,
        });
      }

      for (const c of dedupeCandidates(candidates)) {
        if (this.shouldStop(state)) break;
        if (state.evaluated >= limits.candidates) break;
        state.evaluated += 1;
        await this.processCandidate(state, c);
      }
    }

    if (job.status === 'cancelled' || this.cancelFlags.has(job.id)) {
      job.status = 'cancelled';
      job.message = `Annulé — ${job.found}/${job.batchSize} trouvés`;
    } else {
      job.status = 'done';
      job.message =
        job.found >= job.batchSize
          ? `Terminé : ${job.found} nouveaux prospects avec email`
          : `Terminé : ${job.found}/${job.batchSize} avec email · ${job.merged} déjà connus · ${job.skipped} sans email`;
    }
    job.finishedAt = new Date();
    await this.jobs.save(job);
  }

  private shouldStop(state: RunState) {
    return (
      this.cancelFlags.has(state.job.id) ||
      state.job.status === 'cancelled' ||
      state.job.found >= state.batchSize
    );
  }

  private async processCandidate(state: RunState, raw: DiscoverCandidate) {
    const { job } = state;
    const company = raw.company.trim();
    if (company.length < 2) {
      job.skipped += 1;
      return;
    }

    let emails = uniqueEmails(raw.emails);
    let website =
      (raw.website && isCompanyWebsite(raw.website) ? raw.website : null) ||
      (raw.sourceUrl && isCompanyWebsite(raw.sourceUrl) ? raw.sourceUrl : null);

    if (!emails.length) {
      const hunted = await this.huntEmails(state, company, website);
      emails = hunted.emails;
      website = hunted.website || website;
    }

    if (!emails.length) {
      job.skipped += 1;
      await this.log(job, `Sans email : ${company}`);
      return;
    }
    if (!isLikelyCompanyName(company)) {
      job.skipped += 1;
      return;
    }

    const existing = await this.lists.findDuplicate(emails, company);
    if (existing) {
      await this.lists.addProspectToList(job.listId, existing);
      job.merged += 1;
      await this.log(job, `Déjà connu, ajouté à la liste : ${existing.company}`);
      const results = job.results ?? { prospects: [] };
      results.prospects = [
        ...results.prospects.filter((p) => p.id !== existing.id),
        {
          id: existing.id,
          company: existing.company,
          emails: existing.emails,
          created: false,
        },
      ];
      job.results = results;
      await this.jobs.save(job);
      return;
    }

    const { prospect, created } = await this.lists.upsertProspect({
      company,
      emails,
      contactName: raw.contactName,
      notes: raw.notes,
      profile: {
        ...(raw.type ? { type: raw.type } : {}),
        ...(raw.commune ? { commune: raw.commune } : {}),
        ...(website ? { sites_web: [website] } : {}),
        ...(raw.sourceUrl || website
          ? { source_url: raw.sourceUrl || website || undefined }
          : {}),
        ...(raw.notes ? { description: raw.notes } : {}),
        sources: ['web-discover'],
      },
    });
    await this.lists.addProspectToList(job.listId, prospect);

    const results = job.results ?? { prospects: [] };
    if (created) {
      job.found += 1;
      await this.log(
        job,
        `Nouveau (${job.found}/${job.batchSize}) : ${company} — ${emails.join(', ')}`,
      );
    } else {
      job.merged += 1;
      await this.log(job, `Déjà connu, ajouté à la liste : ${company}`);
    }
    results.prospects = [
      ...results.prospects.filter((p) => p.id !== prospect.id),
      {
        id: prospect.id,
        company: prospect.company,
        emails: prospect.emails,
        created,
      },
    ];
    job.results = results;
    await this.jobs.save(job);
  }

  private async huntEmails(
    state: RunState,
    company: string,
    website: string | null,
  ): Promise<{ emails: string[]; website: string | null }> {
    const { job, location, limits } = state;
    let emails: string[] = [];
    let site = website;
    const tried = new Set<string>();
    const queue: string[] = [];

    const enqueue = (url: string | null | undefined) => {
      if (!url || !isPublicHttpUrl(url) || !isCompanyWebsite(url)) return;
      const key = url.split('#')[0].replace(/\/+$/, '');
      if (!key || tried.has(key) || queue.some((q) => q.replace(/\/+$/, '') === key)) {
        return;
      }
      queue.push(url.split('#')[0]);
    };

    const drain = async () => {
      while (
        queue.length &&
        !emails.length &&
        !this.shouldStop(state) &&
        job.scrapes < limits.scrapes
      ) {
        const url = queue.shift()!;
        const key = url.replace(/\/+$/, '');
        if (tried.has(key)) continue;
        tried.add(key);
        job.scrapes += 1;
        const result = await this.webSearch.collectEmailsFromUrl(url);
        emails = uniqueEmails([...emails, ...result.emails]);
        for (const extra of result.extraUrls) enqueue(extra);
        await this.jobs.save(job);
        await sleep(150);
      }
    };

    if (site) {
      await this.log(job, `Email : scrape ${company}`);
      for (const url of contactPageUrls(site).slice(0, 10)) enqueue(url);
      await drain();
    }

    if (emails.length || this.shouldStop(state)) {
      return { emails, website: site };
    }

    const huntQueries = buildEmailHuntQueries(company, location, site);
    for (const query of huntQueries) {
      if (emails.length || this.shouldStop(state)) break;
      if (job.searches >= limits.searches) break;
      if (state.followUps >= state.maxFollowUps) break;
      try {
        await this.log(job, `Email : recherche « ${query.slice(0, 80)} »`);
        const extra = await this.webSearch.search({
          query,
          maxResults: 8,
          searchDepth: 'basic',
        });
        job.searches += 1;
        state.followUps += 1;
        emails = uniqueEmails([
          ...emails,
          ...extra.results.flatMap((h) =>
            extractEmailsFromText(`${h.title}\n${h.content}\n${h.url}`),
          ),
        ]);
        for (const hit of extra.results) {
          if (!isCompanyWebsite(hit.url)) continue;
          if (!site) site = hit.url;
          enqueue(hit.url);
        }
        if (site) {
          for (const url of contactPageUrls(site).slice(0, 10)) enqueue(url);
        }
        if (!emails.length) await drain();
        await this.jobs.save(job);
        await sleep(200);
      } catch (err) {
        this.logger.warn(
          `Email hunt search failed for ${company}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    return { emails, website: site };
  }

  private async log(job: DiscoveryJob, text: string) {
    const entry = { at: new Date().toISOString(), text };
    job.log = [...(job.log || []).slice(-79), entry];
    job.message = text;
    await this.jobs.save(job);
    this.logger.log(`[${job.id.slice(0, 8)}] ${text}`);
  }
}

function uniqueEmails(emails: string[]): string[] {
  const map = new Map<string, string>();
  for (const e of emails) {
    if (!isProspectEmail(e)) continue;
    map.set(normalizeEmail(e), normalizeEmail(e));
  }
  return [...map.values()];
}

function dedupeCandidates(candidates: DiscoverCandidate[]): DiscoverCandidate[] {
  const byName = new Map<string, DiscoverCandidate>();
  for (const c of candidates) {
    const key = normalizeCompanyName(c.company);
    if (!key) continue;
    const prev = byName.get(key);
    if (!prev) {
      byName.set(key, {
        ...c,
        emails: uniqueEmails(c.emails),
      });
      continue;
    }
    prev.emails = uniqueEmails([...prev.emails, ...c.emails]);
    if (!prev.website && c.website) prev.website = c.website;
    if (!prev.contactName && c.contactName) prev.contactName = c.contactName;
    if (!prev.commune && c.commune) prev.commune = c.commune;
    if (!prev.type && c.type) prev.type = c.type;
    if (!prev.notes && c.notes) prev.notes = c.notes;
    if (!prev.sourceUrl && c.sourceUrl) prev.sourceUrl = c.sourceUrl;
  }
  return [...byName.values()];
}

function formatSnippets(result: WebSearchResult): string {
  const parts = result.results.slice(0, 10).map(
    (h, i) => `${i + 1}. ${h.title}\nURL: ${h.url}\n${h.content.slice(0, 600)}`,
  );
  if (result.answer) parts.unshift(`Answer: ${result.answer}`);
  return parts.join('\n\n').slice(0, 12_000);
}

function companyFromTitle(title: string): string | null {
  const t = title.split(/\s[-–|•]\s/)[0]?.trim() ?? '';
  if (!isLikelyCompanyName(t)) return null;
  return t;
}

function isLikelyCompanyName(name: string): boolean {
  const t = name.trim();
  if (t.length < 2 || t.length > 70) return false;
  if (/\.{3}|…/.test(t)) return false;
  if (t.split(/\s+/).length > 8) return false;
  if (
    /^(the\s+\d+|top\s*\d+|best|guide|complete|legal notice|home|accueil|contact|facebook|instagram|linkedin|les\s+\d+)/i.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(guide|archives|recommendations?|packages|travel guide|best massage|unveiling|enjoy a|complete travel|wellness centers)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
