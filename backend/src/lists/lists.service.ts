import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { In, Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { ProspectList } from '../entities/prospect-list.entity';
import {
  extractImportRecords,
  IMPORT_PAYLOAD_HINT,
  mapImportRecord,
  mergeEmailLists,
  mergeProfiles,
  normalizeCompanyName,
  normalizeEmail,
  slugify,
  type MappedImportRecord,
} from '../prospects/prospect.utils';

export type ImportResult = {
  imported: number;
  merged: number;
  skipped: number;
  invalid: number;
  errors: Array<{ index: number; reason: string }>;
};

type SeedListMeta = {
  slug: string;
  name: string;
  description: string;
  file: string;
  count: number;
};

@Injectable()
export class ListsService {
  private readonly logger = new Logger(ListsService.name);

  constructor(
    @InjectRepository(ProspectList)
    private readonly lists: Repository<ProspectList>,
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  async findAll() {
    const lists = await this.lists.find({
      order: { name: 'ASC' },
      relations: ['prospects'],
    });
    return lists.map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
      description: l.description,
      prospectCount: l.prospects?.length ?? 0,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }

  async findOne(id: string) {
    const list = await this.lists.findOne({
      where: { id },
      relations: ['prospects'],
    });
    if (!list) throw new NotFoundException('Liste introuvable');
    return list;
  }

  async findBySlug(slug: string) {
    return this.lists.findOne({
      where: { slug },
      relations: ['prospects'],
    });
  }

  async create(data: { name: string; description?: string; slug?: string }) {
    const base = data.slug || slugify(data.name);
    let slug = base;
    let i = 2;
    while (await this.lists.findOneBy({ slug })) {
      slug = `${base}-${i++}`;
    }
    const list = this.lists.create({
      name: data.name.trim(),
      slug,
      description: data.description?.trim() || null,
      prospects: [],
    });
    return this.lists.save(list);
  }

  async addProspectToList(listId: string, prospect: Prospect) {
    const list = await this.lists.findOne({
      where: { id: listId },
      relations: ['prospects'],
    });
    if (!list) throw new NotFoundException('Liste introuvable');
    const already = (list.prospects || []).some((p) => p.id === prospect.id);
    if (!already) {
      list.prospects = [...(list.prospects || []), prospect];
      await this.lists.save(list);
    }
    return list;
  }

  async update(
    id: string,
    data: Partial<{ name: string; description: string | null }>,
  ) {
    const list = await this.findOne(id);
    if (data.name !== undefined) list.name = data.name.trim();
    if (data.description !== undefined) list.description = data.description;
    return this.lists.save(list);
  }

  async remove(id: string) {
    const list = await this.findOne(id);
    await this.lists.remove(list);
    return { ok: true };
  }

  async getProspectIdsForLists(listIds: string[]): Promise<string[]> {
    if (!listIds.length) return [];
    const lists = await this.lists.find({
      where: { id: In(listIds) },
      relations: ['prospects'],
    });
    const ids = new Set<string>();
    for (const list of lists) {
      for (const p of list.prospects || []) {
        if (!p.unsubscribedAt) ids.add(p.id);
      }
    }
    return [...ids];
  }

  async importRecords(
    listId: string,
    payload: unknown,
  ): Promise<ImportResult> {
    const list = await this.lists.findOne({
      where: { id: listId },
      relations: ['prospects'],
    });
    if (!list) throw new NotFoundException('Liste introuvable');

    const records = normalizeImportPayload(payload);
    const result: ImportResult = {
      imported: 0,
      merged: 0,
      skipped: 0,
      invalid: 0,
      errors: [],
    };

    for (let i = 0; i < records.length; i++) {
      const mapped = mapImportRecord(records[i]);
      if (!mapped.ok) {
        if (mapped.reason === 'Aucun email valide') {
          result.skipped += 1;
        } else {
          result.invalid += 1;
        }
        if (result.errors.length < 50) {
          result.errors.push({ index: i, reason: mapped.reason });
        }
        continue;
      }
      const { prospect, created } = await this.upsertProspect(mapped.record);
      const alreadyInList = (list.prospects || []).some(
        (p) => p.id === prospect.id,
      );
      if (!alreadyInList) {
        list.prospects = [...(list.prospects || []), prospect];
      }
      if (created) result.imported += 1;
      else result.merged += 1;
    }

    await this.lists.save(list);
    return result;
  }

  /** Upsert a prospect by email then company name. */
  async upsertProspect(
    record: MappedImportRecord,
  ): Promise<{ prospect: Prospect; created: boolean }> {
    const existing = await this.findDuplicate(record.emails, record.company);
    if (existing) {
      existing.emails = mergeEmailLists(existing.emails, record.emails);
      if (record.contactName && !existing.contactName) {
        existing.contactName = record.contactName;
      }
      if (record.notes && !existing.notes) {
        existing.notes = record.notes;
      }
      existing.profile = mergeProfiles(existing.profile, record.profile);
      await this.prospects.save(existing);
      return { prospect: existing, created: false };
    }

    const row = this.prospects.create({
      company: record.company,
      emails: record.emails,
      contactName: record.contactName,
      notes: record.notes,
      profile: record.profile,
      starred: false,
      unsubscribedAt: null,
      enrichment: null,
    });
    const saved = await this.prospects.save(row);
    return { prospect: saved, created: true };
  }

  async findDuplicate(
    emails: string[],
    company: string,
  ): Promise<Prospect | null> {
    const all = await this.prospects.find({ relations: ['lists'] });
    const emailSet = new Set(emails.map(normalizeEmail));
    for (const p of all) {
      if (p.emails.some((e) => emailSet.has(normalizeEmail(e)))) {
        return p;
      }
    }
    const target = normalizeCompanyName(company);
    if (!target) return null;
    for (const p of all) {
      if (normalizeCompanyName(p.company) === target) return p;
    }
    return null;
  }

  async dedupe(listId?: string): Promise<{
    merged: number;
    removed: number;
  }> {
    let prospects: Prospect[];
    let list: ProspectList | null = null;

    if (listId) {
      list = await this.lists.findOne({
        where: { id: listId },
        relations: ['prospects', 'prospects.lists'],
      });
      if (!list) throw new NotFoundException('Liste introuvable');
      prospects = [...(list.prospects || [])].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    } else {
      prospects = await this.prospects.find({
        relations: ['lists'],
        order: { createdAt: 'ASC' },
      });
    }

    const keep = new Map<string, Prospect>();
    const emailOwner = new Map<string, string>();
    const nameOwner = new Map<string, string>();
    const toRemove: Prospect[] = [];
    let merged = 0;

    for (const p of prospects) {
      let survivorId: string | null = null;
      for (const e of p.emails) {
        const n = normalizeEmail(e);
        if (emailOwner.has(n)) {
          survivorId = emailOwner.get(n)!;
          break;
        }
      }
      if (!survivorId) {
        const cn = normalizeCompanyName(p.company);
        if (cn && nameOwner.has(cn)) {
          survivorId = nameOwner.get(cn)!;
        }
      }

      if (survivorId && survivorId !== p.id) {
        const survivor = keep.get(survivorId);
        if (survivor) {
          survivor.emails = mergeEmailLists(survivor.emails, p.emails);
          if (p.contactName && !survivor.contactName) {
            survivor.contactName = p.contactName;
          }
          if (p.notes && !survivor.notes) survivor.notes = p.notes;
          survivor.profile = mergeProfiles(survivor.profile, p.profile);
          if (p.starred) survivor.starred = true;
          if (p.enrichment && !survivor.enrichment) {
            survivor.enrichment = p.enrichment;
          }
          // Merge list memberships
          const listIds = new Set(
            (survivor.lists || []).map((l) => l.id),
          );
          for (const l of p.lists || []) {
            if (!listIds.has(l.id)) {
              survivor.lists = [...(survivor.lists || []), l];
            }
          }
          await this.prospects.save(survivor);
          toRemove.push(p);
          merged += 1;
          continue;
        }
      }

      keep.set(p.id, p);
      for (const e of p.emails) {
        emailOwner.set(normalizeEmail(e), p.id);
      }
      const cn = normalizeCompanyName(p.company);
      if (cn && !nameOwner.has(cn)) nameOwner.set(cn, p.id);
    }

    for (const p of toRemove) {
      await this.prospects.remove(p);
    }

    return { merged, removed: toRemove.length };
  }

  async installDefaults(): Promise<{
    lists: number;
    imported: number;
    merged: number;
  }> {
    const seedDir = resolveSeedDataDir();
    const indexPath = join(seedDir, 'index.json');
    if (!existsSync(indexPath)) {
      throw new BadRequestException('Données seed introuvables');
    }
    const metas = JSON.parse(
      readFileSync(indexPath, 'utf8'),
    ) as SeedListMeta[];

    let listsCreated = 0;
    let imported = 0;
    let merged = 0;

    for (const meta of metas) {
      let list = await this.lists.findOne({
        where: { slug: meta.slug },
        relations: ['prospects'],
      });
      if (!list) {
        list = await this.create({
          name: meta.name,
          slug: meta.slug,
          description: meta.description,
        });
        listsCreated += 1;
      }

      const filePath = join(seedDir, meta.file);
      if (!existsSync(filePath)) {
        this.logger.warn(`Seed file missing: ${filePath}`);
        continue;
      }
      const records = JSON.parse(readFileSync(filePath, 'utf8')) as unknown[];
      const result = await this.importRecords(list.id, records);
      imported += result.imported;
      merged += result.merged;
    }

    return { lists: listsCreated, imported, merged };
  }
}

function normalizeImportPayload(payload: unknown): unknown[] {
  const records = extractImportRecords(payload);
  if (!records) {
    throw new BadRequestException(IMPORT_PAYLOAD_HINT);
  }
  return records;
}

function resolveSeedDataDir(): string {
  const candidates = [
    join(__dirname, '..', 'seed', 'data'),
    join(__dirname, 'seed', 'data'),
    join(process.cwd(), 'src', 'seed', 'data'),
    join(process.cwd(), 'dist', 'seed', 'data'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'index.json'))) return c;
  }
  return candidates[0];
}
