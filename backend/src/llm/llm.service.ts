import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SettingsService } from '../settings/settings.service';
import type {
  ProspectEnrichment,
  ProspectProfile,
} from '../entities/prospect.entity';
import { isProspectEmail, normalizeEmail } from '../prospects/prospect.utils';
import type { DiscoverCandidate } from '../discover/discover.types';
import { resolveEmailType } from './email-types';
import { resolveTone } from './tones';
import { wrapEmailHtml } from './email-layout';

@Injectable()
export class LlmService {
  constructor(private readonly settings: SettingsService) {}

  private async client(): Promise<OpenAI> {
    const opts = await this.settings.getLlmClientOptions();
    return new OpenAI({ apiKey: opts.apiKey });
  }

  async extractEnrichment(input: {
    company: string;
    searchSnippets: string;
    scrapeMarkdown?: string | null;
  }): Promise<ProspectEnrichment> {
    const openai = await this.client();
    const model = await this.settings.getOpenaiModel();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu enrichis un prospect B2B en Polynésie française.
Retourne UNIQUEMENT un JSON:
{
  "website": string|null,
  "activity": string|null,
  "location": string|null,
  "hook": string|null,
  "sources": string[]
}
Règles:
- Ne jamais inventer d'email ni de téléphone.
- website uniquement si clairement présent dans les sources.
- hook = 1 phrase d'accroche factuelle (max 25 mots).
- sources = URLs utilisées.`,
        },
        {
          role: 'user',
          content: `Entreprise: ${input.company}

Résultats recherche:
${input.searchSnippets}

${input.scrapeMarkdown ? `Contenu site:\n${input.scrapeMarkdown}` : ''}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as ProspectEnrichment;
    return {
      website: parsed.website ?? null,
      activity: parsed.activity ?? null,
      location: parsed.location ?? null,
      hook: parsed.hook ?? null,
      sources: Array.isArray(parsed.sources) ? parsed.sources.slice(0, 8) : [],
      enrichedAt: new Date().toISOString(),
    };
  }

  async generateEmail(input: {
    company: string;
    emails: string[];
    contactName?: string | null;
    profile?: ProspectProfile | null;
    enrichment: ProspectEnrichment | null;
    brief: string;
    tone: string;
    emailType?: string;
    language: string;
    senderName: string;
    senderEmail?: string | null;
    stepIndex?: number;
    stepCount?: number;
    previousBriefs?: string[];
  }): Promise<{ subject: string; html: string; text: string }> {
    const openai = await this.client();
    const model = await this.settings.getOpenaiModel();
    const enrichmentBlock = input.enrichment
      ? JSON.stringify(input.enrichment, null, 2)
      : 'Aucun enrichissement disponible.';
    const profileBlock = input.profile
      ? JSON.stringify(input.profile, null, 2)
      : 'Aucun profil additionnel.';

    const stepIndex = input.stepIndex ?? 0;
    const stepCount = input.stepCount ?? 1;
    const isFollowUp = stepIndex > 0;
    const previousBlock = input.previousBriefs?.length
      ? input.previousBriefs
          .map((b, i) => `Email ${i + 1} (déjà envoyé / prévu):\n${b}`)
          .join('\n\n')
      : '';

    const sequenceRules = isFollowUp
      ? `- Ceci est l'email ${stepIndex + 1}/${stepCount} d'une séquence (relance).
- Ne répète PAS le premier message : rappelle brièvement le contexte, apporte une nouvelle valeur ou une relance claire.
- Objet distinct du précédent, adapté à une relance.`
      : stepCount > 1
        ? `- Ceci est l'email 1/${stepCount} d'une séquence. Pose le cadre ; les relances suivront.`
        : '';

    const emailType = resolveEmailType(input.emailType);
    const tone = resolveTone(input.tone);

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu rédiges un email de prospection B2B personnalisé.
Retourne UNIQUEMENT un JSON:
{
  "subject": string,
  "html": string,
  "text": string
}
Règles:
- Langue: ${input.language === 'fr' ? 'français' : input.language}
- Ton (voix): ${tone.label}
${tone.voiceRules}
- Type d'email: ${emailType.label}
${emailType.structureRules}
- Phrases COURTES et faciles à lire : 1 idée par paragraphe, 1 à 2 phrases max par <p>.
- Mets en gras (<strong>) 2 à 4 mots ou expressions clés (bénéfice, offre, deadline) — jamais une phrase entière.
- HTML INTÉRIEUR uniquement : <p>, <strong>, <a>, et <ul>/<li> si le type l'exige. Pas de <html>, <body>, <style>, ni attributs CSS (le layout est ajouté après).
- Un seul CTA clair sous forme de lien <a href="...">libellé</a> (pas de bouton HTML).
- Personnalise avec le nom de l'entreprise${input.contactName ? ` et le contact (${input.contactName})` : ''} et le profil enrichi.
- N'invente AUCUN fait (chiffres, clients, dates) absent du brief ou du profil.
- Signature avec le nom de l'expéditeur: ${input.senderName}
- N'inclus PAS de lien de désinscription (ajouté automatiquement).
- text = version plain-text du même message.
${sequenceRules}`,
        },
        {
          role: 'user',
          content: `Entreprise: ${input.company}
${input.contactName ? `Contact: ${input.contactName}\n` : ''}Emails connus: ${input.emails.join(', ')}

Profil entreprise:
${profileBlock}

Profil enrichi:
${enrichmentBlock}

${previousBlock ? `Contexte séquence:\n${previousBlock}\n\n` : ''}Brief de cet email:
${input.brief}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as {
      subject?: string;
      html?: string;
      text?: string;
    };
    if (!parsed.subject || (!parsed.html && !parsed.text)) {
      throw new Error('Réponse OpenAI invalide (subject/html manquants)');
    }
    const innerHtml = (parsed.html || parsed.text || '').trim();
    return {
      subject: parsed.subject.trim(),
      html: wrapEmailHtml(innerHtml, { senderEmail: input.senderEmail }),
      text: (parsed.text || stripHtml(innerHtml)).trim(),
    };
  }

