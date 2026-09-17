import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { SenderIdentity } from '../entities/sender-identity.entity';
import { MailService } from '../mail/mail.service';
import { SettingsService } from '../settings/settings.service';
import { AurelJournalService } from './aurel-journal.service';

@Injectable()
export class AurelMeetingService {
  private readonly logger = new Logger(AurelMeetingService.name);

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly journal: AurelJournalService,
  ) {}

  async handle(input: {
    prospectId?: string | null;
    intent?: string | null;
    fromEmail: string;
    subject?: string | null;
  }) {
    if (!input.prospectId || input.intent !== 'meeting') {
      return { sent: false, reason: 'not_meeting' };
    }

    const values = await this.settings.getRaw();
    const bookingUrl =
      typeof values.aurelBookingUrl === 'string'
        ? values.aurelBookingUrl.trim()
        : '';
    if (!/^https?:\/\//i.test(bookingUrl)) {
      return { sent: false, reason: 'booking_url_missing' };
    }

    const prospect = await this.prospects.findOneBy({ id: input.prospectId });
    if (!prospect || prospect.unsubscribedAt || prospect.leadStatus === 'lost') {
      return { sent: false, reason: 'prospect_blocked' };
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
    if (!sender) return { sent: false, reason: 'sender_missing' };

    const hello = prospect.contactName?.trim()
      ? `Bonjour ${prospect.contactName.trim()},`
      : 'Bonjour,';
    const text = `${hello}\n\nAvec plaisir. Vous pouvez choisir directement le créneau qui vous convient ici : ${bookingUrl}\n\nSi aucun créneau ne convient, répondez simplement à ce mail avec vos disponibilités et nous nous adapterons.\n\nBonne journée.`;
    const html = text
      .split('\n\n')
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join('');

    try {
      await this.mail.send({
        to: input.fromEmail,
        subject: replySubject(input.subject),
        text,
        html,
        from: `${sender.name} <${sender.email}>`,
        replyTo: sender.replyTo || sender.email,
      });
      prospect.autoReplySentAt = new Date();
      prospect.nextCommercialAction =
        'Lien de rendez-vous envoyé automatiquement — attendre la réservation ou le retour du prospect.';
      await this.prospects.save(prospect);
      await this.journal.log({
        actionType: 'meeting_link_sent',
        prospectId: prospect.id,
        summary: `Aurel a envoyé le lien de rendez-vous à ${prospect.company}.`,
        details: { bookingUrl },
      });
      return { sent: true, reason: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Meeting reply ${prospect.id}: ${message.slice(0, 240)}`);
      await this.journal.log({
        actionType: 'meeting_link_failed',
        status: 'error',
        prospectId: prospect.id,
        summary: `Le lien de rendez-vous n’a pas pu être envoyé à ${prospect.company}.`,
        details: { error: message.slice(0, 500) },
      });
      return { sent: false, reason: 'send_failed' };
    }
  }
}

function replySubject(value?: string | null) {
  const clean = String(value || 'Rendez-vous').trim();
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
