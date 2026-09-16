import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CampaignStep } from '../entities/campaign-step.entity';
import { Draft } from '../entities/draft.entity';
import { Send } from '../entities/send.entity';
import { SenderIdentity } from '../entities/sender-identity.entity';
import { ProspectsService } from '../prospects/prospects.service';
import { ListsService } from '../lists/lists.service';
import { LlmService } from '../llm/llm.service';
import { CampaignSendService } from '../mail/campaign-send.service';
import { WebSearchService } from '../search/web-search.service';
import { isPublicHttpUrl } from '../prospects/prospect.utils';

export type StepInput = {
  name?: string;
  brief: string;
  delayDays?: number;
};

export type PrepareCampaignInput = {
  goal: string;
  productUrl?: string;
  tone?: string;
  emailType?: string;
  language?: string;
  stepCount?: number;
};

export type PrepareCampaignResult = {
  name: string;
  steps: Array<{ name: string; brief: string; delayDays: number }>;
  warning?: string;
};

@Injectable()
export class CampaignsService implements OnModuleInit {
  private poller: ReturnType<typeof setInterval> | null = null;

  constructor(
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(CampaignStep)
    private readonly steps: Repository<CampaignStep>,
    @InjectRepository(Draft)
    private readonly drafts: Repository<Draft>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    @InjectRepository(SenderIdentity)
    private readonly senders: Repository<SenderIdentity>,
    private readonly prospects: ProspectsService,
    private readonly lists: ListsService,
    private readonly llm: LlmService,
    private readonly sendService: CampaignSendService,
    private readonly webSearch: WebSearchService,
  ) {}

  onModuleInit() {
    this.poller = setInterval(() => {
      void this.sendService.processDueSteps();
    }, 60_000);
    // Kick once shortly after boot
    setTimeout(() => void this.sendService.processDueSteps(), 5_000);
  }

  list() {
    return this.campaigns.find({
      order: { createdAt: 'DESC' },
      relations: ['sender', 'steps'],
    });
  }

