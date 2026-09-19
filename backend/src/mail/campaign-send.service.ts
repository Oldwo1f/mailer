import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Campaign } from '../entities/campaign.entity';
import { CampaignStep } from '../entities/campaign-step.entity';
import { Draft } from '../entities/draft.entity';
import { Send } from '../entities/send.entity';
import { Click } from '../entities/click.entity';
import { Prospect } from '../entities/prospect.entity';
import { MailService } from './mail.service';
import { SettingsService } from '../settings/settings.service';
import { QuotaService } from '../quota/quota.service';
import { QuotaExhaustedError } from '../quota/quota.types';
import { CommercialPipelineService } from '../commercial/commercial-pipeline.service';
import { shouldSuppressOutbound } from '../commercial/commercial.rules';

@Injectable()
export class CampaignSendService {
  private readonly logger = new Logger(CampaignSendService.name);
  private running = new Set<string>();

  constructor(
    @InjectRepository(Campaign)
    private readonly campaigns: Repository<Campaign>,
    @InjectRepository(CampaignStep)
    private readonly steps: Repository<CampaignStep>,
    @InjectRepository(Draft)
    private readonly drafts: Repository<Draft>,
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
    private readonly mail: MailService,
    private readonly settings: SettingsService,
    private readonly quota: QuotaService,
    private readonly commercial: CommercialPipelineService,
  ) {}

  isRunning(campaignId: string) {
    return this.running.has(campaignId);
  }

  async startCampaign(campaignId: string) {
    const campaign = await this.campaigns.findOne({
      where: { id: campaignId },
      relations: ['sender', 'steps'],
    });
    if (!campaign) throw new Error('Campagne introuvable');
    if (!campaign.senderId) {
      throw new Error('Choisissez un expéditeur avant d’envoyer');
    }

    const steps = (campaign.steps || []).sort(
      (a, b) => a.position - b.position,
    );
    campaign.currentStepIndex = 0;
    campaign.nextStepAt = null;
    await this.campaigns.save(campaign);

    if (steps.length) {
      return this.startStep(campaignId, steps[0].id);
    }
    return this.queueAndProcess(campaignId, null);
  }

  async startStep(campaignId: string, stepId: string) {
    return this.queueAndProcess(campaignId, stepId);
  }

  private async queueAndProcess(campaignId: string, stepId: string | null) {
    if (this.running.has(campaignId)) {
      return { ok: false, error: 'Envoi déjà en cours' };
    }

    const campaign = await this.campaigns.findOne({
      where: { id: campaignId },
      relations: ['sender', 'steps'],
    });
    if (!campaign) throw new Error('Campagne introuvable');
    if (!campaign.senderId) {
      throw new Error('Choisissez un expéditeur avant d’envoyer');
    }

    const where: Record<string, unknown> = {
      campaignId,
      status: 'approved',
    };
    if (stepId) where.stepId = stepId;

    const approvedDrafts = await this.drafts.find({
      where: where as any,
      relations: ['prospect'],
    });

    const currentStep = stepId
      ? (campaign.steps || []).find((step) => step.id === stepId)
      : null;
    const followUp = Boolean(currentStep && currentStep.position > 0);

    const toSend = approvedDrafts.filter(
      (d) =>
        d.prospect &&
        !shouldSuppressOutbound(d.prospect, { followUp }) &&
        d.subject &&
        d.html,
    );
    if (!toSend.length) {
      throw new Error('Aucun brouillon approuvé à envoyer');
    }

    for (const draft of toSend) {
      const existing = await this.sends.find({
        where: { draftId: draft.id },
      });
      const alreadySent = existing.some((s) => s.status === 'sent');
      if (alreadySent) continue;

      const emails = draft.prospect.emails.filter(Boolean);
      for (const email of emails) {
        const hasQueued = existing.find(
          (s) =>
            s.toEmail === email &&
            (s.status === 'queued' || s.status === 'failed'),
        );
        if (hasQueued && hasQueued.status === 'queued') continue;
        if (hasQueued && hasQueued.status === 'failed') {
          hasQueued.status = 'queued';
          hasQueued.error = null;
          await this.sends.save(hasQueued);
          continue;
        }
        if (existing.find((s) => s.toEmail === email && s.status === 'sent')) {
          continue;
        }
        await this.sends.save(
          this.sends.create({
            token: randomBytes(24).toString('hex'),
            campaignId,
            draftId: draft.id,
            prospectId: draft.prospectId,
            toEmail: email,
            status: 'queued',
            messageId: null,
            provider: null,
            error: null,
            sentAt: null,
            openCount: 0,
            lastOpenedAt: null,
            clickCount: 0,
          }),
        );
      }
    }

    campaign.status = 'sending';
    await this.campaigns.save(campaign);

    void this.processQueue(campaignId, stepId);
    return { ok: true, queued: toSend.length, stepId };
  }

