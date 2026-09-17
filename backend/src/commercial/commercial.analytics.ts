import type { LeadStatus, Prospect } from '../entities/prospect.entity';

export type ProductPerformance = {
  productId: string;
  productName: string;
  prospects: number;
  contactedOrLater: number;
  replied: number;
  activeOpportunities: number;
  won: number;
  lost: number;
  activePipelineValueXpf: number;
  wonValueXpf: number;
  replyRate: number | null;
  closedWinRate: number | null;
  averageWonValueXpf: number | null;
};

export type ProductAnalytics = {
  generatedAt: string;
  products: ProductPerformance[];
};

const ACTIVE_STATUSES: LeadStatus[] = ['interested', 'demo', 'meeting', 'quote'];

export function buildProductAnalytics(rows: Prospect[]): ProductAnalytics {
  const groups = new Map<string, ProductPerformance>();

  for (const prospect of rows) {
    const attribution = resolveAttribution(prospect);
    const key = attribution.productId;
    let group = groups.get(key);
    if (!group) {
      group = {
        productId: attribution.productId,
        productName: attribution.productName,
        prospects: 0,
        contactedOrLater: 0,
        replied: 0,
        activeOpportunities: 0,
        won: 0,
        lost: 0,
        activePipelineValueXpf: 0,
        wonValueXpf: 0,
        replyRate: null,
        closedWinRate: null,
        averageWonValueXpf: null,
      };
      groups.set(key, group);
    }

    group.prospects += 1;
    const status = prospect.leadStatus || 'new';
    const value = Math.max(0, Number(prospect.dealValueXpf) || 0);

    if (status !== 'new') group.contactedOrLater += 1;
    if (prospect.replyDetectedAt || isReplyOrLater(status)) group.replied += 1;
    if (ACTIVE_STATUSES.includes(status)) {
      group.activeOpportunities += 1;
      group.activePipelineValueXpf += value;
    }
    if (status === 'won') {
      group.won += 1;
      group.wonValueXpf += value;
    }
    if (status === 'lost') group.lost += 1;
  }

  const products = [...groups.values()];
  for (const row of products) {
    row.replyRate = row.contactedOrLater
      ? row.replied / row.contactedOrLater
      : null;
    const closed = row.won + row.lost;
    row.closedWinRate = closed ? row.won / closed : null;
    row.averageWonValueXpf = row.won ? row.wonValueXpf / row.won : null;
  }

  products.sort((a, b) => {
    if (b.wonValueXpf !== a.wonValueXpf) return b.wonValueXpf - a.wonValueXpf;
    if (b.activePipelineValueXpf !== a.activePipelineValueXpf) {
      return b.activePipelineValueXpf - a.activePipelineValueXpf;
    }
    return b.prospects - a.prospects;
  });

  return { generatedAt: new Date().toISOString(), products };
}

function resolveAttribution(prospect: Prospect) {
  const recommendation = prospect.productRecommendation;
  if (
    recommendation &&
    (recommendation.reviewState === 'accepted' ||
      recommendation.reviewState === 'overridden')
  ) {
    return {
      productId: recommendation.productId,
      productName: recommendation.productName,
    };
  }
  return {
    productId: 'unattributed',
    productName: 'Sans produit validé',
  };
}

function isReplyOrLater(status: LeadStatus) {
  return [
    'replied',
    'interested',
    'demo',
    'meeting',
    'quote',
    'won',
    'lost',
  ].includes(status);
}
