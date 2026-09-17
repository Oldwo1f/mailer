import type { Prospect } from '../entities/prospect.entity';

export type CommercialContext = {
  productId: string;
  productName: string;
  productUrl: string;
  recommendedAngle: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  factsAllowed: string[];
  evidence: Array<{ source: string; fact: string }>;
  demoAvailable: boolean;
  demoArtifactUrls: string[];
};

/**
 * Build the only product/demo context that may be handed to email generation.
 * Human review is mandatory. A prepared demo pack may contribute facts, but a
 * demo is advertised only when a real generated artifact URL exists.
 */
export function buildCommercialContext(
  prospect: Prospect,
): CommercialContext | null {
  const recommendation = prospect.productRecommendation;
  if (!recommendation) return null;
  if (
    recommendation.reviewState !== 'accepted' &&
    recommendation.reviewState !== 'overridden'
  ) {
    return null;
  }

  const preparation = prospect.demoPreparation;
  const preparationMatches = Boolean(
    preparation &&
      preparation.productId === recommendation.productId &&
      (preparation.sourceReviewState === 'accepted' ||
        preparation.sourceReviewState === 'overridden'),
  );

  const generatedUrls =
    preparationMatches && preparation?.artifactStatus === 'generated'
      ? (preparation.artifactUrls || []).filter(isPublicHttpUrl)
      : [];

  const evidence = preparationMatches
    ? (preparation?.evidence || [])
    : recommendation.evidence || [];

  const factsAllowed = unique(
    preparationMatches
      ? preparation?.factsAllowed || []
      : evidence.map((item) => item.fact),
  ).slice(0, 12);

  return {
    productId: recommendation.productId,
    productName: recommendation.productName,
    productUrl: recommendation.productUrl,
    recommendedAngle: recommendation.recommendedAngle,
    confidence: recommendation.confidence,
    score: recommendation.score,
    factsAllowed,
    evidence: evidence.slice(0, 8),
    demoAvailable: generatedUrls.length > 0,
    demoArtifactUrls: generatedUrls.slice(0, 6),
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}
