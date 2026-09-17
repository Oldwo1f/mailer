import type { Prospect } from '../entities/prospect.entity';
import {
  buildCommercialBrief,
  buildCommercialContext,
} from './commercial-context';

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    company: 'Pension Lagon',
    emails: ['contact@example.pf'],
    contactName: null,
    profile: null,
    starred: false,
    unsubscribedAt: null,
    enrichment: null,
    productRecommendation: null,
    demoPreparation: null,
    notes: null,
    lists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Prospect;
}

const acceptedRecommendation = {
  productId: 'mahana' as const,
  suggestedProductId: 'mahana' as const,
  productName: 'Mahana',
  score: 88,
  confidence: 'high' as const,
  reasons: ['Activité compatible'],
  evidence: [
    { source: 'https://example.pf', fact: 'La pension propose trois bungalows.' },
  ],
  painPoints: [],
  recommendedAngle: 'Centraliser réservations et disponibilités',
  demoType: 'mahana-personalized-images',
  productUrl: 'https://atelys-digital.com/creations',
  reviewState: 'accepted' as const,
  reviewNote: null,
  matchedBy: 'rules' as const,
  generatedAt: '2026-09-17T00:00:00.000Z',
};

describe('commercial campaign context', () => {
  it('does not expose an unreviewed recommendation', () => {
    const row = prospect({
      productRecommendation: {
        ...acceptedRecommendation,
        reviewState: 'unreviewed',
      },
    });

    expect(buildCommercialContext(row)).toBeNull();
  });

  it('injects accepted product facts but forbids demo claims when no artifact exists', () => {
    const row = prospect({ productRecommendation: acceptedRecommendation });
    const context = buildCommercialContext(row);

    expect(context?.productName).toBe('Mahana');
    expect(context?.demoAvailable).toBe(false);

    const brief = buildCommercialBrief('Présenter notre solution.', context);
    expect(brief).toContain('Produit validé: Mahana');
    expect(brief).toContain('La pension propose trois bungalows.');
    expect(brief).toContain("INTERDICTION de dire ou laisser entendre qu'une démo");
    expect(brief).toContain('Ne jamais présenter le score interne au prospect.');
  });

  it('allows demo mention only when matching generated artifact URLs exist', () => {
    const row = prospect({
      productRecommendation: acceptedRecommendation,
      demoPreparation: {
        prospectId: '00000000-0000-4000-8000-000000000001',
        company: 'Pension Lagon',
        productId: 'mahana',
        productName: 'Mahana',
        productUrl: 'https://atelys-digital.com/creations',
        demoType: 'mahana-personalized-images',
        recommendedAngle: 'Centraliser réservations et disponibilités',
        factsAllowed: ['La pension propose trois bungalows.'],
        evidence: [
          {
            source: 'https://example.pf',
            fact: 'La pension propose trois bungalows.',
          },
        ],
        branding: {
          name: 'Pension Lagon',
          website: 'https://example.pf',
          activity: 'Pension',
          location: 'Tahiti',
        },
        sourceRecommendationGeneratedAt: '2026-09-17T00:00:00.000Z',
        sourceReviewState: 'accepted',
        artifactStatus: 'generated',
        artifactUrls: [
          'https://mailing.aito-flow.com/demo/pension-lagon/01.png',
          'javascript:alert(1)',
        ],
        preparedAt: '2026-09-17T00:05:00.000Z',
      },
    });

    const context = buildCommercialContext(row);
    expect(context?.demoAvailable).toBe(true);
    expect(context?.demoArtifactUrls).toEqual([
      'https://mailing.aito-flow.com/demo/pension-lagon/01.png',
    ]);

    const brief = buildCommercialBrief('Présenter notre solution.', context);
    expect(brief).toContain('Une démo existe réellement et peut être mentionnée.');
    expect(brief).toContain(
      'https://mailing.aito-flow.com/demo/pension-lagon/01.png',
    );
    expect(brief).not.toContain('javascript:alert(1)');
  });
});
