export type RadarTier = 'cold' | 'promising' | 'hot';
export type DemoEnergyMode = 'none' | 'prepare' | 'generate' | 'generated';

type RecommendationLike = {
  productName?: string | null;
  confidence?: 'high' | 'medium' | 'low' | null;
  reviewState?: 'unreviewed' | 'accepted' | 'overridden' | 'rejected' | null;
} | null;

type DemoPreparationLike = {
  artifactStatus?: 'not-generated' | 'generated' | null;
  artifactUrls?: string[] | null;
} | null;

export type RadarProspect = {
  id: string;
  company: string;
  contactName?: string | null;
  leadStatus?: string | null;
  dealValueXpf?: number | null;
  replyDetectedAt?: Date | string | null;
  starred?: boolean;
  enrichment?: {
    website?: string | null;
    activity?: string | null;
    location?: string | null;
    sources?: string[] | null;
  } | null;
  productRecommendation?: RecommendationLike;
  demoPreparation?: DemoPreparationLike;
  updatedAt?: Date | string | null;
};

export type RadarSendMetrics = {
  sent: number;
  opens: number;
  clicks: number;
  lastSentAt?: Date | string | null;
  lastOpenedAt?: Date | string | null;
};

export type AurelRadarItem = {
  prospectId: string;
  company: string;
  contactName: string | null;
  leadStatus: string;
  score: number;
  tier: RadarTier;
  productName: string | null;
  dealValueXpf: number;
  sent: number;
  opens: number;
  clicks: number;
  replied: boolean;
  signals: string[];
  nextAction: string;
  demoEligible: boolean;
  demoMode: DemoEnergyMode;
  demoReason: string;
  updatedAt: string | null;
};

export type AurelRadarResult = {
  generatedAt: string;
  summary: {
    totalActive: number;
    cold: number;
    promising: number;
    hot: number;
    demoEligible: number;
    repliesNeedingAttention: number;
    activePipelineValueXpf: number;
  };
  items: AurelRadarItem[];
};

const STAGE_POINTS: Record<string, number> = {
  new: 0,
  contacted: 15,
  replied: 35,
  interested: 50,
  demo: 60,
  meeting: 75,
  quote: 85,
  won: 100,
  lost: 0,
};

const HOT_STAGES = new Set(['replied', 'interested', 'demo', 'meeting', 'quote']);
const DEMO_STAGES = new Set(['interested', 'demo', 'meeting', 'quote']);
const CLOSED_STAGES = new Set(['won', 'lost']);

