import { buildDemoPreparation } from './demo-personalizer.engine';
import type { Prospect } from '../entities/prospect.entity';

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    company: 'Pension Lagon',
    emails: ['contact@example.pf'],
    contactName: null,
    profile: {
      type: 'Pension avec bungalows',
      description: 'Trois bungalows proposés à la réservation.',
      sites_web: ['https://example.pf'],
      source_url: 'https://example.pf',
    },
    starred: false,
    unsubscribedAt: null,
    enrichment: {
      activity: 'Hébergement touristique',
      location: 'Moorea',
      website: 'https://example.pf',
      hook: 'Réservations de bungalows en Polynésie française.',
      sources: ['https://example.pf'],
    },
    productRecommendation: {
      productId: 'mahana',
      suggestedProductId: 'mahana',
      productName: 'Mahana',
      score: 88,
      confidence: 'high',
      reasons: ['Activité compatible repérée : pension, bungalow.'],
      evidence: [
        {
          source: 'https://example.pf',
          fact: 'Trois bungalows proposés à la réservation.',
        },
      ],
      painPoints: ['La réservation est explicitement mentionnée.'],
      recommendedAngle: 'Centraliser réservations et disponibilités',
      demoType: 'mahana-personalized-images',
      productUrl: 'https://atelys-digital.com/creations',
      reviewState: 'accepted',
      reviewNote: null,
      matchedBy: 'rules',
      generatedAt: '2026-09-17T00:00:00.000Z',
    },
    demoPreparation: null,
    notes: null,
    lists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Prospect;
}

describe('buildDemoPreparation', () => {
  it('builds a demo pack from a reviewed recommendation', () => {
    const pack = buildDemoPreparation(prospect());

    expect(pack.productId).toBe('mahana');
    expect(pack.demoType).toBe('mahana-personalized-images');
    expect(pack.branding.name).toBe('Pension Lagon');
    expect(pack.branding.website).toBe('https://example.pf');
    expect(pack.factsAllowed).toContain(
      'Trois bungalows proposés à la réservation.',
    );
    expect(pack.artifactStatus).toBe('not-generated');
    expect(pack.artifactUrls).toEqual([]);
  });

  it('refuses an unreviewed recommendation', () => {
    const p = prospect();
    p.productRecommendation!.reviewState = 'unreviewed';

    expect(() => buildDemoPreparation(p)).toThrow(/validée/i);
  });

  it('refuses a rejected recommendation', () => {
    const p = prospect();
    p.productRecommendation!.reviewState = 'rejected';

    expect(() => buildDemoPreparation(p)).toThrow(/validée/i);
  });

  it('never marks an artifact as generated before actual generation', () => {
    const pack = buildDemoPreparation(prospect());

    expect(pack.artifactStatus).toBe('not-generated');
    expect(pack.artifactUrls).toHaveLength(0);
  });
});
