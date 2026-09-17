import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { Draft } from '../entities/draft.entity';
import { CampaignSendService } from '../mail/campaign-send.service';
import { shouldSuppressOutbound } from './commercial.rules';
import { ProductMarketService } from './product-market.service';

/**
 * Executes low-risk commercial decisions that Adrien/Alexis delegated to Aurel.
 *
 * Current scope:
 * - campaigns still need to be created/generated through the existing workflow;
 * - once drafts exist, no human approval is required for eligible PF products;
 * - only reviewed Product Matcher recommendations can enter Autopilot;
 * - unsubscribe/reply/commercial-progress suppression remains authoritative;
 * - disabled product markets never send.
 */
@Injectable()
export class AurelAutopilotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AurelAutopilotService.name);
  private poller: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Draft)
    private readonly drafts: Repository<Draft>,
    private readonly productMarkets: ProductMarketService,
    private readonly sendService: CampaignSendService,
  ) {}

  onModuleInit() {
    this.poller = setInterval(() => void this.tick(), 60_000);
    setTimeout(() => void this.tick(), 8_000);
  }

  onModuleDestroy() {
    if (this.poller) clearInterval(this.poller);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const reviewCampaigns = await this.campaigns.find({
        where: { status: 'review' },
        relations: ['sender', 'steps'],
        order: { createdAt: 'ASC' },
      });

      for (const campaign of reviewCampaigns) {
        try {
          await this.processCampaign(campaign);
        } catch (err) {
          this.logger.warn(
            `Autopilot campaign ${campaign.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processCampaign(campaign: Campaign) {
    if (!campaign.senderId || !campaign.sender) return;
    if (this.sendService.isRunning(campaign.id)) return;

    const drafts = await this.drafts.find({
      where: { campaignId: campaign.id },
      relations: ['prospect', 'step'],
      order: { createdAt: 'ASC' },
    });

    let approved = 0;
    for (const draft of drafts) {
      if (draft.status !== 'ready' || !draft.prospect) continue;
      if (!draft.subject || !draft.html) continue;
      if (shouldSuppressOutbound(draft.prospect)) continue;

      const recommendation = draft.prospect.productRecommendation;
      if (!recommendation) continue;
      if (!['accepted', 'overridden'].includes(recommendation.reviewState)) {
        continue;
      }

      const marketId = draft.prospect.marketId || 'pf';
      const allowed = await this.productMarkets.isAutopilotEnabled(
        recommendation.productId,
        marketId,
      );
      if (!allowed) continue;

      draft.status = 'approved';
      draft.error = null;
      await this.drafts.save(draft);
      approved += 1;
    }

    const steps = (campaign.steps || []).sort(
      (a, b) => a.position - b.position,
    );
    const firstStepId = steps[0]?.id || null;
    const approvedFirstStep = await this.drafts.count({
      where: firstStepId
        ? ({ campaignId: campaign.id, stepId: firstStepId, status: 'approved' } as any)
        : ({ campaignId: campaign.id, status: 'approved' } as any),
    });

    if (!approvedFirstStep) return;

    this.logger.log(
      `Aurel Autopilot: ${approved} draft(s) approved for ${campaign.name}; starting eligible sends`,
    );
    await this.sendService.startCampaign(campaign.id);
  }
}
