import type { LeadStatus, Prospect } from '../entities/prospect.entity';

export type LearningConfidence = 'collecting' | 'usable' | 'strong';
export type LearningDimension = 'product' | 'activity' | 'product_activity';

export type CommercialLearningSegment = {
  key: string;
  dimension: LearningDimension;
  label: string;
  productId: string | null;
  productName: string | null;
  activity: string | null;
  prospects: number;
  contacted: number;
  replied: number;
  opportunities: number;
  won: number;
  lost: number;
  wonValueXpf: number;
  replyRate: number | null;
  opportunityRate: number | null;
  closedWinRate: number | null;
  confidence: LearningConfidence;
  radarAdjustment: number;
  learningReason: string;
};

export type CommercialLearningSnapshot = {
  generatedAt: string;
  thresholds: {
    minContactedForAdjustment: number;
    strongContacted: number;
    priorStrength: number;
  };
  baseline: {
    prospects: number;
    contacted: number;
    replied: number;
    opportunities: number;
    won: number;
    lost: number;
    wonValueXpf: number;
    replyRate: number | null;
    opportunityRate: number | null;
    closedWinRate: number | null;
  };
  replyIntents: Array<{ intent: string; count: number }>;
  segments: CommercialLearningSegment[];
};

export type LearningAdjustment = {
  points: number;
  confidence: LearningConfidence;
  source: LearningDimension | null;
  sourceLabel: string | null;
  reason: string | null;
};

