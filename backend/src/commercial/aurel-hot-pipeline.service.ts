import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { SettingsService } from '../settings/settings.service';
import { AurelJournalService } from './aurel-journal.service';

const STAGE_DELAYS_DAYS: Record<string, number> = {
  interested: 4,
  demo: 3,
  quote: 4,
};

@Injectable()
export class AurelHotPipelineService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AurelHotPipelineService.name);
  private poller: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    private readonly settings: SettingsService,
    private readonly journal: AurelJournalService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.tick(), 25_000);
    this.poller = setInterval(() => void this.tick(), 60 * 60_000);
  }

  onModuleDestroy() {
    if (this.poller) clearInterval(this.poller);
  }

  async tick() {
    if (this.running) return { scheduled: 0, cooled: 0 };
    this.running = true;
    let scheduled = 0;
    let cooled = 0;
    try {
      const values = await this.settings.getRaw();
      if (values.aurelHotPipelineFollowUpsEnabled === false) {
        return { scheduled: 0, cooled: 0 };
      }

      const rows = await this.prospects.find({ order: { updatedAt: 'ASC' } });
      const now = Date.now();
      for (const prospect of rows) {
        if (prospect.unsubscribedAt || ['won', 'lost'].includes(prospect.leadStatus)) {
          continue;
        }

        const delayDays = STAGE_DELAYS_DAYS[prospect.leadStatus];
        if (
          delayDays &&
          !prospect.deferredFollowUpAt &&
          !prospect.deferredFollowUpSentAt
        ) {
          const ageMs = now - new Date(prospect.updatedAt).getTime();
          if (ageMs >= delayDays * 24 * 60 * 60 * 1000) {
            prospect.deferredFollowUpAt = new Date();
            prospect.deferredFollowUpReason = `stage:${prospect.leadStatus}`;
            prospect.nextCommercialAction = stageAction(prospect.leadStatus);
            await this.prospects.save(prospect);
            scheduled += 1;
            await this.journal.log({
              actionType: 'hot_followup_scheduled',
              prospectId: prospect.id,
              summary: `Aurel programme une relance ${prospect.leadStatus} pour ${prospect.company}.`,
              details: { leadStatus: prospect.leadStatus, delayDays },
            });
          }
          continue;
        }

        if (
          ['new', 'contacted'].includes(prospect.leadStatus) &&
          !prospect.replyDetectedAt
        ) {
          const ageDays =
            (now - new Date(prospect.updatedAt).getTime()) / (24 * 60 * 60 * 1000);
          if (
            ageDays >= 60 &&
            prospect.nextCommercialAction !==
              'Prospect froid depuis 60 jours — aucune énergie supplémentaire tant qu’aucun nouveau signal n’apparaît.'
          ) {
            prospect.nextCommercialAction =
              'Prospect froid depuis 60 jours — aucune énergie supplémentaire tant qu’aucun nouveau signal n’apparaît.';
            await this.prospects.save(prospect);
            cooled += 1;
            await this.journal.log({
              actionType: 'prospect_cooled',
              prospectId: prospect.id,
              summary: `${prospect.company} est mis au repos après 60 jours sans signal.`,
            });
          }
        }
      }
      return { scheduled, cooled };
    } catch (err) {
      this.logger.warn(
        `Hot pipeline housekeeping: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { scheduled, cooled };
    } finally {
      this.running = false;
    }
  }
}

function stageAction(status: string) {
  if (status === 'quote') return 'Relance devis due — Aurel va revenir vers le prospect.';
  if (status === 'demo') return 'Relance après démo due — Aurel va demander un retour.';
  return 'Relance intérêt due — Aurel va vérifier si le sujet avance.';
}
