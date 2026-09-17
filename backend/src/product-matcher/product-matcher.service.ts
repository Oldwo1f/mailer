import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Prospect } from '../entities/prospect.entity';
import { PRODUCT_CATALOG, getProduct } from './product-catalog';
import type {
  ProductConfidence,
  ProductEvidence,
  ProductMatchCandidate,
  ProductRecommendation,
  ProductReviewState,
} from './product-matcher.types';

@Injectable()
export class ProductMatcherService {
  constructor(
    @InjectRepository(Prospect)
    private readonly prospects: Repository<Prospect>,
  ) {}

  catalog() {
    return PRODUCT_CATALOG.map((p) => ({
      id: p.id,
      name: p.name,
      demoTemplate: p.demoTemplate,
      productUrl: p.productUrl,
    }));
  }

  async matchOne(id: string) {
    const prospect = await this.prospects.findOneBy({ id });
    if (!prospect) throw new NotFoundException('Prospect introuvable');

    const next = buildRecommendation(prospect);
    const previous = prospect.productRecommendation;

    // A human decision always wins over a re-score until explicitly changed.
    if (previous && previous.reviewState !== 'unreviewed') {
      next.reviewState = previous.reviewState;
      next.reviewNote = previous.reviewNote ?? null;
      if (
        previous.reviewState === 'accepted' ||
        previous.reviewState === 'overridden' ||
        previous.reviewState === 'rejected'
      ) {
        next.productId = previous.productId;
        next.productName = getProduct(previous.productId)?.name ?? previous.productName;
      }
    }

    prospect.productRecommendation = next;
    await this.prospects.save(prospect);
    return prospect;
  }

