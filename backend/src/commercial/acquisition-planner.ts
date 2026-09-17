import type { CommercialLearningSnapshot } from './commercial-learning';
import type { ProductMarketState } from './product-market.service';

export type AcquisitionStrategy = 'accelerate' | 'explore' | 'steady' | 'pause';

export type AcquisitionMission = {
  key: string;
  productId: string;
  productName: string;
  activity: string;
  keywords: string;
  marketId: string;
  marketName: string;
  currency: string;
  priority: number;
  strategy: AcquisitionStrategy;
  batchSize: 10;
  autoEligible: boolean;
  reason: string;
  learningConfidence: 'collecting' | 'usable' | 'strong';
  contactedComparable: number;
  radarAdjustment: number;
};

const PF_MISSIONS: Array<{
  productId: string;
  productName: string;
  activity: string;
  keywords: string;
}> = [
  {
    productId: 'mahana',
    productName: 'Mahana',
    activity: 'hébergement touristique',
    keywords: 'pension bungalow hébergement touristique location saisonnière',
  },
  {
    productId: 'roulibre',
    productName: 'Roulibre',
    activity: 'location de véhicules',
    keywords: 'location voiture scooter moto quad',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'jardin / paysage',
    keywords: 'jardin paysagiste entretien espaces verts',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'piscine',
    keywords: 'pisciniste entretien piscine',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'climatisation / chauffage',
    keywords: 'climatisation froid chauffage maintenance clim',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'plomberie',
    keywords: 'plombier plomberie dépannage',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'électricité',
    keywords: 'électricien électricité dépannage',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'élagage',
    keywords: 'élagage abattage arboriste',
  },
  {
    productId: 'kynexy',
    productName: 'Kynexy',
    activity: 'maintenance / technique',
    keywords: 'maintenance technicien intervention dépannage',
  },
  {
    productId: 'devifact',
    productName: 'DeviFact',
    activity: 'artisan / services',
    keywords: 'artisan indépendant prestataire service devis facture',
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function segmentFor(
  learning: CommercialLearningSnapshot,
  productId: string,
  activity: string,
) {
  return (
    learning.segments.find(
      (segment) =>
        segment.dimension === 'product_activity' &&
        segment.productId === productId &&
        segment.activity === activity,
    ) ||
    learning.segments.find(
      (segment) =>
        segment.dimension === 'activity' && segment.activity === activity,
    ) ||
    learning.segments.find(
      (segment) =>
        segment.dimension === 'product' && segment.productId === productId,
    ) ||
    null
  );
}

export function buildAcquisitionPlan(input: {
  learning: CommercialLearningSnapshot;
  productMarkets: ProductMarketState[];
}): AcquisitionMission[] {
  const markets = new Map(
    input.productMarkets.map((market) => [
      `${market.productId}:${market.marketId}`,
      market,
    ]),
  );

  return PF_MISSIONS.map((seed) => {
    const market = markets.get(`${seed.productId}:pf`);
    const segment = segmentFor(input.learning, seed.productId, seed.activity);
    const confidence = segment?.confidence || 'collecting';
    const contacted = segment?.contacted || 0;
    const adjustment = segment?.radarAdjustment || 0;

    let strategy: AcquisitionStrategy = 'explore';
    let priority = 55;
    let reason = 'Pas encore assez de données : exploration contrôlée.';

    if (confidence === 'collecting') {
      const missing = Math.max(
        0,
        input.learning.thresholds.minContactedForAdjustment - contacted,
      );
      priority += Math.min(10, missing);
      reason = `Exploration pour apprendre : ${contacted} contact(s) comparable(s), seuil ${input.learning.thresholds.minContactedForAdjustment}.`;
    } else if (adjustment >= 4) {
      strategy = 'accelerate';
      priority = 72 + adjustment * 3;
      reason = `Ce segment surperforme vos résultats moyens (${adjustment > 0 ? '+' : ''}${adjustment} pts Radar).`;
    } else if (adjustment <= -5 && confidence === 'strong') {
      strategy = 'pause';
      priority = 5;
      reason = `Segment sous-performant avec assez de recul (${adjustment} pts) : prospection automatique suspendue.`;
    } else if (adjustment < 0) {
      strategy = 'steady';
      priority = 42 + adjustment * 2;
      reason = `Résultats un peu sous la moyenne (${adjustment} pts) : volume réduit, sans abandon prématuré.`;
    } else {
      strategy = 'steady';
      priority = 58 + adjustment * 2;
      reason = `Résultats dans la moyenne (${adjustment >= 0 ? '+' : ''}${adjustment} pts) : cadence normale.`;
    }

    const marketEnabled = Boolean(market?.enabled);
    const autopilotEnabled = Boolean(
      market?.enabled && market?.autopilotEnabled,
    );
    const autoEligible =
      marketEnabled && autopilotEnabled && strategy !== 'pause';

    if (!marketEnabled) {
      strategy = 'pause';
      priority = 0;
      reason = 'Marché désactivé pour ce produit.';
    }

    return {
      key: `${seed.productId}:pf:${seed.activity}`,
      productId: seed.productId,
      productName: seed.productName,
      activity: seed.activity,
      keywords: seed.keywords,
      marketId: 'pf',
      marketName: market?.marketName || 'Polynésie française',
      currency: market?.currency || 'XPF',
      priority: Math.round(clamp(priority, 0, 100)),
      strategy,
      batchSize: 10 as const,
      autoEligible,
      reason,
      learningConfidence: confidence,
      contactedComparable: contacted,
      radarAdjustment: adjustment,
    };
  }).sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
}
