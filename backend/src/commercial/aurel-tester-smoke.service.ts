import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CampaignsService } from '../campaigns/campaigns.service';
import { Draft } from '../entities/draft.entity';
import { Prospect } from '../entities/prospect.entity';
import { Send } from '../entities/send.entity';
import { SenderIdentity } from '../entities/sender-identity.entity';
import { ListsService } from '../lists/lists.service';
import { AurelJournalService } from './aurel-journal.service';

const MAX_TEST_RECIPIENTS = 5;
const POLL_MS = 1500;
const TIMEOUT_MS = 180_000;

@Injectable()
export class AurelTesterSmokeService {
  private readonly logger = new Logger(AurelTesterSmokeService.name);
  private running = false;

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(Draft)
    private readonly drafts: Repository<Draft>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
    private readonly lists: ListsService,
    private readonly campaigns: CampaignsService,
    private readonly journal: AurelJournalService,
  ) {}

  async run() {
    if (this.running) {
      throw new ConflictException('Un smoke test Testeurs est déjà en cours.');
    }
    this.running = true;

    let campaignId: string | null = null;
    const snapshots = new Map<
      string,
      {
        leadStatus: Prospect['leadStatus'];
        replyDetectedAt: Date | null;
        nextCommercialAction: string | null;
      }
    >();

    try {
      const list = await this.findTesterList();
      const members = list.prospects || [];
      if (!members.length) {
        throw new ConflictException('La liste Testeurs est vide.');
      }

      const recipientCount = members.reduce(
        (total, prospect) =>
          total + new Set((prospect.emails || []).map((v) => v.trim().toLowerCase()).filter(Boolean)).size,
        0,
      );
      if (recipientCount < 1 || recipientCount > MAX_TEST_RECIPIENTS) {
        throw new ConflictException(
          `La liste Testeurs contient ${recipientCount} destinataire(s) email ; limite de sécurité : ${MAX_TEST_RECIPIENTS}.`,
        );
      }
      const unsubscribed = members.filter((p) => Boolean(p.unsubscribedAt));
      if (unsubscribed.length) {
        throw new ConflictException(
          `${unsubscribed.length} fiche(s) de la liste Testeurs sont désinscrites : test bloqué.`,
        );
      }

      const defaults = await this.senders.find({
        where: { isDefault: true },
        order: { createdAt: 'ASC' },
        take: 1,
      });
      const fallback = defaults.length
        ? defaults
        : await this.senders.find({ order: { createdAt: 'ASC' }, take: 1 });
      const sender = fallback[0] || null;
      if (!sender) {
        throw new ConflictException('Aucun expéditeur configuré pour le smoke test.');
      }

      for (const prospect of members) {
        snapshots.set(prospect.id, {
          leadStatus: prospect.leadStatus,
          replyDetectedAt: prospect.replyDetectedAt,
          nextCommercialAction: prospect.nextCommercialAction,
        });
        // Testeurs are internal addresses. Neutralize reply-stage suppression only for
        // the duration of this test, then restore their commercial state in finally.
        prospect.leadStatus = 'new';
        prospect.replyDetectedAt = null;
        await this.prospects.save(prospect);
      }

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const created = await this.campaigns.create({
        name: `[SMOKE TESTEURS] Aurel ${stamp}`,
        brief:
          'TEST INTERNE UNIQUEMENT. Envoyer un email très court en français confirmant que la chaîne Aurel fonctionne. Dire clairement : « Test interne Aurel — aucune action requise ». Ne faire aucune offre commerciale.',
        tone: 'professionnel',
        emailType: 'classique',
        language: 'fr',
        senderId: sender.id,
        listIds: [list.id],
        steps: [
          {
            name: 'Smoke test',
            brief:
              'TEST INTERNE UNIQUEMENT. Message court. Mention obligatoire : « Test interne Aurel — aucune action requise ». Aucun argument commercial, aucun prix, aucune relance.',
            delayDays: 0,
          },
        ],
      });
      campaignId = created.id;

      await this.journal.log({
        actionType: 'tester_smoke_started',
        campaignId,
        summary: `Smoke test lancé sur la liste ${list.name} (${recipientCount} destinataire(s)).`,
        details: { listId: list.id, listName: list.name, recipientCount },
      });

      const generated = await this.campaigns.generate(campaignId);
      const failures = generated.results.filter((row) => !row.ok);
      if (failures.length) {
        throw new Error(
          `Génération incomplète : ${failures.length}/${generated.results.length} brouillon(s) en erreur.`,
        );
      }

      const ready = await this.drafts.find({
        where: { campaignId, status: 'ready' },
      });
      if (!ready.length) {
        throw new Error('Aucun brouillon prêt après génération.');
      }
      for (const draft of ready) {
        draft.status = 'approved';
      }
      await this.drafts.save(ready);

      await this.campaigns.send(campaignId);

      const deadline = Date.now() + TIMEOUT_MS;
      let last = { sent: 0, failed: 0, skipped: 0, queued: 0, sending: 0, total: 0 };
      while (Date.now() < deadline) {
        const rows = await this.sends.find({ where: { campaignId } });
        last = {
          sent: rows.filter((s) => s.status === 'sent').length,
          failed: rows.filter((s) => s.status === 'failed').length,
          skipped: rows.filter((s) => s.status === 'skipped').length,
          queued: rows.filter((s) => s.status === 'queued').length,
          sending: rows.filter((s) => s.status === 'sending').length,
          total: rows.length,
        };

        if (
          last.total >= recipientCount &&
          last.queued === 0 &&
          last.sending === 0
        ) {
          break;
        }
        await sleep(POLL_MS);
      }

      if (
        last.total !== recipientCount ||
        last.sent !== recipientCount ||
        last.failed ||
        last.skipped ||
        last.queued ||
        last.sending
      ) {
        throw new Error(
          `Smoke test non concluant : attendus=${recipientCount}, total=${last.total}, sent=${last.sent}, failed=${last.failed}, skipped=${last.skipped}, queued=${last.queued}, sending=${last.sending}.`,
        );
      }

      await this.journal.log({
        actionType: 'tester_smoke_passed',
        campaignId,
        summary: `Smoke test Testeurs réussi : ${last.sent}/${recipientCount} email(s) envoyé(s).`,
        details: { listId: list.id, listName: list.name, ...last },
      });

      return {
        ok: true,
        listName: list.name,
        campaignId,
        recipients: recipientCount,
        sent: last.sent,
        failed: last.failed,
        skipped: last.skipped,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Tester smoke failed: ${message}`);
      await this.journal.log({
        actionType: 'tester_smoke_failed',
        status: 'error',
        campaignId,
        summary: 'Smoke test Testeurs échoué.',
        details: { error: message.slice(0, 1000) },
      });
      throw err;
    } finally {
      if (snapshots.size) {
        const rows = await this.prospects.find({
          where: { id: In([...snapshots.keys()]) },
        });
        for (const prospect of rows) {
          const before = snapshots.get(prospect.id);
          if (!before) continue;
          prospect.leadStatus = before.leadStatus;
          prospect.replyDetectedAt = before.replyDetectedAt;
          prospect.nextCommercialAction = before.nextCommercialAction;
        }
        await this.prospects.save(rows);
      }
      this.running = false;
    }
  }

  private async findTesterList() {
    const summaries = await this.lists.findAll();
    const candidates = summaries.filter(
      (row) => isTesterLabel(row.name) || isTesterLabel(row.slug),
    );

    if (candidates.length !== 1) {
      throw new ConflictException(
        candidates.length
          ? `Sécurité smoke test : ${candidates.length} listes de test détectées (${candidates.map((c) => c.name).join(', ')}). Une seule est requise.`
          : 'Sécurité smoke test : aucune liste Testeurs détectée.',
      );
    }
    return this.lists.findOne(candidates[0].id);
  }
}

function isTesterLabel(value: string) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);
  return tokens.some((token) =>
    ['test', 'tests', 'tester', 'testers', 'testeur', 'testeurs'].includes(token),
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
