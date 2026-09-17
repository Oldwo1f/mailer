import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect, type LeadStatus } from '../entities/prospect.entity';
import { Send } from '../entities/send.entity';
import { MailService } from '../mail/mail.service';
import {
  statusAfterDetectedReply,
  statusAfterSuccessfulSend,
} from './commercial.rules';
import { buildProductAnalytics } from './commercial.analytics';
import {
  buildAurelRadar,
  type RadarSendMetrics,
} from './aurel-radar';
import { ProductMarketService } from './product-market.service';
import { classifyReply, type ReplyAnalysis } from './reply-intelligence';
import { buildAutoReplyMessage } from './reply-autopilot';
import {
  buildCommercialLearning,
  learningAdjustmentForProspect,
} from './commercial-learning';

const STAGE_RANK: Record<LeadStatus, number> = {
  new: 0,
  contacted: 1,
  replied: 2,
  interested: 3,
  demo: 4,
  meeting: 5,
  quote: 6,
  won: 7,
  lost: -1,
};

@Injectable()
export class CommercialPipelineService {
  private readonly logger = new Logger(CommercialPipelineService.name);

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    private readonly productMarkets: ProductMarketService,
    private readonly mail: MailService,
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

  async commercialLearning() {
    const rows = await this.prospects.find();
    return buildCommercialLearning(rows);
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

    const radar = buildAurelRadar(prospects, metrics);
    const learning = buildCommercialLearning(prospects);
    const byId = new Map(prospects.map((prospect) => [prospect.id, prospect]));

    const items = await Promise.all(
      radar.items.map(async (item) => {
        const prospect = byId.get(item.prospectId);
        const marketId = prospect?.marketId || 'pf';
        const productId = prospect?.productRecommendation?.productId || null;
        const market = productId
          ? await this.productMarkets.get(productId, marketId)
          : null;
        const marketEligible = Boolean(market?.enabled);
        const autopilotEnabled = Boolean(
          market?.enabled && market?.autopilotEnabled,
        );

        const learningAdjustment = prospect
          ? learningAdjustmentForProspect(learning, prospect)
          : {
              points: 0,
              confidence: 'collecting' as const,
              source: null,
              sourceLabel: null,
              reason: null,
            };

        const canLearnOnPriority = ['new', 'contacted'].includes(item.leadStatus);
        const appliedLearning = canLearnOnPriority ? learningAdjustment.points : 0;
        const learnedScore = Math.max(0, Math.min(100, item.score + appliedLearning));
        const learnedTier =
          item.tier === 'hot'
            ? item.tier
            : learnedScore >= 40
              ? ('promising' as const)
              : ('cold' as const);

        if (productId && market && !marketEligible) {
          return {
            ...item,
            score: learnedScore,
            tier: learnedTier,
            marketId,
            marketName: market.marketName,
            currency: market.currency,
            priceLabel: market.effectivePriceLabel,
            marketEligible,
            autopilotEnabled,
            idealCustomers: market.idealCustomers,
            buyingSignals: market.buyingSignals,
            objections: market.objections,
            learningAdjustment: appliedLearning,
            learningConfidence: learningAdjustment.confidence,
            learningSource: learningAdjustment.source,
            learningSourceLabel: learningAdjustment.sourceLabel,
            learningReason: learningAdjustment.reason,
            nextAction:
              'Marché verrouillé pour ce produit — aucune prospection automatique.',
            demoEligible: false,
            demoMode: 'none' as const,
            demoReason:
              'Produit non activé commercialement sur ce marché : aucune énergie de démo.',
          };
        }

        return {
          ...item,
          score: learnedScore,
          tier: learnedTier,
          marketId,
          marketName: market?.marketName || null,
          currency: market?.currency || null,
          priceLabel: market?.effectivePriceLabel || null,
          marketEligible,
          autopilotEnabled,
          idealCustomers: market?.idealCustomers || [],
          buyingSignals: market?.buyingSignals || [],
          objections: market?.objections || [],
          replyIntent: prospect?.lastReplyIntent || null,
          replyConfidence: prospect?.lastReplyConfidence || null,
          nextCommercialAction: prospect?.nextCommercialAction || null,
          autoReplySentAt: prospect?.autoReplySentAt || null,
          learningAdjustment: appliedLearning,
          learningConfidence: learningAdjustment.confidence,
          learningSource: learningAdjustment.source,
          learningSourceLabel: learningAdjustment.sourceLabel,
          learningReason: learningAdjustment.reason,
        };
      }),
    );

    items.sort(
      (a, b) => b.score - a.score || b.clicks - a.clicks || b.opens - a.opens,
    );

    return {
      ...radar,
      learning: {
        baseline: learning.baseline,
        thresholds: learning.thresholds,
      },
      summary: {
        ...radar.summary,
        cold: items.filter((item) => item.tier === 'cold').length,
        promising: items.filter((item) => item.tier === 'promising').length,
        hot: items.filter((item) => item.tier === 'hot').length,
        autopilotEligible: items.filter((item) => item.autopilotEnabled).length,
        blockedByMarket: items.filter(
          (item) =>
            Boolean(byId.get(item.prospectId)?.productRecommendation?.productId) &&
            !item.marketEligible,
        ).length,
        learningAdjusted: items.filter((item) => item.learningAdjustment !== 0).length,
      },
      items,
    };
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

  private applyReplyStatus(prospect: Prospect, analysis: ReplyAnalysis) {
    const current = prospect.leadStatus || 'new';

    if (analysis.intent === 'unsubscribe' || analysis.intent === 'not_interested') {
      if (current !== 'won') prospect.leadStatus = 'lost';
      return;
    }

    if (current === 'won') return;
    if (current === 'lost') {
      prospect.leadStatus = analysis.suggestedStatus;
      return;
    }

    const suggested = analysis.suggestedStatus;
    prospect.leadStatus =
      STAGE_RANK[suggested] > STAGE_RANK[current] ? suggested : current;
  }

  async recordInboundReply(input: {
    fromEmail: string;
    receivedAt?: Date | null;
    subject?: string | null;
    bodyText?: string | null;
    replyToMessageId?: string | null;
    messageId?: string | null;
  }) {
    const email = input.fromEmail.trim().toLowerCase();
    const sent = await this.sends.find({
      where: { status: 'sent' },
      relations: ['prospect', 'campaign', 'campaign.sender'],
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
      return {
        ok: true,
        matched: true,
        duplicate: true,
        prospectId: prospect.id,
        replyIntent: prospect.lastReplyIntent,
      };
    }

    const analysis = classifyReply({
      subject: input.subject,
      bodyText: input.bodyText,
    });

    prospect.replyDetectedAt = input.receivedAt || new Date();
    prospect.lastReplyFrom = email;
    prospect.lastReplySubject = input.subject?.trim().slice(0, 500) || null;
    prospect.lastReplyMessageId = input.messageId?.trim().slice(0, 500) || null;
    prospect.lastReplyIntent = analysis.intent;
    prospect.lastReplyConfidence = analysis.confidence;
    prospect.lastReplySnippet = input.bodyText?.trim().slice(0, 1200) || null;
    prospect.nextCommercialAction = analysis.nextAction;

    if (analysis.intent === 'unsubscribe') {
      prospect.unsubscribedAt = prospect.unsubscribedAt || new Date();
      prospect.lostReason = 'Désinscription demandée par email';
    } else if (analysis.intent === 'not_interested') {
      prospect.lostReason = 'Refus commercial explicite par email';
    } else if (prospect.leadStatus !== 'lost') {
      prospect.lostReason = null;
    }

    this.applyReplyStatus(prospect, analysis);
    await this.prospects.save(prospect);

    await this.sends
      .createQueryBuilder()
      .update(Send)
      .set({ status: 'skipped', error: 'Réponse détectée — relance stoppée' })
      .where('prospectId = :prospectId', { prospectId: prospect.id })
      .andWhere('status = :status', { status: 'queued' })
      .execute();

    let autoReplySent = false;
    let autoReplyError: string | null = null;

    try {
      const recommendation = prospect.productRecommendation;
      const reviewed =
        recommendation &&
        ['accepted', 'overridden'].includes(recommendation.reviewState);
      const marketId = prospect.marketId || 'pf';
      const market = reviewed
        ? await this.productMarkets.get(recommendation.productId, marketId)
        : null;

      if (
        reviewed &&
        market?.enabled &&
        market.autopilotEnabled &&
        recommendation.productId !== 'custom-atelys' &&
        match.campaign?.sender
      ) {
        const message = buildAutoReplyMessage({
          analysis,
          contactName: prospect.contactName,
          productName: recommendation.productName,
          priceLabel: market.effectivePriceLabel,
          productUrl: recommendation.productUrl,
          demoUrls: prospect.demoPreparation?.artifactUrls || [],
          originalSubject: input.subject,
        });

        if (message) {
          const sender = match.campaign.sender;
          const headers: Record<string, string> = {};
          if (input.replyToMessageId?.trim()) {
            headers['In-Reply-To'] = input.replyToMessageId.trim();
            headers.References = input.replyToMessageId.trim();
          }

          await this.mail.send({
            to: email,
            subject: message.subject,
            text: message.text,
            html: message.html,
            from: `${sender.name} <${sender.email}>`,
            replyTo: sender.replyTo || sender.email,
            ...(Object.keys(headers).length ? { headers } : {}),
          });

          prospect.autoReplySentAt = new Date();
          prospect.nextCommercialAction =
            analysis.intent === 'later'
              ? 'Réponse automatique envoyée — attendre avant toute nouvelle relance.'
              : 'Réponse automatique envoyée — surveiller le prochain retour du prospect.';
          await this.prospects.save(prospect);
          autoReplySent = true;
        }
      }
    } catch (err) {
      autoReplyError = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Reply Autopilot ${prospect.id}: ${autoReplyError.slice(0, 240)}`,
      );
    }

    return {
      ok: true,
      matched: true,
      duplicate: false,
      prospectId: prospect.id,
      leadStatus: prospect.leadStatus,
      analysis,
      autoReplySent,
      autoReplyError,
    };
  }
}
