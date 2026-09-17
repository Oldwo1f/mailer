import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { Campaign } from '../entities/campaign.entity';
import { Send } from '../entities/send.entity';
import { DiscoveryJob } from '../entities/discovery-job.entity';
import { buildCommercialLearning } from './commercial-learning';
import { AurelJournalService } from './aurel-journal.service';

@Injectable()
export class AurelReportService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    @InjectRepository(DiscoveryJob)
    private readonly jobs: Repository<DiscoveryJob>,
    private readonly journal: AurelJournalService,
  ) {}

  async report() {
    const [prospects, campaigns, sends, jobs, recentActions] = await Promise.all([
      this.prospects.find({ order: { updatedAt: 'DESC' } }),
      this.campaigns.find({ order: { createdAt: 'DESC' }, take: 100 }),
      this.sends.find({ order: { createdAt: 'DESC' } }),
      this.jobs.find({ order: { createdAt: 'DESC' }, take: 100 }),
      this.journal.recent(30),
    ]);

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const activeStatuses = new Set(['interested', 'demo', 'meeting', 'quote']);
    const won = prospects.filter((p) => p.leadStatus === 'won');
    const lost = prospects.filter((p) => p.leadStatus === 'lost');
    const opportunities = prospects.filter((p) => activeStatuses.has(p.leadStatus));
    const replied = prospects.filter((p) => Boolean(p.replyDetectedAt));
    const sent = sends.filter((s) => s.status === 'sent');
    const opened = sent.filter((s) => s.openCount > 0);
    const clicked = sent.filter((s) => s.clickCount > 0);
    const wonValueXpf = won.reduce(
      (sum, p) => sum + Math.max(0, Number(p.dealValueXpf) || 0),
      0,
    );
    const acquisitionJobs = jobs.filter((job) =>
      job.listName?.startsWith('Aurel acquisition · '),
    );
    const acquisition24h = acquisitionJobs.filter(
      (job) => new Date(job.createdAt).getTime() >= dayAgo,
    );
    const searchRequests = acquisitionJobs.reduce(
      (sum, job) => sum + Math.max(0, Number(job.searches) || 0),
      0,
    );
    const learning = buildCommercialLearning(prospects);
    const learned = learning.segments.filter(
      (segment) => segment.confidence !== 'collecting',
    );
    const topPositive = [...learned]
      .filter((s) => s.radarAdjustment > 0)
      .sort((a, b) => b.radarAdjustment - a.radarAdjustment || b.contacted - a.contacted)
      .slice(0, 5);
    const topNegative = [...learned]
      .filter((s) => s.radarAdjustment < 0)
      .sort((a, b) => a.radarAdjustment - b.radarAdjustment || b.contacted - a.contacted)
      .slice(0, 5);

    const experimentCampaigns = campaigns.filter((c) => c.experimentKey);
    const experiments = buildExperiments(experimentCampaigns, prospects, sends);

    const dueFollowUps = prospects.filter(
      (p) =>
        p.deferredFollowUpAt &&
        !p.deferredFollowUpSentAt &&
        new Date(p.deferredFollowUpAt).getTime() <= now &&
        !['won', 'lost'].includes(p.leadStatus),
    );
    const upcomingFollowUps = prospects.filter(
      (p) =>
        p.deferredFollowUpAt &&
        !p.deferredFollowUpSentAt &&
        new Date(p.deferredFollowUpAt).getTime() > now &&
        !['won', 'lost'].includes(p.leadStatus),
    );

    const priorityActions = prospects
      .filter(
        (p) =>
          Boolean(p.nextCommercialAction) &&
          ['replied', 'interested', 'demo', 'meeting', 'quote'].includes(p.leadStatus),
      )
      .slice(0, 12)
      .map((p) => ({
        prospectId: p.id,
        company: p.company,
        leadStatus: p.leadStatus,
        productName: p.productRecommendation?.productName || null,
        action: p.nextCommercialAction,
        deferredFollowUpAt: p.deferredFollowUpAt,
        updatedAt: p.updatedAt,
      }));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        prospects: prospects.length,
        contacted: prospects.filter((p) => p.leadStatus !== 'new').length,
        replies: replied.length,
        opportunities: opportunities.length,
        won: won.length,
        lost: lost.length,
        wonValueXpf,
        sentEmails: sent.length,
        openedEmails: opened.length,
        clickedEmails: clicked.length,
        activeCampaigns: campaigns.filter((c) =>
          ['generating', 'review', 'sending', 'waiting'].includes(c.status),
        ).length,
        deferredDue: dueFollowUps.length,
        deferredUpcoming: upcomingFollowUps.length,
      },
      rates: {
        replyRate: sent.length ? replied.length / Math.max(1, prospects.filter((p) => p.leadStatus !== 'new').length) : null,
        openRate: sent.length ? opened.length / sent.length : null,
        clickRate: sent.length ? clicked.length / sent.length : null,
        closedWinRate:
          won.length + lost.length ? won.length / (won.length + lost.length) : null,
      },
      acquisition: {
        missions24h: acquisition24h.length,
        totalMissions: acquisitionJobs.length,
        totalSearchRequests: searchRequests,
        prospectsFound: acquisitionJobs.reduce(
          (sum, job) => sum + Math.max(0, Number(job.found) || 0),
          0,
        ),
        lastMission: acquisitionJobs[0] || null,
      },
      efficiency: {
        wonValueXpf,
        valuePerSentEmailXpf: sent.length ? Math.round(wonValueXpf / sent.length) : null,
        valuePerSearchRequestXpf: searchRequests
          ? Math.round(wonValueXpf / searchRequests)
          : null,
        note:
          'Indicateurs opérationnels : ils comparent le CA gagné aux volumes d’envoi/recherche, sans prétendre calculer la marge comptable réelle.',
      },
      learning: {
        baseline: learning.baseline,
        topPositive,
        topNegative,
        replyIntents: learning.replyIntents,
      },
      experiments,
      priorityActions,
      recentActions,
    };
  }
}

