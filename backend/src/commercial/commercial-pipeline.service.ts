import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect, type LeadStatus } from '../entities/prospect.entity';
import { Send } from '../entities/send.entity';
import {
  statusAfterDetectedReply,
  statusAfterSuccessfulSend,
} from './commercial.rules';
import { buildProductAnalytics } from './commercial.analytics';
import {
  buildAurelRadar,
  type RadarSendMetrics,
} from './aurel-radar';

@Injectable()
export class CommercialPipelineService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
  ) {}

  list() {
    return this.prospects.find({ order: { updatedAt: 'DESC' } });
  }

  async summary() {
    const rows = await this.prospects.find();
    const counts: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      replied: 0,
      interested: 0,
      demo: 0,
      meeting: 0,
      quote: 0,
      won: 0,
      lost: 0,
    };
    let wonValueXpf = 0;
    let activePipelineValueXpf = 0;

    for (const row of rows) {
      counts[row.leadStatus || 'new'] += 1;
      const value = Math.max(0, Number(row.dealValueXpf) || 0);
      if (row.leadStatus === 'won') wonValueXpf += value;
      if (['interested', 'demo', 'meeting', 'quote'].includes(row.leadStatus)) {
        activePipelineValueXpf += value;
      }
    }

    return {
      total: rows.length,
      counts,
      repliedOrLater: rows.filter((row) => Boolean(row.replyDetectedAt)).length,
      wonValueXpf,
      activePipelineValueXpf,
    };
  }

  async productAnalytics() {
    const rows = await this.prospects.find();
    return buildProductAnalytics(rows);
  }

  async radar() {
    const [prospects, sends] = await Promise.all([
      this.prospects.find(),
      this.sends.find({ order: { createdAt: 'DESC' } }),
    ]);

    const metrics = new Map<string, RadarSendMetrics>();
    for (const send of sends) {
      const current = metrics.get(send.prospectId) || {
        sent: 0,
        opens: 0,
        clicks: 0,
        lastSentAt: null,
        lastOpenedAt: null,
      };
      if (send.status === 'sent') current.sent += 1;
      current.opens += Math.max(0, Number(send.openCount) || 0);
      current.clicks += Math.max(0, Number(send.clickCount) || 0);
      if (!current.lastSentAt && send.sentAt) current.lastSentAt = send.sentAt;
      if (!current.lastOpenedAt && send.lastOpenedAt) {
        current.lastOpenedAt = send.lastOpenedAt;
      }
      metrics.set(send.prospectId, current);
    }

    return buildAurelRadar(prospects, metrics);
  }

  async updateProspect(
    id: string,
    input: {
      leadStatus?: LeadStatus;
      dealValueXpf?: number | null;
      lostReason?: string | null;
    },
  ) {
    const prospect = await this.prospects.findOneBy({ id });
    if (!prospect) throw new NotFoundException('Prospect introuvable');

    if (input.leadStatus) {
      prospect.leadStatus = input.leadStatus;
      if (input.leadStatus === 'replied' && !prospect.replyDetectedAt) {
        prospect.replyDetectedAt = new Date();
      }
      if (input.leadStatus === 'won') {
        prospect.wonAt = prospect.wonAt || new Date();
        prospect.lostReason = null;
      } else if (input.leadStatus === 'lost') {
        prospect.wonAt = null;
      } else {
        prospect.wonAt = null;
        prospect.lostReason = null;
      }
    }

    if (input.dealValueXpf !== undefined) {
      prospect.dealValueXpf =
        input.dealValueXpf == null
          ? null
          : Math.max(0, Math.round(input.dealValueXpf));
    }
    if (input.lostReason !== undefined && prospect.leadStatus === 'lost') {
      prospect.lostReason = input.lostReason?.trim() || null;
    }

    return this.prospects.save(prospect);
  }

  async markSuccessfulSend(prospectId: string) {
    const prospect = await this.prospects.findOneBy({ id: prospectId });
    if (!prospect) return;
    const nextStatus = statusAfterSuccessfulSend(prospect.leadStatus);
    if (nextStatus !== prospect.leadStatus) {
      prospect.leadStatus = nextStatus;
      await this.prospects.save(prospect);
    }
  }

  async recordInboundReply(input: {
    fromEmail: string;
    receivedAt?: Date | null;
    subject?: string | null;
    messageId?: string | null;
  }) {
    const email = input.fromEmail.trim().toLowerCase();
    const sent = await this.sends.find({
      where: { status: 'sent' },
      relations: ['prospect'],
      order: { sentAt: 'DESC' },
    });
    const match = sent.find((row) => row.toEmail.trim().toLowerCase() === email);
    if (!match?.prospect) {
      return { ok: true, matched: false };
    }

    const prospect = match.prospect;
    if (
      input.messageId &&
      prospect.lastReplyMessageId &&
      prospect.lastReplyMessageId === input.messageId
    ) {
      return { ok: true, matched: true, duplicate: true, prospectId: prospect.id };
    }

    prospect.replyDetectedAt = input.receivedAt || new Date();
    prospect.lastReplyFrom = email;
    prospect.lastReplySubject = input.subject?.trim().slice(0, 500) || null;
    prospect.lastReplyMessageId = input.messageId?.trim().slice(0, 500) || null;
    prospect.leadStatus = statusAfterDetectedReply(prospect.leadStatus);
    await this.prospects.save(prospect);

    await this.sends
      .createQueryBuilder()
      .update(Send)
      .set({ status: 'skipped', error: 'Réponse détectée — relance stoppée' })
      .where('prospectId = :prospectId', { prospectId: prospect.id })
      .andWhere('status = :status', { status: 'queued' })
      .execute();

    return {
      ok: true,
      matched: true,
      duplicate: false,
      prospectId: prospect.id,
      leadStatus: prospect.leadStatus,
    };
  }
}
