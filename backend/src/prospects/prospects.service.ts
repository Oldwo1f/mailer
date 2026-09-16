import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Prospect, type ProspectProfile } from '../entities/prospect.entity';
import { WebSearchService } from '../search/web-search.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    private readonly webSearch: WebSearchService,
    private readonly llm: LlmService,
  ) {}

  async enrichOne(id: string) {
    const prospect = await this.prospects.findOneBy({ id });
    if (!prospect) throw new NotFoundException('Prospect introuvable');

    const queries = [
      `"${prospect.company}" Tahiti`,
      `"${prospect.company}" Polynésie`,
    ];

    const allHits: Array<{
      title: string;
      url: string;
      content: string;
      provider: string;
    }> = [];
    let lastProvider: string | null = null;

    for (const query of queries) {
      try {
        const result = await this.webSearch.search({
          query,
          maxResults: 5,
          searchDepth: 'basic',
        });
        lastProvider = result.provider;
        for (const hit of result.results) {
          allHits.push({
            title: hit.title,
            url: hit.url,
            content: hit.content,
            provider: result.provider,
          });
        }
        if (result.answer) {
          allHits.push({
            title: 'Answer',
            url: '',
            content: result.answer,
            provider: result.provider,
          });
        }
      } catch (err) {
        this.logger.warn(
          `Search failed for ${prospect.company}: ${err instanceof Error ? err.message : err}`,
        );
      }
      if (allHits.filter((h) => h.url).length >= 3) break;
    }

    const websiteHint = allHits.find(
      (h) =>
        h.url &&
        !/facebook|linkedin|instagram|youtube|maps\.google/i.test(h.url),
    )?.url;

    let scrapeMarkdown: string | null = null;
    if (websiteHint) {
      scrapeMarkdown = await this.webSearch.scrapeUrl(websiteHint);
    }

    const snippets = allHits
      .slice(0, 12)
      .map(
        (h) =>
          `- [${h.provider}] ${h.title}\n  URL: ${h.url}\n  ${h.content.slice(0, 500)}`,
      )
      .join('\n\n');

    const enrichment = await this.llm.extractEnrichment({
      company: prospect.company,
      searchSnippets: snippets || 'Aucun résultat.',
      scrapeMarkdown,
    });
    enrichment.provider = lastProvider;
    if (!enrichment.website && websiteHint) {
      enrichment.website = websiteHint;
    }

    prospect.enrichment = enrichment;
    await this.prospects.save(prospect);
    return prospect;
  }

  async enrichMany(ids: string[]) {
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const id of ids) {
      try {
        await this.enrichOne(id);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }
}

@Injectable()
export class ProspectsService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  findAll(opts?: {
    starred?: boolean;
    unsubscribed?: boolean;
    listId?: string;
  }) {
    const qb = this.prospects
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.lists', 'lists')
      .orderBy('p.company', 'ASC');
    if (opts?.starred === true) qb.andWhere('p.starred = :s', { s: true });
    if (opts?.unsubscribed === true) {
      qb.andWhere('p.unsubscribedAt IS NOT NULL');
    } else if (opts?.unsubscribed === false) {
      qb.andWhere('p.unsubscribedAt IS NULL');
    }
    if (opts?.listId) {
      qb.andWhere('lists.id = :listId', { listId: opts.listId });
    }
    return qb.getMany();
  }

  async findOne(id: string) {
    const p = await this.prospects.findOne({
      where: { id },
      relations: ['lists'],
    });
    if (!p) throw new NotFoundException('Prospect introuvable');
    return p;
  }

  async create(data: {
    company: string;
    emails: string[];
    starred?: boolean;
    notes?: string;
    contactName?: string | null;
    profile?: ProspectProfile | null;
    listIds?: string[];
  }) {
    const row = this.prospects.create({
      company: data.company,
      emails: data.emails,
      starred: data.starred ?? false,
      notes: data.notes ?? null,
      contactName: data.contactName ?? null,
      profile: data.profile ?? null,
      unsubscribedAt: null,
      enrichment: null,
    });
    const saved = await this.prospects.save(row);
    if (data.listIds?.length) {
      const withLists = await this.prospects.findOne({
        where: { id: saved.id },
        relations: ['lists'],
      });
      if (withLists) {
        // lists attached via ListsService typically; keep simple here
        return withLists;
      }
    }
    return this.findOne(saved.id);
  }

  async update(
    id: string,
    data: Partial<{
      company: string;
      emails: string[];
      starred: boolean;
      notes: string | null;
      contactName: string | null;
      profile: ProspectProfile | null;
      unsubscribedAt: Date | null;
    }>,
  ) {
    const p = await this.findOne(id);
    Object.assign(p, data);
    return this.prospects.save(p);
  }

  async remove(id: string) {
    const p = await this.findOne(id);
    await this.prospects.remove(p);
    return { ok: true };
  }

  async findActiveByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prospects.find({
      where: { id: In(ids), unsubscribedAt: IsNull() },
      relations: ['lists'],
    });
  }
}
