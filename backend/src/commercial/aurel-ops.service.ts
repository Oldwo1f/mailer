import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Draft } from '../entities/draft.entity';
import { DiscoveryJob } from '../entities/discovery-job.entity';
import { Prospect } from '../entities/prospect.entity';
import { Send } from '../entities/send.entity';
import { SettingsService } from '../settings/settings.service';

export type AurelOpsConfig = {
  bookingUrl: string | null;
  costPerSearchXpf: number;
  costPerEmailXpf: number;
  costPerAiGenerationXpf: number;
  hotPipelineFollowUpsEnabled: boolean;
};

@Injectable()
export class AurelOpsService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    @InjectRepository(Draft)
    private readonly drafts: Repository<Draft>,
    @InjectRepository(DiscoveryJob)
    private readonly jobs: Repository<DiscoveryJob>,
    private readonly settings: SettingsService,
  ) {}

  async config(): Promise<AurelOpsConfig> {
    const values = await this.settings.getRaw();
    return {
      bookingUrl:
        typeof values.aurelBookingUrl === 'string' && values.aurelBookingUrl.trim()
          ? values.aurelBookingUrl.trim()
          : null,
      costPerSearchXpf: nonNegative(values.aurelCostPerSearchXpf),
      costPerEmailXpf: nonNegative(values.aurelCostPerEmailXpf),
      costPerAiGenerationXpf: nonNegative(values.aurelCostPerAiGenerationXpf),
      hotPipelineFollowUpsEnabled:
        values.aurelHotPipelineFollowUpsEnabled !== false,
    };
  }

  async update(input: Partial<AurelOpsConfig>) {
    const patch: Record<string, string | number | boolean | null> = {};
    if (input.bookingUrl !== undefined) {
      patch.aurelBookingUrl = input.bookingUrl?.trim() || null;
    }
    if (input.costPerSearchXpf !== undefined) {
      patch.aurelCostPerSearchXpf = nonNegative(input.costPerSearchXpf);
    }
    if (input.costPerEmailXpf !== undefined) {
      patch.aurelCostPerEmailXpf = nonNegative(input.costPerEmailXpf);
    }
    if (input.costPerAiGenerationXpf !== undefined) {
      patch.aurelCostPerAiGenerationXpf = nonNegative(
        input.costPerAiGenerationXpf,
      );
    }
    if (input.hotPipelineFollowUpsEnabled !== undefined) {
      patch.aurelHotPipelineFollowUpsEnabled = Boolean(
        input.hotPipelineFollowUpsEnabled,
      );
    }
    await this.settings.update(patch);
    return this.snapshot();
  }

  async snapshot() {
    const [config, prospects, sends, drafts, jobs] = await Promise.all([
      this.config(),
      this.prospects.find(),
      this.sends.find(),
      this.drafts.find(),
      this.jobs.find(),
    ]);

    const wonValueXpf = prospects
      .filter((p) => p.leadStatus === 'won')
      .reduce((sum, p) => sum + Math.max(0, Number(p.dealValueXpf) || 0), 0);
    const sentEmails = sends.filter((s) => s.status === 'sent').length;
    const searchRequests = jobs.reduce(
      (sum, job) => sum + Math.max(0, Number(job.searches) || 0),
      0,
    );
    const aiGenerations = drafts.filter(
      (draft) => Boolean(draft.subject) && Boolean(draft.html) && draft.status !== 'error',
    ).length;

    const searchCostXpf = Math.round(searchRequests * config.costPerSearchXpf);
    const emailCostXpf = Math.round(sentEmails * config.costPerEmailXpf);
    const aiCostXpf = Math.round(
      aiGenerations * config.costPerAiGenerationXpf,
    );
    const trackedDirectCostXpf = searchCostXpf + emailCostXpf + aiCostXpf;
    const contributionAfterTrackedCostsXpf = wonValueXpf - trackedDirectCostXpf;
    const roi = trackedDirectCostXpf
      ? contributionAfterTrackedCostsXpf / trackedDirectCostXpf
      : null;
    const costsConfigured =
      config.costPerSearchXpf > 0 ||
      config.costPerEmailXpf > 0 ||
      config.costPerAiGenerationXpf > 0;

    return {
      generatedAt: new Date().toISOString(),
      config,
      bookingReady: Boolean(config.bookingUrl),
      directRoi: {
        costsConfigured,
        wonValueXpf,
        searchRequests,
        sentEmails,
        aiGenerations,
        searchCostXpf,
        emailCostXpf,
        aiCostXpf,
        trackedDirectCostXpf,
        contributionAfterTrackedCostsXpf,
        roi,
        note:
          'ROI direct suivi = CA gagné moins coûts unitaires configurés. Il n’inclut pas salaires, développement, fiscalité ni autres charges non renseignées.',
      },
    };
  }
}

function nonNegative(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}
