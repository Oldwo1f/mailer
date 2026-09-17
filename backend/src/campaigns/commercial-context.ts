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

/**
 * Append a strictly bounded Atelys context to a campaign brief.
 * The LLM receives no unreviewed recommendation and can only mention a demo
 * when at least one real generated artifact URL exists.
 */
export function buildCommercialBrief(
  baseBrief: string,
  context: CommercialContext | null,
): string {
  if (!context) return baseBrief;

  const facts = context.factsAllowed.length
    ? context.factsAllowed.map((fact) => `- ${fact}`).join('\n')
    : '- Aucun fait additionnel autorisé.';

  const demoBlock = context.demoAvailable
    ? `Une démo existe réellement et peut être mentionnée. URLs autorisées:\n${context.demoArtifactUrls
        .map((url) => `- ${url}`)
        .join('\n')}`
    : `Aucun artefact de démo n'est généré. INTERDICTION de dire ou laisser entendre qu'une démo, maquette, capture, aperçu ou lien personnalisé existe.`;

  return `${baseBrief.trim()}\n\n--- CONTEXTE ATELYS VALIDÉ ---\nProduit validé: ${context.productName}\nURL produit: ${context.productUrl}\nAngle recommandé: ${context.recommendedAngle}\nScore de correspondance interne: ${context.score}/100 (${context.confidence})\n\nFaits prospect autorisés à citer:\n${facts}\n\n${demoBlock}\n\nRègles impératives:\n- Ne citer aucun autre fait prospect non présent dans le brief, le profil ou les faits autorisés ci-dessus.\n- Ne jamais présenter le score interne au prospect.\n- Ne jamais promettre une fonctionnalité non explicitement présente dans le brief ou le contexte produit.\n- Si aucune démo n'est disponible, le CTA doit porter sur une découverte, un échange ou la présentation du produit, jamais sur l'ouverture d'une démo.\n--- FIN CONTEXTE ATELYS VALIDÉ ---`;
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