  private async processQueue(campaignId: string, stepId: string | null) {
    this.running.add(campaignId);
    const delay = await this.settings.getSendDelayMs();
    let pausedForQuota = false;
    try {
      const campaign = await this.campaigns.findOne({
        where: { id: campaignId },
        relations: ['sender'],
      });
      if (!campaign?.sender) {
        throw new Error('Expéditeur manquant');
      }
      const sender = campaign.sender;
      const publicUrl = await this.settings.getPublicUrl();
      const currentStep = stepId
        ? await this.steps.findOne({ where: { id: stepId } })
        : null;
      const followUp = Boolean(currentStep && currentStep.position > 0);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const qb = this.sends
          .createQueryBuilder('s')
          .leftJoinAndSelect('s.draft', 'draft')
          .leftJoinAndSelect('s.prospect', 'prospect')
          .where('s.campaignId = :campaignId', { campaignId })
          .andWhere('s.status = :status', { status: 'queued' })
          .orderBy('s.createdAt', 'ASC');
        if (stepId) {
          qb.andWhere('draft.stepId = :stepId', { stepId });
        }
        const next = await qb.getOne();
        if (!next) break;

        if (
          next.prospect &&
          shouldSuppressOutbound(next.prospect, { followUp })
        ) {
          next.status = 'skipped';
          next.error = next.prospect.unsubscribedAt
            ? 'Désinscrit'
            : 'Réponse ou avancée commerciale détectée — relance stoppée';
          await this.sends.save(next);
          continue;
        }

        next.status = 'sending';
        await this.sends.save(next);

        try {
          const draft = next.draft;
          const trackedHtml = injectTracking(
            draft.html || '',
            next.token,
            publicUrl,
          );
          const trackedText = appendUnsubText(
            draft.text || '',
            next.token,
            publicUrl,
          );
          const from = `${sender.name} <${sender.email}>`;
          const unsubUrl = `${publicUrl}/u/${next.token}`;

          const result = await this.mail.send({
            to: next.toEmail,
            subject: draft.subject || '(sans objet)',
            html: trackedHtml,
            text: trackedText,
            from,
            replyTo: sender.replyTo || sender.email,
            headers: {
              'List-Unsubscribe': `<${unsubUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });

          next.status = 'sent';
          next.messageId = result.messageId || null;
          next.provider = result.provider || null;
          next.sentAt = new Date();
          next.error = null;
          await this.sends.save(next);
          await this.commercial.markSuccessfulSend(next.prospectId);
        } catch (err) {
          if (err instanceof QuotaExhaustedError) {
            next.status = 'queued';
            next.error = 'En attente de quota';
            await this.sends.save(next);
            pausedForQuota = true;
            this.logger.warn(
              `Campaign ${campaignId}: quotas épuisés — file en pause`,
            );
            break;
          }
          next.status = 'failed';
          next.error = err instanceof Error ? err.message : String(err);
          await this.sends.save(next);
          this.logger.error(`Send failed ${next.toEmail}: ${next.error}`);
        }

        await sleep(delay);
      }

      if (!pausedForQuota) {
        await this.finishStepOrCampaign(campaignId, stepId);
      }
    } catch (err) {
      this.logger.error(
        `Queue crashed: ${err instanceof Error ? err.message : err}`,
      );
      await this.campaigns.update(campaignId, { status: 'failed' });
    } finally {
      this.running.delete(campaignId);
    }
  }

  private async finishStepOrCampaign(
    campaignId: string,
    stepId: string | null,
  ) {
    const campaign = await this.campaigns.findOne({
      where: { id: campaignId },
      relations: ['steps'],
    });
    if (!campaign) return;

    const steps = (campaign.steps || []).sort(
      (a, b) => a.position - b.position,
    );
    const sent = await this.sends.count({
      where: { campaignId, status: 'sent' },
    });

    if (!steps.length || !stepId) {
      campaign.status = sent > 0 ? 'sent' : 'failed';
      campaign.nextStepAt = null;
      await this.campaigns.save(campaign);
      return;
    }

    const currentIdx = steps.findIndex((s) => s.id === stepId);
    const nextStep = currentIdx >= 0 ? steps[currentIdx + 1] : null;

    if (nextStep) {
      const delayDays = Math.max(0, nextStep.delayDays || 0);
      const nextAt = new Date();
      nextAt.setDate(nextAt.getDate() + delayDays);
      campaign.status = 'waiting';
      campaign.currentStepIndex = currentIdx + 1;
      campaign.nextStepAt = nextAt;
      await this.campaigns.save(campaign);
      this.logger.log(
        `Campaign ${campaignId}: waiting until ${nextAt.toISOString()} for step ${nextStep.position + 1}`,
      );
    } else {
      campaign.status = sent > 0 ? 'sent' : 'failed';
      campaign.nextStepAt = null;
      await this.campaigns.save(campaign);
    }
  }

  /** Poller: advance waiting steps + resume quota-paused send queues. */
  async processDueSteps() {
    const due = await this.campaigns.find({
      where: {
        status: 'waiting',
        nextStepAt: LessThanOrEqual(new Date()),
      },
      relations: ['steps'],
    });

    for (const campaign of due) {
      if (this.running.has(campaign.id)) continue;
      const steps = (campaign.steps || []).sort(
        (a, b) => a.position - b.position,
      );
      const step = steps[campaign.currentStepIndex];
      if (!step) {
        campaign.status = 'sent';
        campaign.nextStepAt = null;
        await this.campaigns.save(campaign);
        continue;
      }
      try {
        this.logger.log(
          `Auto-starting step ${step.position + 1} for campaign ${campaign.id}`,
        );
        await this.startStep(campaign.id, step.id);
      } catch (err) {
        this.logger.error(
          `Failed to start due step: ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await this.resumePausedQueues();
  }

  /** Resume campaigns stuck in sending with queued emails once quota is free. */
  private async resumePausedQueues() {
    const next = await this.quota.pick('mail');
    if (!next) return;

    const paused = await this.campaigns.find({
      where: { status: 'sending' },
      relations: ['steps'],
    });

    for (const campaign of paused) {
      if (this.running.has(campaign.id)) continue;
      const queued = await this.sends.count({
        where: { campaignId: campaign.id, status: 'queued' },
      });
      if (!queued) continue;

      const steps = (campaign.steps || []).sort(
        (a, b) => a.position - b.position,
      );
      const step = steps[campaign.currentStepIndex];
      const stepId = step?.id ?? null;

      this.logger.log(
        `Resuming quota-paused campaign ${campaign.id} via ${next}`,
      );
      await this.sends
        .createQueryBuilder()
        .update(Send)
        .set({ error: null })
        .where('campaignId = :id', { id: campaign.id })
        .andWhere('status = :status', { status: 'queued' })
        .andWhere('error = :err', { err: 'En attente de quota' })
        .execute();

      void this.processQueue(campaign.id, stepId);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function injectTracking(
  html: string,
  token: string,
  publicUrl: string,
): string {
  const pixel = `<img src="${publicUrl}/t/o/${token}.gif" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
  const unsub = `<p style="font-size:12px;color:#666;margin-top:24px;text-align:center;font-family:Arial,Helvetica,sans-serif;">Pour ne plus recevoir nos emails, <a href="${publicUrl}/u/${token}" style="color:#666;text-decoration:underline;">se désinscrire en un clic</a>.</p>`;

  let out = rewriteLinks(html, token, publicUrl);
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${pixel}${unsub}</body>`);
  } else if (/mailer-email/i.test(out) && /<\/table>\s*$/i.test(out)) {
    out = `${out}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f3f4f6;"><tr><td align="center" style="padding:0 12px 24px;">${unsub}${pixel}</td></tr></table>`;
  } else {
    out = `${out}${pixel}${unsub}`;
  }
  return out;
}

function rewriteLinks(html: string, token: string, publicUrl: string): string {
  return html.replace(
    /href=["'](https?:\/\/[^"']+)["']/gi,
    (_m, url: string) => {
      if (url.includes('/u/') || url.includes('/t/')) {
        return `href="${url}"`;
      }
      const tracked = `${publicUrl}/t/c/${token}?u=${encodeURIComponent(url)}`;
      return `href="${tracked}"`;
    },
  );
}

function appendUnsubText(text: string, token: string, publicUrl: string) {
  return `${text}\n\n---\nSe désinscrire (1 clic): ${publicUrl}/u/${token}\n`;
}

@Injectable()
export class TrackingService {
  constructor(
    @InjectRepository(Send)
    private readonly sends: Repository<Send>,
    @InjectRepository(Click)
    private readonly clicks: Repository<Click>,
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  async recordOpen(token: string) {
    const send = await this.sends.findOneBy({ token: stripGif(token) });
    if (!send) return;
    send.openCount += 1;
    send.lastOpenedAt = new Date();
    await this.sends.save(send);
  }

  async recordClick(token: string, url: string) {
    const send = await this.sends.findOneBy({ token });
    if (!send) return url;
    send.clickCount += 1;
    await this.sends.save(send);
    await this.clicks.save(this.clicks.create({ sendId: send.id, url }));
    return url;
  }

  async getUnsubscribeInfo(token: string) {
    const send = await this.sends.findOne({
      where: { token },
      relations: ['prospect'],
    });
    if (!send?.prospect) {
      return { ok: false as const };
    }
    return {
      ok: true as const,
      toEmail: send.toEmail,
      company: send.prospect.company || null,
      alreadyUnsubscribed: Boolean(send.prospect.unsubscribedAt),
    };
  }

  async unsubscribe(token: string) {
    const info = await this.getUnsubscribeInfo(token);
    if (!info.ok) return { ok: false as const };
    if (info.alreadyUnsubscribed) {
      return {
        ok: true as const,
        already: true as const,
        email: info.toEmail,
        company: info.company,
      };
    }
    const send = await this.sends.findOne({
      where: { token },
      relations: ['prospect'],
    });
    if (!send?.prospect) return { ok: false as const };
    send.prospect.unsubscribedAt = new Date();
    await this.prospects.save(send.prospect);
    return {
      ok: true as const,
      already: false as const,
      email: send.toEmail,
      company: send.prospect.company || null,
    };
  }
}

function stripGif(token: string) {
  return token.replace(/\.gif$/i, '');
}