  async get(id: string) {
    const campaign = await this.campaigns.findOne({
      where: { id },
      relations: ['sender', 'drafts', 'drafts.prospect', 'drafts.step', 'steps'],
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (campaign.steps?.length) {
      campaign.steps.sort((a, b) => a.position - b.position);
    }
    const sends = await this.sends.find({
      where: { campaignId: id },
      relations: ['prospect'],
      order: { createdAt: 'ASC' },
    });
    return { ...campaign, sends };
  }

  async prepare(data: PrepareCampaignInput): Promise<PrepareCampaignResult> {
    const goal = data.goal?.trim();
    if (!goal) {
      throw new BadRequestException('Brief général requis');
    }
    if (
      data.stepCount != null &&
      (data.stepCount < 2 || data.stepCount > 5)
    ) {
      throw new BadRequestException('stepCount doit être entre 2 et 5');
    }

    let productContent: string | null = null;
    let warning: string | undefined;
    const productUrl = data.productUrl?.trim() || '';

    if (productUrl) {
      if (!isPublicHttpUrl(productUrl)) {
        throw new BadRequestException('URL produit invalide ou non publique');
      }
      productContent = await this.webSearch.scrapeUrl(productUrl, {
        maxChars: 4000,
      });
      if (!productContent) {
        const html = await this.webSearch.fetchPublicPage(productUrl);
        if (html) {
          productContent = htmlToPlainText(html).slice(0, 4000) || null;
        }
      }
      if (!productContent) {
        warning =
          'Impossible d’analyser le lien produit ; séquence basée sur le brief seul.';
      }
    }

    let prepared: Awaited<ReturnType<LlmService['prepareCampaignSequence']>>;
    try {
      prepared = await this.llm.prepareCampaignSequence({
        goal,
        productUrl: productUrl || null,
        productContent,
        tone: data.tone,
        emailType: data.emailType,
        language: data.language,
        stepCount: data.stepCount,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Échec de la préparation IA';
      throw new BadRequestException(message);
    }

    return {
      name: prepared.name,
      steps: prepared.steps,
      ...(warning ? { warning } : {}),
    };
  }

  async create(data: {
    name: string;
    brief: string;
    tone?: string;
    emailType?: string;
    language?: string;
    senderId?: string;
    prospectIds?: string[];
    listIds?: string[];
    steps?: StepInput[];
  }) {
    const row = this.campaigns.create({
      name: data.name,
      brief: data.brief,
      tone: data.tone || 'professionnel',
      emailType: data.emailType || 'classique',
      language: data.language || 'fr',
      senderId: data.senderId || null,
      prospectIds: data.prospectIds || null,
      listIds: data.listIds || null,
      status: 'draft',
      currentStepIndex: 0,
      nextStepAt: null,
    });
    const campaign = await this.campaigns.save(row);

    const stepInputs =
      data.steps?.length && data.steps.some((s) => s.brief?.trim())
        ? data.steps
        : [{ name: 'Email 1', brief: data.brief, delayDays: 0 }];

    for (let i = 0; i < stepInputs.length; i++) {
      const s = stepInputs[i];
      await this.steps.save(
        this.steps.create({
          campaignId: campaign.id,
          position: i,
          name: s.name?.trim() || `Email ${i + 1}`,
          brief: s.brief.trim() || data.brief,
          delayDays: i === 0 ? 0 : Math.max(0, Number(s.delayDays) || 0),
        }),
      );
    }

    return this.get(campaign.id);
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      brief: string;
      tone: string;
      emailType: string;
      language: string;
      senderId: string | null;
      prospectIds: string[] | null;
      listIds: string[] | null;
      steps: StepInput[];
    }>,
  ) {
    const campaign = await this.campaigns.findOne({
      where: { id },
      relations: ['steps'],
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    if (data.senderId) {
      const sender = await this.senders.findOneBy({ id: data.senderId });
      if (!sender) throw new BadRequestException('Expéditeur invalide');
    }

    const { steps: stepInputs, ...rest } = data;
    Object.assign(campaign, rest);
    await this.campaigns.save(campaign);

    if (stepInputs && Array.isArray(stepInputs) && stepInputs.length) {
      if (['sending', 'waiting', 'sent'].includes(campaign.status)) {
        throw new BadRequestException(
          'Impossible de modifier les étapes d’une campagne déjà lancée',
        );
      }
      await this.steps.delete({ campaignId: id });
      for (let i = 0; i < stepInputs.length; i++) {
        const s = stepInputs[i];
        await this.steps.save(
          this.steps.create({
            campaignId: id,
            position: i,
            name: s.name?.trim() || `Email ${i + 1}`,
            brief: (s.brief || campaign.brief).trim(),
            delayDays: i === 0 ? 0 : Math.max(0, Number(s.delayDays) || 0),
          }),
        );
      }
      // Keep top-level brief in sync with first step
      if (stepInputs[0]?.brief) {
        campaign.brief = stepInputs[0].brief.trim();
        await this.campaigns.save(campaign);
      }
    }

    return this.get(id);
  }

  async remove(id: string) {
    const campaign = await this.campaigns.findOneBy({ id });
    if (!campaign) throw new NotFoundException('Campagne introuvable');
    await this.campaigns.remove(campaign);
    return { ok: true };
  }

  private async resolveProspects(campaign: Campaign) {
    const idSet = new Set<string>();

    if (campaign.listIds?.length) {
      const fromLists = await this.lists.getProspectIdsForLists(
        campaign.listIds,
      );
      for (const id of fromLists) idSet.add(id);
    }
    if (campaign.prospectIds?.length) {
      for (const id of campaign.prospectIds) idSet.add(id);
    }

    if (idSet.size) {
      return this.prospects.findActiveByIds([...idSet]);
    }
    return this.prospects.findAll({ unsubscribed: false });
  }

  private async ensureSteps(campaign: Campaign): Promise<CampaignStep[]> {
    let steps = await this.steps.find({
      where: { campaignId: campaign.id },
      order: { position: 'ASC' },
    });
    if (!steps.length) {
      const step = await this.steps.save(
        this.steps.create({
          campaignId: campaign.id,
          position: 0,
          name: 'Email 1',
          brief: campaign.brief,
          delayDays: 0,
        }),
      );
      steps = [step];
    }
    return steps;
  }

  async generate(id: string) {
    const campaign = await this.campaigns.findOne({
      where: { id },
      relations: ['sender'],
    });
    if (!campaign) throw new NotFoundException('Campagne introuvable');

    const steps = await this.ensureSteps(campaign);
    if (!steps.some((s) => s.brief?.trim()) && !campaign.brief?.trim()) {
      throw new BadRequestException('Brief de campagne requis');
    }

    const prospects = await this.resolveProspects(campaign);
    if (!prospects.length) {
      throw new BadRequestException('Aucun prospect actif sélectionné');
    }

    campaign.status = 'generating';
    await this.campaigns.save(campaign);

    await this.drafts.delete({ campaignId: id });

    const senderName = campaign.sender?.name || 'L’équipe';
    const results: Array<{
      prospectId: string;
      stepId: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (let stepIdx = 0; stepIdx < steps.length; stepIdx++) {
      const step = steps[stepIdx];
      const previousBriefs = steps
        .slice(0, stepIdx)
        .map((s) => s.brief)
        .filter(Boolean);

      for (const prospect of prospects) {
        const draft = this.drafts.create({
          campaignId: id,
          stepId: step.id,
          prospectId: prospect.id,
          subject: null,
          html: null,
          text: null,
          status: 'pending',
          error: null,
        });
        await this.drafts.save(draft);
        try {
          const generated = await this.llm.generateEmail({
            company: prospect.company,
            emails: prospect.emails,
            contactName: prospect.contactName,
            profile: prospect.profile,
            enrichment: prospect.enrichment,
            brief: step.brief || campaign.brief,
            tone: campaign.tone,
            emailType: campaign.emailType,
            language: campaign.language,
            senderName,
            stepIndex: stepIdx,
            stepCount: steps.length,
            previousBriefs,
          });
          draft.subject = generated.subject;
          draft.html = generated.html;
          draft.text = generated.text;
          draft.status = 'ready';
          await this.drafts.save(draft);
          results.push({
            prospectId: prospect.id,
            stepId: step.id,
            ok: true,
          });
        } catch (err) {
          draft.status = 'error';
          draft.error = err instanceof Error ? err.message : String(err);
          await this.drafts.save(draft);
          results.push({
            prospectId: prospect.id,
            stepId: step.id,
            ok: false,
            error: draft.error,
          });
        }
      }
    }

    campaign.status = 'review';
    campaign.currentStepIndex = 0;
    campaign.nextStepAt = null;
    await this.campaigns.save(campaign);
    return { campaignId: id, results };
  }

  async updateDraft(
    draftId: string,
    data: Partial<{
      subject: string;
      html: string;
      text: string;
      status: 'ready' | 'approved' | 'skipped';
    }>,
  ) {
    const draft = await this.drafts.findOneBy({ id: draftId });
    if (!draft) throw new NotFoundException('Brouillon introuvable');
    Object.assign(draft, data);
    if (data.subject || data.html || data.text) {
      if (draft.status === 'pending' || draft.status === 'error') {
        draft.status = 'ready';
        draft.error = null;
      }
    }
    return this.drafts.save(draft);
  }

  async send(id: string) {
    return this.sendService.startCampaign(id);
  }

  async stats(id: string) {
    const sends = await this.sends.find({ where: { campaignId: id } });
    const total = sends.length;
    const sent = sends.filter((s) => s.status === 'sent').length;
    const failed = sends.filter((s) => s.status === 'failed').length;
    const opened = sends.filter((s) => s.openCount > 0).length;
    const clicked = sends.filter((s) => s.clickCount > 0).length;
    return {
      total,
      sent,
      failed,
      opened,
      clicked,
      openRate: sent ? opened / sent : 0,
      clickRate: sent ? clicked / sent : 0,
    };
  }
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
