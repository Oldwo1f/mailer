import { buildProductAnalytics } from './commercial.analytics';
import type { Prospect } from '../entities/prospect.entity';

function prospect(partial: Partial<Prospect>): Prospect {
  return {
    id: crypto.randomUUID(),
    company: 'Test',
    emails: ['test@example.pf'],
    contactName: null,
    profile: null,
    starred: false,
    unsubscribedAt: null,
    enrichment: null,
    productRecommendation: null,
    demoPreparation: null,
    leadStatus: 'new',
    dealValueXpf: null,
    replyDetectedAt: null,
    lastReplyFrom: null,
    lastReplySubject: null,
    lastReplyMessageId: null,
    wonAt: null,
    lostReason: null,
    notes: null,
    lists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Prospect;
}

function recommendation(productId: string, productName: string) {
  return {
    productId,
    suggestedProductId: productId,
    productName,
    score: 80,
    confidence: 'high' as const,
    reasons: [],
    evidence: [],
    painPoints: [],
    recommendedAngle: '',
    demoType: '',
    productUrl: 'https://atelys-digital.com/creations',
    reviewState: 'accepted' as const,
    matchedBy: 'rules' as const,
    generatedAt: new Date().toISOString(),
  };
}

describe('buildProductAnalytics', () => {
  it('attributes only human-validated product recommendations', () => {
    const accepted = prospect({
      productRecommendation: recommendation('kynexy', 'Kynexy') as any,
      leadStatus: 'contacted',
    });
    const unreviewed = prospect({
      productRecommendation: {
        ...recommendation('mahana', 'Mahana'),
        reviewState: 'unreviewed',
      } as any,
      leadStatus: 'contacted',
    });

    const result = buildProductAnalytics([accepted, unreviewed]);
    expect(result.products.find((p) => p.productId === 'kynexy')?.prospects).toBe(1);
    expect(result.products.find((p) => p.productId === 'unattributed')?.prospects).toBe(1);
  });

  it('computes reply, closed win and XPF metrics', () => {
    const rows = [
      prospect({
        productRecommendation: recommendation('mahana', 'Mahana') as any,
        leadStatus: 'won',
        dealValueXpf: 120000,
        replyDetectedAt: new Date(),
      }),
      prospect({
        productRecommendation: recommendation('mahana', 'Mahana') as any,
        leadStatus: 'lost',
        dealValueXpf: 80000,
        replyDetectedAt: new Date(),
      }),
      prospect({
        productRecommendation: recommendation('mahana', 'Mahana') as any,
        leadStatus: 'contacted',
      }),
    ];

    const mahana = buildProductAnalytics(rows).products[0];
    expect(mahana.productId).toBe('mahana');
    expect(mahana.contactedOrLater).toBe(3);
    expect(mahana.replied).toBe(2);
    expect(mahana.replyRate).toBeCloseTo(2 / 3);
    expect(mahana.closedWinRate).toBe(0.5);
    expect(mahana.wonValueXpf).toBe(120000);
    expect(mahana.averageWonValueXpf).toBe(120000);
  });

  it('keeps active pipeline value separate from won revenue', () => {
    const result = buildProductAnalytics([
      prospect({
        productRecommendation: recommendation('roulibre', 'Roulibre') as any,
        leadStatus: 'quote',
        dealValueXpf: 189000,
      }),
      prospect({
        productRecommendation: recommendation('roulibre', 'Roulibre') as any,
        leadStatus: 'won',
        dealValueXpf: 95000,
      }),
    ]).products[0];

    expect(result.activePipelineValueXpf).toBe(189000);
    expect(result.wonValueXpf).toBe(95000);
  });
});