  async matchMany(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.prospects.find({ where: { id: In(ids) } });
    const byId = new Map(rows.map((p) => [p.id, p]));
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const id of ids) {
      const prospect = byId.get(id);
      if (!prospect) {
        results.push({ id, ok: false, error: 'Prospect introuvable' });
        continue;
      }
      try {
        const next = buildRecommendation(prospect);
        const previous = prospect.productRecommendation;
        if (previous && previous.reviewState !== 'unreviewed') {
          next.reviewState = previous.reviewState;
          next.reviewNote = previous.reviewNote ?? null;
          next.productId = previous.productId;
          next.productName = getProduct(previous.productId)?.name ?? previous.productName;
        }
        prospect.productRecommendation = next;
        await this.prospects.save(prospect);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({
          id,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return results;
  }

  async review(
    id: string,
    input: {
      reviewState: ProductReviewState;
      productId?: string | null;
      note?: string | null;
    },
  ) {
    const prospect = await this.prospects.findOneBy({ id });
    if (!prospect) throw new NotFoundException('Prospect introuvable');
    if (!prospect.productRecommendation) {
      throw new BadRequestException('Lancez d’abord le matching produit');
    }

    const recommendation = { ...prospect.productRecommendation };
    const state = input.reviewState;

    if (state === 'accepted') {
      recommendation.productId = recommendation.suggestedProductId;
      recommendation.productName =
        getProduct(recommendation.productId)?.name ?? recommendation.productName;
    } else if (state === 'overridden') {
      const product = input.productId ? getProduct(input.productId) : null;
      if (!product) {
        throw new BadRequestException('Produit de remplacement invalide');
      }
      recommendation.productId = product.id;
      recommendation.productName = product.name;
      recommendation.demoType = product.demoTemplate;
      recommendation.productUrl = product.productUrl;
      recommendation.recommendedAngle = product.commercialAngles[0] ?? '';
    } else if (state === 'unreviewed') {
      recommendation.productId = recommendation.suggestedProductId;
      recommendation.productName =
        getProduct(recommendation.productId)?.name ?? recommendation.productName;
    }

    recommendation.reviewState = state;
    recommendation.reviewNote = input.note?.trim() || null;
    prospect.productRecommendation = recommendation;
    await this.prospects.save(prospect);
    return prospect;
  }
}

export function buildRecommendation(prospect: Prospect): ProductRecommendation {
  const facts = collectFacts(prospect);
  const activityText = fold(
    [
      prospect.profile?.type,
      prospect.enrichment?.activity,
      prospect.profile?.description,
      prospect.notes,
    ]
      .filter(Boolean)
      .join(' '),
  );
  const allText = fold(
    [
      prospect.company,
      prospect.profile?.type,
      prospect.enrichment?.activity,
      prospect.profile?.description,
      prospect.profile?.besoins,
      prospect.enrichment?.hook,
      prospect.notes,
    ]
      .filter(Boolean)
      .join(' '),
  );

  const candidates: ProductMatchCandidate[] = PRODUCT_CATALOG.filter(
    (p) => p.id !== 'custom-atelys',
  )
    .map((product) => {
      const activityHits = hitSignals(activityText, product.targetActivities);
      const positiveHits = hitSignals(allText, product.positiveSignals);
      const negativeHits = hitSignals(allText, product.negativeSignals);

      const primaryActivityEvidence = Boolean(
        activityHits.length &&
          (prospect.profile?.type || prospect.enrichment?.activity),
      );
      const activityScore = Math.min(
        40,
        activityHits.length * 14 + (primaryActivityEvidence ? 12 : 0),
      );
      const workflowScore = Math.min(25, positiveHits.length * 6);
      const evidenceScore = Math.min(
        15,
        (prospect.enrichment?.activity ? 5 : 0) +
          (prospect.profile?.type ? 4 : 0) +
          (hasSource(prospect) ? 4 : 0) +
          (prospect.profile?.description || prospect.notes ? 2 : 0),
      );
      const demoScore = Math.min(
        10,
        (prospect.enrichment?.website || prospect.profile?.sites_web?.length ? 5 : 0) +
          (positiveHits.length ? 5 : 0),
      );
      const constraintScore = Math.max(-20, negativeHits.length * -10);
      const score = clamp(
        activityScore + workflowScore + evidenceScore + demoScore + constraintScore,
        0,
        100,
      );

      return {
        productId: product.id,
        score,
        activityHits,
        positiveHits,
        negativeHits,
      };
    })
    .sort((a, b) => b.score - a.score);

  const top = candidates[0]!;
  const second = candidates[1];
  const chooseCustom = top.score < 45;
  const selectedProduct = chooseCustom
    ? getProduct('custom-atelys')!
    : getProduct(top.productId)!;
  const margin = chooseCustom ? 0 : top.score - (second?.score ?? 0);
  const confidence: ProductConfidence = chooseCustom
    ? 'low'
    : top.score >= 70 && margin >= 12 && facts.length >= 2
      ? 'high'
      : top.score >= 50 && margin >= 7
        ? 'medium'
        : 'low';

  const relevantSignals = chooseCustom
    ? []
    : [...top.activityHits, ...top.positiveHits];
  const evidence = buildEvidence(facts, relevantSignals);
  const reasons = chooseCustom
    ? [
        'Aucun produit standard Atelys ne présente encore une correspondance suffisamment forte.',
      ]
    : buildReasons(top);
  const painPoints = buildPainPoints(allText);

  return {
    productId: selectedProduct.id,
    suggestedProductId: selectedProduct.id,
    productName: selectedProduct.name,
    score: chooseCustom ? Math.min(44, Math.max(20, top.score)) : top.score,
    confidence,
    reasons,
    evidence,
    painPoints,
    recommendedAngle: selectedProduct.commercialAngles[0] ?? '',
    demoType: selectedProduct.demoTemplate,
    productUrl: selectedProduct.productUrl,
    reviewState: 'unreviewed',
    reviewNote: null,
    matchedBy: 'rules',
    generatedAt: new Date().toISOString(),
  };
}

type Fact = { source: string; text: string };

function collectFacts(prospect: Prospect): Fact[] {
  const website =
    prospect.enrichment?.website || prospect.profile?.sites_web?.[0] || null;
  const sourceUrl =
    prospect.profile?.source_url || prospect.enrichment?.sources?.[0] || website;
  const facts: Fact[] = [];

  addFact(facts, sourceUrl || 'prospect.profile.type', prospect.profile?.type);
  addFact(
    facts,
    sourceUrl || 'prospect.enrichment.activity',
    prospect.enrichment?.activity,
  );
  addFact(
    facts,
    sourceUrl || 'prospect.profile.description',
    prospect.profile?.description,
  );
  addFact(facts, 'prospect.profile.besoins', prospect.profile?.besoins);
  addFact(facts, 'prospect.notes', prospect.notes);
  addFact(facts, sourceUrl || 'prospect.enrichment.hook', prospect.enrichment?.hook);

  return facts;
}

function addFact(facts: Fact[], source: string, value?: string | null) {
  const text = value?.trim();
  if (!text) return;
  if (facts.some((f) => fold(f.text) === fold(text))) return;
  facts.push({ source, text });
}

function buildEvidence(facts: Fact[], signals: string[]): ProductEvidence[] {
  const normalizedSignals = signals.map(fold);
  const matching = facts.filter((fact) => {
    const text = fold(fact.text);
    return normalizedSignals.some((signal) => text.includes(signal));
  });
  const selected = matching.length ? matching : facts.slice(0, 2);
  return selected.slice(0, 6).map((fact) => ({
    source: fact.source,
    fact: fact.text.slice(0, 240),
  }));
}

function buildReasons(candidate: ProductMatchCandidate): string[] {
  const reasons: string[] = [];
  if (candidate.activityHits.length) {
    reasons.push(
      `Activité compatible repérée : ${candidate.activityHits.slice(0, 3).join(', ')}.`,
    );
  }
  if (candidate.positiveHits.length) {
    reasons.push(
      `Signaux métier présents : ${candidate.positiveHits.slice(0, 4).join(', ')}.`,
    );
  }
  if (candidate.negativeHits.length) {
    reasons.push(
      `Réserves détectées : ${candidate.negativeHits.slice(0, 2).join(', ')}.`,
    );
  }
  return reasons.slice(0, 4);
}

function buildPainPoints(text: string): string[] {
  const rules: Array<[string[], string]> = [
    [
      ['manuel', 'manuelle', 'manuellement'],
      'Une gestion manuelle est explicitement mentionnée.',
    ],
    [['whatsapp'], 'WhatsApp est explicitement utilisé dans le processus décrit.'],
    [['excel', 'tableur'], 'Un tableur est explicitement mentionné dans le processus.'],
    [['papier'], 'Un traitement papier est explicitement mentionné.'],
    [['devis'], 'Le besoin de devis est explicitement mentionné.'],
    [['facture', 'facturation'], 'La facturation est explicitement mentionnée.'],
    [['réservation', 'reservation'], 'La réservation est explicitement mentionnée.'],
    [['planning'], 'Le planning est explicitement mentionné.'],
  ];
  const out: string[] = [];
  for (const [signals, label] of rules) {
    if (signals.some((signal) => text.includes(fold(signal)))) out.push(label);
  }
  return out.slice(0, 4);
}

function hitSignals(text: string, signals: string[]) {
  return signals.filter((signal) => text.includes(fold(signal)));
}

function hasSource(prospect: Prospect) {
  return Boolean(
    prospect.enrichment?.website ||
      prospect.enrichment?.sources?.length ||
      prospect.profile?.source_url ||
      prospect.profile?.sources?.length ||
      prospect.profile?.sites_web?.length,
  );
}

function fold(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
