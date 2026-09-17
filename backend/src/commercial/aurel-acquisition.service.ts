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
import { DiscoverService } from '../discover/discover.service';
import { ProductMatcherService } from '../product-matcher/product-matcher.service';
import { QuotaService } from '../quota/quota.service';
import { SettingsService } from '../settings/settings.service';
import { buildCommercialLearning } from './commercial-learning';
import {
  buildAcquisitionPlan,
  type AcquisitionMission,
} from './acquisition-planner';
import { ProductMarketService } from './product-market.service';

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
  private readonly processedJobs = new Set<string>();

  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(DiscoveryJob)
    private readonly jobs: Repository<DiscoveryJob>,
    private readonly productMarkets: ProductMarketService,
    private readonly matcher: ProductMatcherService,
    private readonly discover: DiscoverService,
    private readonly quota: QuotaService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    // Short first delay so DB synchronization and the other pollers are already settled.
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
    return this.discover.start({
      keywords: mission.keywords,
      location: 'Polynésie française',
      newListName: listName,
      batchSize: 10,
    });
  }

  private async postProcessCompletedJobs() {
    const policy = await this.getPolicy();
    const completed = await this.jobs.find({
      where: { status: 'done' },
      order: { finishedAt: 'DESC' },
      take: 20,
    });
    const acquisitionJobs = completed.filter(
      (job) =>
        job.listName?.startsWith(ACQUISITION_LIST_PREFIX) &&
        !this.processedJobs.has(job.id),
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
      const mission = plan.find((row) => row.keywords === job.keywords);
      const ids = [...new Set((job.results?.prospects || []).map((p) => p.id))];
      for (const id of ids) {
        try {
          const prospect = await this.matcher.matchOne(id);
          const rec = prospect.productRecommendation;
          if (
            !policy.autoAcceptHighConfidence ||
            !mission ||
            !rec ||
            rec.reviewState !== 'unreviewed' ||
            rec.confidence !== 'high' ||
            rec.score < 70 ||
            rec.suggestedProductId !== mission.productId
          ) {
            continue;
          }
          const market = await this.productMarkets.get(
            rec.suggestedProductId,
            prospect.marketId || 'pf',
          );
          if (!market?.enabled || !market.autopilotEnabled) continue;
          await this.matcher.review(id, {
            reviewState: 'accepted',
            note: `Validé automatiquement par Aurel Acquisition : correspondance forte avec la mission ${mission.productName} / ${mission.activity}.`,
          });
        } catch (err) {
          this.logger.warn(
            `Acquisition post-process ${id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      this.processedJobs.add(job.id);
    }
  }
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
