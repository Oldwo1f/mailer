import type { Prospect } from '../entities/prospect.entity';
import {
  activityBucket,
  buildCommercialLearning,
  learningAdjustmentForProspect,
} from './commercial-learning';

function prospect(
  id: string,
  input: Partial<Prospect> & {
    activity?: string;
    productId?: 'mahana' | 'roulibre' | 'kynexy' | 'devifact' | 'custom-atelys';
    productName?: string;
  } = {},
): Prospect {
  return {
    id,
    company: `Entreprise ${id}`,
    emails: [`${id}@example.com`],
    contactName: null,
    marketId: 'pf',
    profile: null,
    starred: false,
    unsubscribedAt: null,
    enrichment: input.activity ? { activity: input.activity } : null,
    productRecommendation: input.productId
      ? ({
          productId: input.productId,
          suggestedProductId: input.productId,
          productName: input.productName || input.productId,
          score: 10,
          confidence: 'high',
          reasons: [],
          evidence: [],
          painPoints: [],
          recommendedAngle: '',
          demoType: '',
          productUrl: 'https://atelys-digital.com/creations',
          reviewState: 'accepted',
          matchedBy: 'rules',
          generatedAt: new Date().toISOString(),
        } as any)
      : null,
    demoPreparation: null,
    leadStatus: input.leadStatus || 'new',
    dealValueXpf: input.dealValueXpf ?? null,
    replyDetectedAt: input.replyDetectedAt ?? null,
    lastReplyFrom: null,
    lastReplySubject: null,
    lastReplyMessageId: null,
    lastReplyIntent: input.lastReplyIntent ?? null,
    lastReplyConfidence: null,
    lastReplySnippet: null,
    nextCommercialAction: null,
    autoReplySentAt: null,
    wonAt: null,
    lostReason: null,
    notes: null,
    lists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Prospect;
}

describe('commercial learning', () => {
  it('normalizes useful Polynesian activity buckets', () => {
    expect(activityBucket(prospect('a', { activity: 'Location de voitures et scooters' }))).toBe(
      'location de véhicules',
    );
    expect(activityBucket(prospect('b', { activity: 'Entretien de jardins et paysagisme' }))).toBe(
      'jardin / paysage',
    );
  });

  it('does not alter Radar priorities before enough contacted examples exist', () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      prospect(String(index), {
        activity: 'location voiture',
        productId: 'roulibre',
        productName: 'Roulibre',
        leadStatus: index < 4 ? 'replied' : 'contacted',
        replyDetectedAt: index < 4 ? new Date() : null,
      }),
    );
    const snapshot = buildCommercialLearning(rows);
    const adjustment = learningAdjustmentForProspect(snapshot, rows[0]);
    expect(adjustment.points).toBe(0);
    expect(adjustment.confidence).toBe('collecting');
  });

  it('learns a bounded positive priority adjustment from a segment outperforming baseline', () => {
    const strong = Array.from({ length: 10 }, (_, index) =>
      prospect(`r${index}`, {
        activity: 'location de voiture',
        productId: 'roulibre',
        productName: 'Roulibre',
        leadStatus: index < 7 ? 'interested' : 'contacted',
        replyDetectedAt: index < 7 ? new Date() : null,
      }),
    );
    const weak = Array.from({ length: 20 }, (_, index) =>
      prospect(`w${index}`, {
        activity: 'artisan service',
        productId: 'devifact',
        productName: 'DeviFact',
        leadStatus: index === 0 ? 'replied' : 'contacted',
        replyDetectedAt: index === 0 ? new Date() : null,
      }),
    );

    const snapshot = buildCommercialLearning([...strong, ...weak]);
    const adjustment = learningAdjustmentForProspect(snapshot, strong[0]);
    expect(adjustment.points).toBeGreaterThan(0);
    expect(adjustment.points).toBeLessThanOrEqual(8);
    expect(adjustment.source).toBe('product_activity');
  });

  it('tracks reply intents for later commercial analysis', () => {
    const rows = [
      prospect('1', { leadStatus: 'replied', lastReplyIntent: 'price' }),
      prospect('2', { leadStatus: 'replied', lastReplyIntent: 'price' }),
      prospect('3', { leadStatus: 'lost', lastReplyIntent: 'not_interested' }),
    ];
    const snapshot = buildCommercialLearning(rows);
    expect(snapshot.replyIntents[0]).toEqual({ intent: 'price', count: 2 });
  });
});
