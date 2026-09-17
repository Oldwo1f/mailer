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
      const sender =
        (await this.senders.findOne({ where: { isDefault: true } })) ||
        (await this.senders.findOne({ order: { createdAt: 'ASC' } }));
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

          const hello = prospect.contactName?.trim()
            ? `Bonjour ${prospect.contactName.trim()},`
            : 'Bonjour,';
          const price = market.effectivePriceLabel
            ? `\n\nPour rappel, l’offre ${recommendation.productName} est actuellement à ${market.effectivePriceLabel}.`
            : '';
          const link = recommendation.productUrl
            ? `\n\nPrésentation : ${recommendation.productUrl}`
            : '';
          const text = `${hello}\n\nComme convenu, je reviens vers vous au sujet de ${recommendation.productName}. Vous m’aviez indiqué que ce serait plus pertinent un peu plus tard.${price}${link}\n\nSi le sujet est toujours d’actualité, répondez simplement à ce mail et je reprends avec vous à partir de votre besoin actuel.\n\nBonne journée.`;
          const html = text
            .split('\n\n')
            .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
            .join('');

          await this.mail.send({
            to,
            subject: subjectFor(prospect.lastReplySubject),
            text,
            html,
            from: `${sender.name} <${sender.email}>`,
            replyTo: sender.replyTo || sender.email,
          });

          prospect.deferredFollowUpSentAt = new Date();
          prospect.deferredFollowUpAt = null;
          prospect.nextCommercialAction =
            'Relance différée envoyée automatiquement — attendre le retour du prospect.';
          await this.prospects.save(prospect);
          processed += 1;

          await this.journal.log({
            actionType: 'deferred_followup_sent',
            prospectId: prospect.id,
            summary: `Aurel a relancé ${prospect.company} à la date convenue.`,
            details: {
              productId: recommendation.productId,
              productName: recommendation.productName,
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

function subjectFor(value?: string | null) {
  const clean = String(value || 'Votre demande').trim();
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
