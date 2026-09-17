import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { SenderIdentity } from '../entities/sender-identity.entity';
import { MailService } from '../mail/mail.service';
import { ProductMarketService } from './product-market.service';
import { AurelJournalService } from './aurel-journal.service';

@Injectable()
export class AurelDeferredFollowUpService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AurelDeferredFollowUpService.name);
  private poller: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
    private readonly productMarkets: ProductMarketService,
    private readonly mail: MailService,
    private readonly journal: AurelJournalService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.processDue(), 35_000);
    this.poller = setInterval(() => void this.processDue(), 30 * 60_000);
  }

  onModuleDestroy() {
    if (this.poller) clearInterval(this.poller);
  }

  async processDue() {
    if (this.running) return { processed: 0 };
    this.running = true;
    let processed = 0;
    try {
      const defaults = await this.senders.find({
        where: { isDefault: true },
        order: { createdAt: 'ASC' },
        take: 1,
      });
      const anySender = defaults.length
        ? defaults
        : await this.senders.find({ order: { createdAt: 'ASC' }, take: 1 });
      const sender = anySender[0] || null;
      if (!sender) return { processed: 0 };

      const rows = await this.prospects
        .createQueryBuilder('p')
        .where('p.deferredFollowUpAt IS NOT NULL')
        .andWhere('p.deferredFollowUpAt <= :now', { now: new Date() })
        .andWhere('p.deferredFollowUpSentAt IS NULL')
        .andWhere('p.unsubscribedAt IS NULL')
        .andWhere('p.leadStatus NOT IN (:...stopped)', {
          stopped: ['won', 'lost'],
        })
        .orderBy('p.deferredFollowUpAt', 'ASC')
        .take(25)
        .getMany();

      for (const prospect of rows) {
        try {
          const recommendation = prospect.productRecommendation;
          if (
            !recommendation ||
            !['accepted', 'overridden'].includes(recommendation.reviewState) ||
            recommendation.productId === 'custom-atelys'
          ) {
            continue;
          }
          const market = await this.productMarkets.get(
            recommendation.productId,
            prospect.marketId || 'pf',
          );
          if (!market?.enabled || !market.autopilotEnabled) continue;
          const to = prospect.lastReplyFrom || prospect.emails?.[0];
          if (!to) continue;

          const text = buildMessage(
            prospect,
            recommendation.productName,
            recommendation.productUrl,
            market.effectivePriceLabel,
          );
          const html = text
            .split('\n\n')
            .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
            .join('');

          await this.mail.send({
            to,
            subject: subjectFor(prospect.lastReplySubject, prospect.leadStatus),
            text,
            html,
            from: `${sender.name} <${sender.email}>`,
            replyTo: sender.replyTo || sender.email,
          });

          const kind = prospect.deferredFollowUpReason?.startsWith('stage:')
            ? prospect.deferredFollowUpReason.slice('stage:'.length)
            : 'later';
          prospect.deferredFollowUpSentAt = new Date();
          prospect.deferredFollowUpAt = null;
          prospect.nextCommercialAction =
            kind === 'later'
              ? 'Relance différée envoyée automatiquement — attendre le retour du prospect.'
              : `Relance ${kind} envoyée automatiquement — attendre le retour du prospect.`;
          await this.prospects.save(prospect);
          processed += 1;

          await this.journal.log({
            actionType:
              kind === 'later'
                ? 'deferred_followup_sent'
                : 'hot_stage_followup_sent',
            prospectId: prospect.id,
            summary:
              kind === 'later'
                ? `Aurel a relancé ${prospect.company} à la date convenue.`
                : `Aurel a relancé ${prospect.company} après l’étape ${kind}.`,
            details: {
              productId: recommendation.productId,
              productName: recommendation.productName,
              kind,
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `Deferred follow-up ${prospect.id}: ${message.slice(0, 220)}`,
          );
          await this.journal.log({
            actionType: 'deferred_followup_failed',
            status: 'error',
            prospectId: prospect.id,
            summary: `Relance différée non envoyée à ${prospect.company}.`,
            details: { error: message.slice(0, 500) },
          });
        }
      }
      return { processed };
    } finally {
      this.running = false;
    }
  }
}

function buildMessage(
  prospect: Prospect,
  productName: string,
  productUrl: string | null | undefined,
  priceLabel: string | null,
) {
  const hello = prospect.contactName?.trim()
    ? `Bonjour ${prospect.contactName.trim()},`
    : 'Bonjour,';
  const reason = prospect.deferredFollowUpReason || '';
  const price = priceLabel
    ? `\n\nPour rappel, l’offre ${productName} est actuellement à ${priceLabel}.`
    : '';
  const link = productUrl ? `\n\nPrésentation : ${productUrl}` : '';

  if (reason === 'stage:quote') {
    return `${hello}\n\nJe reviens vers vous concernant la proposition transmise pour ${productName}. Avez-vous eu le temps de la regarder, et y a-t-il un point à ajuster ou clarifier ?\n\nUne réponse courte me suffit.\n\nBonne journée.`;
  }
  if (reason === 'stage:demo') {
    return `${hello}\n\nJe reviens vers vous après la présentation de ${productName}. Est-ce que cela correspond à votre façon de travailler, ou y a-t-il un point qui vous bloque encore ?${link}\n\nUne réponse courte me suffit.\n\nBonne journée.`;
  }
  if (reason === 'stage:interested') {
    return `${hello}\n\nJe reviens vers vous au sujet de ${productName}. Le sujet est-il toujours d’actualité de votre côté ?${price}${link}\n\nSi oui, dites-moi simplement le point principal que vous voulez résoudre et je reprends à partir de là.\n\nBonne journée.`;
  }

  return `${hello}\n\nComme convenu, je reviens vers vous au sujet de ${productName}. Vous m’aviez indiqué que ce serait plus pertinent un peu plus tard.${price}${link}\n\nSi le sujet est toujours d’actualité, répondez simplement à ce mail et je reprends avec vous à partir de votre besoin actuel.\n\nBonne journée.`;
}

function subjectFor(value: string | null | undefined, leadStatus: string) {
  const fallback = leadStatus === 'quote' ? 'Votre proposition' : 'Votre demande';
  const clean = String(value || fallback).trim();
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
