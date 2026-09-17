import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DiscoveryJob } from '../entities/discovery-job.entity';
import { Prospect } from '../entities/prospect.entity';
import { SenderIdentity } from '../entities/sender-identity.entity';
import { Campaign } from '../entities/campaign.entity';
import { DiscoverService } from '../discover/discover.service';
import { ProductMatcherService } from '../product-matcher/product-matcher.service';
import { QuotaService } from '../quota/quota.service';
import { SettingsService } from '../settings/settings.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { buildCommercialLearning } from './commercial-learning';
import {
  buildAcquisitionPlan,
  type AcquisitionMission,
} from './acquisition-planner';
import { ProductMarketService } from './product-market.service';
import { AurelJournalService } from './aurel-journal.service';

const ACQUISITION_LIST_PREFIX = 'Aurel acquisition · ';
const DEFAULT_MIN_HOURS = 12;
const DEFAULT_MAX_RUNS_24H = 2;

export type AcquisitionPolicy = {
  enabled: boolean;
  minHoursBetweenRuns: number;
  maxRuns24h: number;
  batchSize: 10;
  autoAcceptHighConfidence: boolean;
};

@Injectable()
export class AurelAcquisitionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AurelAcquisitionService.name);
  private poller: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(DiscoveryJob)
    private readonly jobs: Repository<DiscoveryJob>,
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
    @InjectRepository(Campaign)
    private readonly campaignRows: Repository<Campaign>,
    private readonly productMarkets: ProductMarketService,
    private readonly matcher: ProductMatcherService,
    private readonly discover: DiscoverService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
    private readonly campaigns: CampaignsService,
    private readonly journal: AurelJournalService,
  ) {}

  onModuleInit() {
    setTimeout(() => void this.tick(), 45_000);
    this.poller = setInterval(() => void this.tick(), 15 * 60_000);
  }

  onModuleDestroy() {
    if (this.poller) clearInterval(this.poller);
  }

  async getPolicy(): Promise<AcquisitionPolicy> {
    const values = await this.settings.getRaw();
    return {
      enabled: values.aurelAcquisitionEnabled !== false,
      minHoursBetweenRuns: clampInt(
        Number(values.aurelAcquisitionMinHours) || DEFAULT_MIN_HOURS,
        6,
        72,
      ),
      maxRuns24h: clampInt(
        Number(values.aurelAcquisitionMaxRuns24h) || DEFAULT_MAX_RUNS_24H,
        1,
        4,
      ),
      batchSize: 10,
      autoAcceptHighConfidence:
        values.aurelAcquisitionAutoAcceptHighConfidence !== false,
    };
  }

  async updatePolicy(input: Partial<Omit<AcquisitionPolicy, 'batchSize'>>) {
    const patch: Record<string, string | number | boolean> = {};
    if (input.enabled !== undefined) {
      patch.aurelAcquisitionEnabled = Boolean(input.enabled);
    }
    if (input.minHoursBetweenRuns !== undefined) {
      patch.aurelAcquisitionMinHours = clampInt(
        Number(input.minHoursBetweenRuns),
        6,
        72,
      );
    }
    if (input.maxRuns24h !== undefined) {
      patch.aurelAcquisitionMaxRuns24h = clampInt(
        Number(input.maxRuns24h),
        1,
        4,
      );
    }
    if (input.autoAcceptHighConfidence !== undefined) {
      patch.aurelAcquisitionAutoAcceptHighConfidence = Boolean(
        input.autoAcceptHighConfidence,
      );
    }
    await this.settings.update(patch);
    return this.snapshot();
  }

  async snapshot() {
    const [rows, markets, recentJobs, policy, searchProvider] =
      await Promise.all([
        this.prospects.find(),
        this.productMarkets.list(),
        this.jobs.find({ order: { createdAt: 'DESC' }, take: 80 }),
        this.getPolicy(),
        this.quota.pick('search'),
      ]);

    const learning = buildCommercialLearning(rows);
    let missions = buildAcquisitionPlan({
      learning,
      productMarkets: markets,
    });

    const acquisitionJobs = recentJobs.filter((job) =>
      job.listName?.startsWith(ACQUISITION_LIST_PREFIX),
    );
    missions = applyRecentHistory(missions, acquisitionJobs);

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const runs24h = acquisitionJobs.filter(
      (job) => new Date(job.createdAt).getTime() >= dayAgo,
    ).length;
    const lastRun = acquisitionJobs[0] || null;
    const activeJob =
      recentJobs.find(
        (job) => job.status === 'queued' || job.status === 'running',
      ) || null;
    const nextRunAt = lastRun
      ? new Date(
          new Date(lastRun.createdAt).getTime() +
            policy.minHoursBetweenRuns * 60 * 60 * 1000,
        )
      : null;
    const topMission = missions.find((mission) => mission.autoEligible) || null;

    let autoRunAllowed = true;
    let blockedReason: string | null = null;
    if (!policy.enabled) {
      autoRunAllowed = false;
      blockedReason = 'Boucle d’acquisition mise en pause.';
    } else if (activeJob) {
      autoRunAllowed = false;
      blockedReason = `Une découverte est déjà ${activeJob.status === 'running' ? 'en cours' : 'en file'}.`;
    } else if (!searchProvider) {
      autoRunAllowed = false;
      blockedReason = 'Aucun quota/provider de recherche disponible.';
    } else if (runs24h >= policy.maxRuns24h) {
      autoRunAllowed = false;
      blockedReason = `Plafond atteint : ${runs24h}/${policy.maxRuns24h} mission(s) sur 24 h.`;
    } else if (nextRunAt && nextRunAt.getTime() > now) {
      autoRunAllowed = false;
      blockedReason = `Prochaine fenêtre automatique : ${nextRunAt.toISOString()}.`;
    } else if (!topMission) {
      autoRunAllowed = false;
      blockedReason = 'Aucun segment éligible à prospecter automatiquement.';
    }

    return {
      generatedAt: new Date().toISOString(),
      policy,
      searchProvider,
      autoRunAllowed,
      blockedReason,
      runs24h,
      nextRunAt: nextRunAt?.toISOString() || null,
      activeJob,
      topMission,
      missions,
      learningBaseline: learning.baseline,
    };
  }

  async runNow(missionKey?: string | null) {
    const state = await this.snapshot();
    if (state.activeJob) {
      throw new ConflictException('Une découverte est déjà en cours.');
    }
    if (!state.searchProvider) {
      throw new ConflictException('Aucun provider de recherche disponible.');
    }
    const mission = missionKey
      ? state.missions.find((row) => row.key === missionKey)
      : state.topMission;
    if (!mission) throw new NotFoundException('Mission d’acquisition introuvable');
    if (!mission.autoEligible) {
      throw new ConflictException('Ce segment est actuellement en pause ou non autorisé.');
    }
    return this.startMission(mission);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.postProcessCompletedJobs();
      const state = await this.snapshot();
      if (!state.autoRunAllowed || !state.topMission) return;
      await this.startMission(state.topMission);
    } catch (err) {
      this.logger.warn(
        `Acquisition tick: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async startMission(mission: AcquisitionMission) {
    const date = new Date().toISOString().slice(0, 10);
    const listName = `${ACQUISITION_LIST_PREFIX}${mission.productName} · ${mission.activity} · ${date}`;
    this.logger.log(
      `Aurel acquisition: ${mission.productName} / ${mission.activity} (${mission.strategy}, priorité ${mission.priority})`,
    );
    const job = await this.discover.start({
      keywords: mission.keywords,
      location: 'Polynésie française',
      newListName: listName,
      batchSize: 10,
    });
    job.aurelMissionKey = mission.key;
    job.aurelProductId = mission.productId;
    job.aurelProductName = mission.productName;
    job.aurelActivity = mission.activity;
    job.aurelCampaignIds = null;
    job.aurelPostProcessedAt = null;
    await this.jobs.save(job);
    await this.journal.log({
      actionType: 'acquisition_started',
      jobId: job.id,
      summary: `Aurel lance une recherche ${mission.productName} / ${mission.activity}.`,
      details: {
        missionKey: mission.key,
        strategy: mission.strategy,
        priority: mission.priority,
        batchSize: 10,
      },
    });
    return job;
  }

  private async postProcessCompletedJobs() {
    const policy = await this.getPolicy();
    const completed = await this.jobs.find({
      where: { status: 'done' },
      order: { finishedAt: 'DESC' },
      take: 30,
    });
    const acquisitionJobs = completed.filter(
      (job) =>
        job.listName?.startsWith(ACQUISITION_LIST_PREFIX) &&
        !job.aurelPostProcessedAt,
    );
    if (!acquisitionJobs.length) return;

    const [rows, markets] = await Promise.all([
      this.prospects.find(),
      this.productMarkets.list(),
    ]);
    const plan = buildAcquisitionPlan({
      learning: buildCommercialLearning(rows),
      productMarkets: markets,
    });

    for (const job of acquisitionJobs) {
      try {
        if (job.aurelCampaignIds?.length) {
          const recovered = await this.recoverCampaigns(job);
          if (recovered) {
            job.aurelPostProcessedAt = new Date();
            await this.jobs.save(job);
          }
          continue;
        }

        const mission =
          plan.find((row) => row.key === job.aurelMissionKey) ||
          plan.find((row) => row.keywords === job.keywords) ||
          null;
        if (!mission) {
          await this.journal.log({
            actionType: 'acquisition_handoff_blocked',
            status: 'blocked',
            jobId: job.id,
            summary: `Mission commerciale introuvable pour ${job.listName}.`,
          });
          continue;
        }

        const ids = [
          ...new Set(
            (job.results?.prospects || [])
              .filter((row) => row.created)
              .map((row) => row.id),
          ),
        ];
        const acceptedIds: string[] = [];

        for (const id of ids) {
          try {
            let prospect = await this.matcher.matchOne(id);
            let rec = prospect.productRecommendation;
            if (
              policy.autoAcceptHighConfidence &&
              rec &&
              rec.reviewState === 'unreviewed' &&
              rec.confidence === 'high' &&
              rec.score >= 70 &&
              rec.suggestedProductId === mission.productId
            ) {
              const market = await this.productMarkets.get(
                rec.suggestedProductId,
                prospect.marketId || 'pf',
              );
              if (market?.enabled && market.autopilotEnabled) {
                prospect = await this.matcher.review(id, {
                  reviewState: 'accepted',
                  note: `Validé automatiquement par Aurel Acquisition : correspondance forte avec la mission ${mission.productName} / ${mission.activity}.`,
                });
                rec = prospect.productRecommendation;
                await this.journal.log({
                  actionType: 'product_auto_accepted',
                  prospectId: prospect.id,
                  jobId: job.id,
                  summary: `${prospect.company} validé automatiquement pour ${mission.productName}.`,
                  details: { score: rec?.score || null, confidence: rec?.confidence || null },
                });
              }
            }

            if (
              rec &&
              ['accepted', 'overridden'].includes(rec.reviewState) &&
              rec.productId === mission.productId &&
              prospect.leadStatus === 'new' &&
              !prospect.unsubscribedAt &&
              !prospect.replyDetectedAt
            ) {
              acceptedIds.push(prospect.id);
            }
          } catch (err) {
            this.logger.warn(
              `Acquisition post-process ${id}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        }

        if (!acceptedIds.length) {
          job.aurelPostProcessedAt = new Date();
          await this.jobs.save(job);
          await this.journal.log({
            actionType: 'acquisition_completed_no_campaign',
            jobId: job.id,
            summary: `${job.listName} terminé : aucun prospect assez sûr pour une campagne autonome.`,
            details: { found: job.found, createdCandidates: ids.length },
          });
          continue;
        }

        const created = await this.createAutonomousCampaigns(
          job,
          mission,
          acceptedIds,
        );
        if (!created.length) continue;

        job.aurelCampaignIds = created;
        await this.jobs.save(job);

        let generatedAll = true;
        for (const campaignId of created) {
          try {
            await this.campaigns.generate(campaignId);
            await this.journal.log({
              actionType: 'campaign_generated',
              campaignId,
              jobId: job.id,
              summary: `Aurel a généré la campagne ${mission.productName} ; Autopilot peut maintenant l’envoyer.`,
            });
          } catch (err) {
            generatedAll = false;
            const message = err instanceof Error ? err.message : String(err);
            await this.journal.log({
              actionType: 'campaign_generation_failed',
              status: 'error',
              campaignId,
              jobId: job.id,
              summary: `La campagne automatique ${mission.productName} n’a pas pu être générée.`,
              details: { error: message.slice(0, 500) },
            });
          }
        }

        if (generatedAll) {
          job.aurelPostProcessedAt = new Date();
          await this.jobs.save(job);
        }
      } catch (err) {
        this.logger.warn(
          `Acquisition handoff ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  private async createAutonomousCampaigns(
    job: DiscoveryJob,
    mission: AcquisitionMission,
    prospectIds: string[],
  ) {
    const sender =
      (await this.senders.findOne({ where: { isDefault: true } })) ||
      (await this.senders.findOne({ order: { createdAt: 'ASC' } }));
    if (!sender) {
      await this.journal.log({
        actionType: 'campaign_creation_blocked',
        status: 'blocked',
        jobId: job.id,
        summary: `Aucune identité d’expéditeur : campagne ${mission.productName} non créée.`,
      });
      return [];
    }

    const market = await this.productMarkets.get(mission.productId, mission.marketId);
    if (!market?.enabled || !market.autopilotEnabled) return [];

    const sorted = [...new Set(prospectIds)].sort();
    const variants: Array<{ label: string; ids: string[] }> =
      sorted.length >= 6
        ? [
            { label: 'A', ids: sorted.filter((_, index) => index % 2 === 0) },
            { label: 'B', ids: sorted.filter((_, index) => index % 2 === 1) },
          ]
        : [{ label: 'A', ids: sorted }];
    const experimentKey = `acquisition:${job.id}`;
    const campaignIds: string[] = [];

    for (const variant of variants.filter((row) => row.ids.length)) {
      const brief = buildCampaignBrief(mission, market.effectivePriceLabel, variant.label);
      const followUp = buildFollowUpBrief(mission, variant.label);
      const name = `Aurel · ${mission.productName} · ${mission.activity} · ${variant.label} · ${new Date().toISOString().slice(0, 10)}`;
      const campaign = await this.campaigns.create({
        name,
        brief,
        tone: 'professionnel',
        emailType: 'classique',
        language: 'fr',
        senderId: sender.id,
        prospectIds: variant.ids,
        steps: [
          { name: 'Premier contact', brief, delayDays: 0 },
          { name: 'Relance courte', brief: followUp, delayDays: 4 },
        ],
      });
      await this.campaignRows.update(campaign.id, {
        aurelSource: 'acquisition',
        experimentKey,
        experimentVariant: variant.label,
      });
      campaignIds.push(campaign.id);
      await this.journal.log({
        actionType: 'campaign_created',
        campaignId: campaign.id,
        jobId: job.id,
        summary: `Aurel a créé ${name} pour ${variant.ids.length} prospect(s).`,
        details: {
          productId: mission.productId,
          activity: mission.activity,
          experimentKey,
          variant: variant.label,
          prospects: variant.ids.length,
        },
      });
    }

    return campaignIds;
  }

  private async recoverCampaigns(job: DiscoveryJob) {
    let allReady = true;
    for (const campaignId of job.aurelCampaignIds || []) {
      try {
        const campaign = await this.campaigns.get(campaignId);
        if (campaign.status === 'draft' || campaign.status === 'failed') {
          await this.campaigns.generate(campaignId);
          await this.journal.log({
            actionType: 'campaign_recovered',
            campaignId,
            jobId: job.id,
            summary: `Aurel a repris une campagne automatique interrompue.`,
          });
        } else if (campaign.status === 'generating') {
          allReady = false;
        }
      } catch (err) {
        allReady = false;
        this.logger.warn(
          `Campaign recovery ${campaignId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return allReady;
  }
}

function buildCampaignBrief(
  mission: AcquisitionMission,
  priceLabel: string | null,
  variant: string,
) {
  const price = priceLabel ? ` Offre actuelle : ${priceLabel}.` : '';
  const angle =
    variant === 'B'
      ? 'Commencer par un bénéfice concret de temps gagné et de simplicité, puis poser une seule question courte sur leur fonctionnement actuel.'
      : 'Commencer par le problème métier probable lié à leur activité, rester très concret, puis proposer une prochaine étape simple sans pression.';
  return `Prospection Atelys pour ${mission.productName}, destinée à des entreprises de type « ${mission.activity} » en Polynésie française.${price} ${angle} Ne jamais inventer de fait sur l’entreprise. Ne pas prétendre avoir audité son organisation si les données ne le prouvent pas. Email court, humain, spécifique et orienté conversation. Présenter ${mission.productName} seulement si cela découle des faits disponibles.`;
}

function buildFollowUpBrief(mission: AcquisitionMission, variant: string) {
  const angle =
    variant === 'B'
      ? 'Rappeler le bénéfice concret en une phrase et demander si le sujet mérite d’être regardé maintenant.'
      : 'Faire une relance très courte, sans répéter le premier email, avec une seule question simple.';
  return `Relance de la campagne ${mission.productName} pour ${mission.activity}. ${angle} Ne pas insister si aucun signal n’existe. Ton professionnel, direct et respectueux.`;
}

function applyRecentHistory(
  missions: AcquisitionMission[],
  jobs: DiscoveryJob[],
): AcquisitionMission[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return missions
    .map((mission) => {
      const recent = jobs.filter(
        (job) =>
          job.keywords === mission.keywords &&
          new Date(job.createdAt).getTime() >= weekAgo,
      ).length;
      if (!recent || mission.strategy === 'pause') return mission;
      const penalty = Math.min(30, recent * 12);
      return {
        ...mission,
        priority: Math.max(1, mission.priority - penalty),
        reason: `${mission.reason} Rotation anti-saturation : ${recent} mission(s) similaire(s) sur 7 jours (-${penalty} pts).`,
      };
    })
    .sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.round(Math.min(max, Math.max(min, value)));
}