function reviewedRecommendation(rec: RecommendationLike) {
  return rec?.reviewState === 'accepted' || rec?.reviewState === 'overridden';
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function enrichmentPoints(prospect: RadarProspect) {
  const enrichment = prospect.enrichment;
  if (!enrichment) return 0;
  let score = 0;
  if (enrichment.website) score += 3;
  if (enrichment.activity) score += 3;
  if (enrichment.location) score += 2;
  if (enrichment.sources?.length) score += 2;
  return score;
}

export function buildAurelRadarItem(
  prospect: RadarProspect,
  metrics: RadarSendMetrics = { sent: 0, opens: 0, clicks: 0 },
): AurelRadarItem {
  const leadStatus = prospect.leadStatus || 'new';
  const recommendation = prospect.productRecommendation || null;
  const reviewed = reviewedRecommendation(recommendation);
  const replied = Boolean(prospect.replyDetectedAt);
  const generatedDemo =
    prospect.demoPreparation?.artifactStatus === 'generated' &&
    Boolean(prospect.demoPreparation?.artifactUrls?.length);

  let score = STAGE_POINTS[leadStatus] ?? 0;
  const signals: string[] = [];

  if (reviewed) {
    score += 12;
    signals.push(`Produit validé : ${recommendation?.productName || 'Atelys'}`);
    if (recommendation?.confidence === 'high') score += 4;
    else if (recommendation?.confidence === 'medium') score += 2;
  }

  const enrich = enrichmentPoints(prospect);
  score += enrich;
  if (enrich >= 6) signals.push('Prospect bien enrichi');

  if (metrics.sent > 0) {
    score += 8;
    signals.push(`${metrics.sent} envoi${metrics.sent > 1 ? 's' : ''}`);
  }
  if (metrics.opens > 0) {
    score += metrics.opens >= 2 ? 10 : 5;
    signals.push(`${metrics.opens} ouverture${metrics.opens > 1 ? 's' : ''}`);
  }
  if (metrics.clicks > 0) {
    score += 18;
    signals.push(`${metrics.clicks} clic${metrics.clicks > 1 ? 's' : ''}`);
  }
  if (replied) {
    score += 20;
    signals.push('Réponse reçue');
  }
  if (prospect.starred) {
    score += 5;
    signals.push('Prospect favori');
  }
  if ((prospect.dealValueXpf || 0) > 0) {
    score += 5;
    signals.push('Valeur commerciale renseignée');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: RadarTier = score >= 70 ? 'hot' : score >= 40 ? 'promising' : 'cold';
  if (HOT_STAGES.has(leadStatus)) tier = 'hot';
  if (CLOSED_STAGES.has(leadStatus)) tier = 'cold';

  const demoEligible =
    reviewed &&
    !CLOSED_STAGES.has(leadStatus) &&
    (DEMO_STAGES.has(leadStatus) ||
      leadStatus === 'replied' ||
      (metrics.clicks > 0 && score >= 60));

  let demoMode: DemoEnergyMode = 'none';
  let demoReason = 'Pas assez de signal : ne rien générer.';
  if (generatedDemo) {
    demoMode = 'generated';
    demoReason = 'Une vraie démo existe déjà.';
  } else if (demoEligible) {
    demoMode = 'generate';
    demoReason = 'Signal commercial assez fort : une vraie démo est justifiée.';
  } else if (tier === 'promising' && reviewed) {
    demoMode = 'prepare';
    demoReason = 'Préparer les données seulement, sans rendu coûteux.';
  }

  let nextAction = 'Laisser le prospect au repos';
  if (leadStatus === 'won') nextAction = 'Client gagné — aucune prospection';
  else if (leadStatus === 'lost') nextAction = 'Dossier perdu — aucune action';
  else if (leadStatus === 'quote') nextAction = 'Relancer le devis au bon moment';
  else if (leadStatus === 'meeting') nextAction = 'Préparer le rendez-vous';
  else if (leadStatus === 'demo') nextAction = 'Suivre la démo et obtenir une décision';
  else if (leadStatus === 'interested') nextAction = generatedDemo ? 'Envoyer / présenter la démo' : 'Préparer une vraie démo';
  else if (leadStatus === 'replied' || replied) nextAction = 'Lire la réponse et qualifier l’intention';
  else if (metrics.clicks > 0) nextAction = 'Faire une relance personnelle ou appeler';
  else if (metrics.opens >= 2) nextAction = 'Relance légère : intérêt probable';
  else if (leadStatus === 'contacted') nextAction = 'Laisser la séquence suivre son cours';
  else if (!prospect.enrichment?.activity) nextAction = 'Enrichir le prospect';
  else if (!reviewed) nextAction = 'Valider le produit recommandé';
  else nextAction = 'Préparer le premier contact';

  return {
    prospectId: prospect.id,
    company: prospect.company,
    contactName: prospect.contactName || null,
    leadStatus,
    score,
    tier,
    productName: reviewed ? recommendation?.productName || null : null,
    dealValueXpf: Math.max(0, Number(prospect.dealValueXpf) || 0),
    sent: metrics.sent,
    opens: metrics.opens,
    clicks: metrics.clicks,
    replied,
    signals: signals.slice(0, 6),
    nextAction,
    demoEligible,
    demoMode,
    demoReason,
    updatedAt: toIso(prospect.updatedAt),
  };
}

export function buildAurelRadar(
  prospects: RadarProspect[],
  metricsByProspect: Map<string, RadarSendMetrics>,
): AurelRadarResult {
  const all = prospects.map((prospect) =>
    buildAurelRadarItem(prospect, metricsByProspect.get(prospect.id)),
  );
  const active = all
    .filter((item) => !CLOSED_STAGES.has(item.leadStatus))
    .sort((a, b) => b.score - a.score || b.clicks - a.clicks || b.opens - a.opens);

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalActive: active.length,
      cold: active.filter((item) => item.tier === 'cold').length,
      promising: active.filter((item) => item.tier === 'promising').length,
      hot: active.filter((item) => item.tier === 'hot').length,
      demoEligible: active.filter((item) => item.demoEligible).length,
      repliesNeedingAttention: active.filter((item) => item.replied && ['replied', 'contacted', 'new'].includes(item.leadStatus)).length,
      activePipelineValueXpf: active
        .filter((item) => ['interested', 'demo', 'meeting', 'quote'].includes(item.leadStatus))
        .reduce((sum, item) => sum + item.dealValueXpf, 0),
    },
    items: active,
  };
}