function buildExperiments(
  campaigns: Campaign[],
  prospects: Prospect[],
  sends: Send[],
) {
  const byProspect = new Map(prospects.map((p) => [p.id, p]));
  const groups = new Map<
    string,
    {
      key: string;
      variants: Array<{
        variant: string;
        campaigns: number;
        prospects: number;
        sent: number;
        opens: number;
        clicks: number;
        replies: number;
        won: number;
      }>;
    }
  >();

  for (const campaign of campaigns) {
    if (!campaign.experimentKey) continue;
    const key = campaign.experimentKey;
    let group = groups.get(key);
    if (!group) {
      group = { key, variants: [] };
      groups.set(key, group);
    }
    const variantName = campaign.experimentVariant || 'A';
    let variant = group.variants.find((v) => v.variant === variantName);
    if (!variant) {
      variant = {
        variant: variantName,
        campaigns: 0,
        prospects: 0,
        sent: 0,
        opens: 0,
        clicks: 0,
        replies: 0,
        won: 0,
      };
      group.variants.push(variant);
    }
    variant.campaigns += 1;
    const ids = [...new Set(campaign.prospectIds || [])];
    variant.prospects += ids.length;
    variant.replies += ids.filter((id) => Boolean(byProspect.get(id)?.replyDetectedAt)).length;
    variant.won += ids.filter((id) => byProspect.get(id)?.leadStatus === 'won').length;
    const campaignSends = sends.filter(
      (send) => send.campaignId === campaign.id && send.status === 'sent',
    );
    variant.sent += campaignSends.length;
    variant.opens += campaignSends.filter((send) => send.openCount > 0).length;
    variant.clicks += campaignSends.filter((send) => send.clickCount > 0).length;
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      variants: group.variants.sort((a, b) => a.variant.localeCompare(b.variant)),
    }))
    .slice(0, 12);
}