const MIN_CONTACTED_FOR_ADJUSTMENT = 8;
const STRONG_CONTACTED = 20;
const PRIOR_STRENGTH = 8;
const ACTIVE_OPPORTUNITY_STATUSES = new Set<LeadStatus>([
  'interested',
  'demo',
  'meeting',
  'quote',
]);
const REPLIED_OR_LATER = new Set<LeadStatus>([
  'replied',
  'interested',
  'demo',
  'meeting',
  'quote',
  'won',
  'lost',
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function activityBucket(prospect: Pick<Prospect, 'enrichment' | 'profile'>) {
  const raw = normalize(
    [
      prospect.enrichment?.activity,
      prospect.profile?.type,
      prospect.profile?.description,
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!raw) return 'activité non renseignée';
  if (/hotel|pension|bungalow|hebergement|guesthouse|maison d hotes|location saisonniere/.test(raw)) {
    return 'hébergement touristique';
  }
  if (/location.*voiture|location.*auto|location.*scooter|location.*moto|location.*quad|rent a car|car rental/.test(raw)) {
    return 'location de véhicules';
  }
  if (/jardin|paysag|espace vert|debroussaillage|tonte/.test(raw)) return 'jardin / paysage';
  if (/piscin|piscine/.test(raw)) return 'piscine';
  if (/clim|chauffag|froid|climatisation/.test(raw)) return 'climatisation / chauffage';
  if (/plomb/.test(raw)) return 'plomberie';
  if (/electric/.test(raw)) return 'électricité';
  if (/elag|abattage|arbor/.test(raw)) return 'élagage';
  if (/maintenance|technicien|intervention|depannage/.test(raw)) return 'maintenance / technique';
  if (/artisan|independant|entrepreneur|service|prestataire/.test(raw)) return 'artisan / services';
  return raw.slice(0, 60);
}

function reviewedProduct(prospect: Prospect) {
  const rec = prospect.productRecommendation;
  if (!rec || !['accepted', 'overridden'].includes(rec.reviewState)) return null;
  return { productId: rec.productId, productName: rec.productName };
}

function wasContacted(prospect: Prospect) {
  return (prospect.leadStatus || 'new') !== 'new';
}

function hasReply(prospect: Prospect) {
  const status = prospect.leadStatus || 'new';
  return Boolean(prospect.replyDetectedAt) || REPLIED_OR_LATER.has(status);
}

function isOpportunity(prospect: Prospect) {
  return ACTIVE_OPPORTUNITY_STATUSES.has(prospect.leadStatus || 'new') || prospect.leadStatus === 'won';
}

function safeRate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function smoothedRate(successes: number, total: number, baseline: number) {
  return (successes + baseline * PRIOR_STRENGTH) / (total + PRIOR_STRENGTH);
}

type MutableSegment = Omit<
  CommercialLearningSegment,
  'replyRate' | 'opportunityRate' | 'closedWinRate' | 'confidence' | 'radarAdjustment' | 'learningReason'
>;

function emptySegment(input: {
  key: string;
  dimension: LearningDimension;
  label: string;
  productId?: string | null;
  productName?: string | null;
  activity?: string | null;
}): MutableSegment {
  return {
    key: input.key,
    dimension: input.dimension,
    label: input.label,
    productId: input.productId ?? null,
    productName: input.productName ?? null,
    activity: input.activity ?? null,
    prospects: 0,
    contacted: 0,
    replied: 0,
    opportunities: 0,
    won: 0,
    lost: 0,
    wonValueXpf: 0,
  };
}

function addProspect(group: MutableSegment, prospect: Prospect) {
  group.prospects += 1;
  if (wasContacted(prospect)) group.contacted += 1;
  if (hasReply(prospect)) group.replied += 1;
  if (isOpportunity(prospect)) group.opportunities += 1;
  if (prospect.leadStatus === 'won') {
    group.won += 1;
    group.wonValueXpf += Math.max(0, Number(prospect.dealValueXpf) || 0);
  }
  if (prospect.leadStatus === 'lost') group.lost += 1;
}

function confidenceFor(contacted: number): LearningConfidence {
  if (contacted >= STRONG_CONTACTED) return 'strong';
  if (contacted >= MIN_CONTACTED_FOR_ADJUSTMENT) return 'usable';
  return 'collecting';
}

function finalizeSegment(
  group: MutableSegment,
  baseline: CommercialLearningSnapshot['baseline'],
): CommercialLearningSegment {
  const replyRate = safeRate(group.replied, group.contacted);
  const opportunityRate = safeRate(group.opportunities, group.contacted);
  const closed = group.won + group.lost;
  const closedWinRate = safeRate(group.won, closed);
  const confidence = confidenceFor(group.contacted);

  if (confidence === 'collecting') {
    return {
      ...group,
      replyRate,
      opportunityRate,
      closedWinRate,
      confidence,
      radarAdjustment: 0,
      learningReason: `Encore ${Math.max(0, MIN_CONTACTED_FOR_ADJUSTMENT - group.contacted)} contact(s) avant d'ajuster le Radar.`,
    };
  }

  const baselineReply = baseline.replyRate ?? 0;
  const baselineOpportunity = baseline.opportunityRate ?? 0;
  const replySmoothed = smoothedRate(group.replied, group.contacted, baselineReply);
  const opportunitySmoothed = smoothedRate(
    group.opportunities,
    group.contacted,
    baselineOpportunity,
  );

  let raw = (replySmoothed - baselineReply) * 24;
  raw += (opportunitySmoothed - baselineOpportunity) * 18;

  if (closed >= 5 && baseline.closedWinRate != null) {
    const winSmoothed = smoothedRate(group.won, closed, baseline.closedWinRate);
    raw += (winSmoothed - baseline.closedWinRate) * 8;
  }

  const radarAdjustment = Math.round(clamp(raw, -8, 8));
  const direction = radarAdjustment > 0 ? 'mieux' : radarAdjustment < 0 ? 'moins bien' : 'dans la moyenne';
  const learningReason =
    radarAdjustment === 0
      ? `Ce segment performe ${direction}; aucune correction de priorité.`
      : `Ce segment performe ${direction} que la moyenne Atelys sur ${group.contacted} contact(s) : ${radarAdjustment > 0 ? '+' : ''}${radarAdjustment} point(s) de priorité.`;

  return {
    ...group,
    replyRate,
    opportunityRate,
    closedWinRate,
    confidence,
    radarAdjustment,
    learningReason,
  };
}

export function buildCommercialLearning(rows: Prospect[]): CommercialLearningSnapshot {
  const baseline = {
    prospects: rows.length,
    contacted: 0,
    replied: 0,
    opportunities: 0,
    won: 0,
    lost: 0,
    wonValueXpf: 0,
    replyRate: null as number | null,
    opportunityRate: null as number | null,
    closedWinRate: null as number | null,
  };

  const groups = new Map<string, MutableSegment>();
  const intents = new Map<string, number>();

  for (const prospect of rows) {
    if (wasContacted(prospect)) baseline.contacted += 1;
    if (hasReply(prospect)) baseline.replied += 1;
    if (isOpportunity(prospect)) baseline.opportunities += 1;
    if (prospect.leadStatus === 'won') {
      baseline.won += 1;
      baseline.wonValueXpf += Math.max(0, Number(prospect.dealValueXpf) || 0);
    }
    if (prospect.leadStatus === 'lost') baseline.lost += 1;
    if (prospect.lastReplyIntent) {
      intents.set(prospect.lastReplyIntent, (intents.get(prospect.lastReplyIntent) || 0) + 1);
    }

    const activity = activityBucket(prospect);
    const product = reviewedProduct(prospect);

    const activityKey = `activity:${activity}`;
    if (!groups.has(activityKey)) {
      groups.set(
        activityKey,
        emptySegment({
          key: activityKey,
          dimension: 'activity',
          label: activity,
          activity,
        }),
      );
    }
    addProspect(groups.get(activityKey)!, prospect);

    if (product) {
      const productKey = `product:${product.productId}`;
      if (!groups.has(productKey)) {
        groups.set(
          productKey,
          emptySegment({
            key: productKey,
            dimension: 'product',
            label: product.productName,
            productId: product.productId,
            productName: product.productName,
          }),
        );
      }
      addProspect(groups.get(productKey)!, prospect);

      const comboKey = `product_activity:${product.productId}:${activity}`;
      if (!groups.has(comboKey)) {
        groups.set(
          comboKey,
          emptySegment({
            key: comboKey,
            dimension: 'product_activity',
            label: `${product.productName} · ${activity}`,
            productId: product.productId,
            productName: product.productName,
            activity,
          }),
        );
      }
      addProspect(groups.get(comboKey)!, prospect);
    }
  }

  baseline.replyRate = safeRate(baseline.replied, baseline.contacted);
  baseline.opportunityRate = safeRate(baseline.opportunities, baseline.contacted);
  baseline.closedWinRate = safeRate(baseline.won, baseline.won + baseline.lost);

  const segments = [...groups.values()]
    .map((group) => finalizeSegment(group, baseline))
    .sort((a, b) => {
      if (b.radarAdjustment !== a.radarAdjustment) return b.radarAdjustment - a.radarAdjustment;
      if (b.contacted !== a.contacted) return b.contacted - a.contacted;
      return a.label.localeCompare(b.label, 'fr');
    });

  return {
    generatedAt: new Date().toISOString(),
    thresholds: {
      minContactedForAdjustment: MIN_CONTACTED_FOR_ADJUSTMENT,
      strongContacted: STRONG_CONTACTED,
      priorStrength: PRIOR_STRENGTH,
    },
    baseline,
    replyIntents: [...intents.entries()]
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count || a.intent.localeCompare(b.intent)),
    segments,
  };
}

export function learningAdjustmentForProspect(
  snapshot: CommercialLearningSnapshot,
  prospect: Prospect,
): LearningAdjustment {
  const product = reviewedProduct(prospect);
  const activity = activityBucket(prospect);
  const candidates: CommercialLearningSegment[] = [];

  if (product) {
    const combo = snapshot.segments.find(
      (segment) =>
        segment.dimension === 'product_activity' &&
        segment.productId === product.productId &&
        segment.activity === activity,
    );
    if (combo) candidates.push(combo);

    const productSegment = snapshot.segments.find(
      (segment) => segment.dimension === 'product' && segment.productId === product.productId,
    );
    if (productSegment) candidates.push(productSegment);
  }

  const activitySegment = snapshot.segments.find(
    (segment) => segment.dimension === 'activity' && segment.activity === activity,
  );
  if (activitySegment) candidates.push(activitySegment);

  const usable = candidates.find((segment) => segment.confidence !== 'collecting');
  if (!usable) {
    return {
      points: 0,
      confidence: 'collecting',
      source: null,
      sourceLabel: null,
      reason: 'Pas encore assez de résultats comparables pour modifier la priorité.',
    };
  }

  return {
    points: usable.radarAdjustment,
    confidence: usable.confidence,
    source: usable.dimension,
    sourceLabel: usable.label,
    reason: usable.learningReason,
  };
}
