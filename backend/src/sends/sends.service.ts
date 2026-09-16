import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Send, type SendStatus } from '../entities/send.entity';

@Injectable()
export class SendsService {
  constructor(
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
  ) {}

  async list(opts: {
    status?: SendStatus | 'all';
    campaignId?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);

    const qb = this.sends
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.prospect', 'prospect')
      .leftJoinAndSelect('s.campaign', 'campaign')
      .leftJoinAndSelect('s.draft', 'draft')
      .leftJoinAndSelect('draft.step', 'step')
      .orderBy('s.sentAt', 'DESC')
      .addOrderBy('s.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (opts.status && opts.status !== 'all') {
      qb.andWhere('s.status = :status', { status: opts.status });
    }
    if (opts.campaignId) {
      qb.andWhere('s.campaignId = :campaignId', {
        campaignId: opts.campaignId,
      });
    }
    if (opts.q?.trim()) {
      const q = `%${opts.q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(s.toEmail) LIKE :q OR LOWER(prospect.company) LIKE :q OR LOWER(campaign.name) LIKE :q OR LOWER(draft.subject) LIKE :q)`,
        { q },
      );
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      total,
      limit,
      offset,
      items: items.map((s) => ({
        id: s.id,
        token: s.token,
        toEmail: s.toEmail,
        status: s.status,
        messageId: s.messageId,
        error: s.error,
        sentAt: s.sentAt,
        openCount: s.openCount,
        lastOpenedAt: s.lastOpenedAt,
        clickCount: s.clickCount,
        createdAt: s.createdAt,
        campaignId: s.campaignId,
        campaignName: s.campaign?.name ?? null,
        prospectId: s.prospectId,
        company: s.prospect?.company ?? null,
        draftId: s.draftId,
        subject: s.draft?.subject ?? null,
        stepName: s.draft?.step?.name ?? null,
        stepPosition: s.draft?.step?.position ?? null,
      })),
    };
  }

  async getOne(id: string) {
    const s = await this.sends.findOne({
      where: { id },
      relations: ['prospect', 'campaign', 'draft', 'draft.step', 'clicks'],
    });
    if (!s) return null;
    return {
      id: s.id,
      token: s.token,
      toEmail: s.toEmail,
      status: s.status,
      messageId: s.messageId,
      error: s.error,
      sentAt: s.sentAt,
      openCount: s.openCount,
      lastOpenedAt: s.lastOpenedAt,
      clickCount: s.clickCount,
      createdAt: s.createdAt,
      campaignId: s.campaignId,
      campaignName: s.campaign?.name ?? null,
      prospectId: s.prospectId,
      company: s.prospect?.company ?? null,
      draftId: s.draftId,
      subject: s.draft?.subject ?? null,
      html: s.draft?.html ?? null,
      text: s.draft?.text ?? null,
      stepName: s.draft?.step?.name ?? null,
      stepPosition: s.draft?.step?.position ?? null,
      clicks: (s.clicks || []).map((c) => ({
        id: c.id,
        url: c.url,
        clickedAt: c.clickedAt,
      })),
    };
  }
}