  async extractProspectCandidates(input: {
    keywords: string;
    location: string;
    searchSnippets: string;
  }): Promise<DiscoverCandidate[]> {
    const openai = await this.client();
    const model = await this.settings.getOpenaiModel();
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu extrais des entreprises RÉELLES (prospects B2B) à partir de résultats de recherche web.
Retourne UNIQUEMENT un JSON:
{
  "prospects": [
    {
      "company": string,
      "emails": string[],
      "website": string|null,
      "contactName": string|null,
      "commune": string|null,
      "type": string|null,
      "notes": string|null,
      "sourceUrl": string|null
    }
  ]
}
Règles:
- Uniquement des entreprises / commerces / établissements, jamais des articles, blogs, « top 10 », annuaires, offices de tourisme.
- N'invente JAMAIS d'email ni de téléphone. emails = uniquement ceux explicitement présents dans les extraits.
- website = URL du site de CETTE entreprise si identifiable (pas Facebook, pas Tripadvisor, pas PagesJaunes).
- Préfère les entreprises en ${input.location}.
- Ignore les homonymes hors zone si le lieu n'est pas cohérent.
- notes = 1 courte phrase factuelle tirée des extraits, ou null.`,
        },
        {
          role: 'user',
          content: `Mots-clés: ${input.keywords}
Zone: ${input.location}

Résultats:
${input.searchSnippets}`,
        },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJsonObject(raw) as { prospects?: unknown };
    const rows = Array.isArray(parsed.prospects) ? parsed.prospects : [];
    const out: DiscoverCandidate[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const company = typeof r.company === 'string' ? r.company.trim() : '';
      if (company.length < 2) continue;
      const emails = Array.isArray(r.emails)
        ? r.emails
            .filter((e): e is string => typeof e === 'string')
            .map(normalizeEmail)
            .filter(isProspectEmail)
        : [];
      out.push({
        company,
        emails: [...new Set(emails)],
        website: asNullableString(r.website),
        contactName: asNullableString(r.contactName),
        commune: asNullableString(r.commune),
        type: asNullableString(r.type),
        notes: asNullableString(r.notes),
        sourceUrl: asNullableString(r.sourceUrl),
      });
    }
    return out;
  }

  async prepareCampaignSequence(input: {
    goal: string;
    productContent?: string | null;
    productUrl?: string | null;
    tone?: string;
    emailType?: string;
    language?: string;
    stepCount?: number;
  }): Promise<{
    name: string;
    steps: Array<{ name: string; brief: string; delayDays: number }>;
  }> {
    const openai = await this.client();
    const model = await this.settings.getOpenaiModel();
    const emailType = resolveEmailType(input.emailType);
    const tone = resolveTone(input.tone);
    const language =
      input.language === 'fr' || !input.language ? 'français' : input.language;
    const stepHint =
      input.stepCount && input.stepCount >= 2 && input.stepCount <= 5
        ? `Exactement ${input.stepCount} emails.`
        : '3 ou 4 emails (choisis la longueur la plus pertinente).';

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Tu prépares une séquence d'emails de prospection B2B.
Retourne UNIQUEMENT un JSON:
{
  "name": string,
  "steps": [
    { "name": string, "brief": string, "delayDays": number }
  ]
}
Règles:
- Langue des briefs et du nom: ${language}
- Ton cible de la campagne: ${tone.label}
${tone.voiceRules}
- Type d'email cible: ${emailType.label}
${emailType.structureRules}
- ${stepHint}
- delayDays = 0 pour l'email 1 ; ensuite typiquement 2 à 4 jours.
- name de campagne court et descriptif.
- name d'étape du type "Email 1 — …" avec un angle clair.
- Chaque brief doit être OPÉRATIONNEL pour un rédacteur d'email : promesse, faits produit citables, angle, CTA souhaité, et ce qu'il ne faut pas répéter des emails précédents.
- Email 1 pose le cadre ; les suivants apportent un nouvel angle (preuve, objection, insight, relance) sans se répéter.
- N'invente AUCUN fait, chiffre, client ou fonctionnalité absent du brief ou du contenu produit.
- Si le contenu produit est absent ou pauvre, base-toi uniquement sur le brief général.`,
        },
        {
          role: 'user',
          content: `Brief général:
${input.goal}

${input.productUrl ? `URL produit: ${input.productUrl}\n` : ''}${
            input.productContent
              ? `Contenu produit analysé:\n${input.productContent}`
              : 'Aucun contenu produit scrapé (utiliser uniquement le brief).'
          }`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    const parsed = parseJsonObject(raw) as {
      name?: unknown;
      steps?: unknown;
    };
    const name =
      typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim()
        : 'Campagne préparée';
    const rows = Array.isArray(parsed.steps) ? parsed.steps : [];
    const steps: Array<{ name: string; brief: string; delayDays: number }> = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const brief = typeof r.brief === 'string' ? r.brief.trim() : '';
      if (!brief) continue;
      const stepName =
        typeof r.name === 'string' && r.name.trim()
          ? r.name.trim()
          : `Email ${steps.length + 1}`;
      const delayDays =
        steps.length === 0
          ? 0
          : Math.max(0, Math.min(90, Number(r.delayDays) || 3));
      steps.push({ name: stepName, brief, delayDays });
    }
    if (!steps.length) {
      throw new Error('Réponse OpenAI invalide (aucune étape)');
    }
    steps[0].delayDays = 0;
    return { name, steps };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

function asNullableString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}
