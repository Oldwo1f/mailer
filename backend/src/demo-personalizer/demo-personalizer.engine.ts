import type { Prospect } from '../entities/prospect.entity';
import type { DemoPreparation } from './demo-personalizer.types';

export function buildDemoPreparation(prospect: Prospect): DemoPreparation {
  const recommendation = prospect.productRecommendation;
  if (!recommendation) {
    throw new Error('Aucune recommandation produit disponible');
  }
  if (
    recommendation.reviewState !== 'accepted' &&
    recommendation.reviewState !== 'overridden'
  ) {
    throw new Error('La recommandation produit doit être validée avant de préparer une démo');
  }

  const website =
    prospect.enrichment?.website || prospect.profile?.sites_web?.[0] || null;
  const activity =
    prospect.enrichment?.activity || prospect.profile?.type || null;
  const location =
    prospect.enrichment?.location || prospect.profile?.commune || null;

  const factsAllowed = unique([
    ...recommendation.evidence.map((item) => item.fact),
    ...(prospect.profile?.description ? [prospect.profile.description] : []),
    ...(prospect.profile?.besoins ? [prospect.profile.besoins] : []),
    ...(prospect.enrichment?.hook ? [prospect.enrichment.hook] : []),
    ...(prospect.notes ? [prospect.notes] : []),
  ]).slice(0, 12);

  return {
    prospectId: prospect.id,
    company: prospect.company,
    productId: recommendation.productId,
    productName: recommendation.productName,
    productUrl: recommendation.productUrl,
    demoType: recommendation.demoType,
    recommendedAngle: recommendation.recommendedAngle,
    factsAllowed,
    evidence: recommendation.evidence.map((item) => ({ ...item })),
    branding: {
      name: prospect.company,
      website,
      activity,
      location,
    },
    sourceRecommendationGeneratedAt: recommendation.generatedAt,
    sourceReviewState: recommendation.reviewState,
    artifactStatus: 'not-generated',
    artifactUrls: [],
    preparedAt: new Date().toISOString(),
  };
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}
