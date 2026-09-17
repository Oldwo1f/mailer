import { buildRecommendation } from './product-matcher.engine';
import type { Prospect } from '../entities/prospect.entity';

function prospect(partial: Partial<Prospect>): Prospect {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    company: 'Test',
    emails: ['test@example.pf'],
    contactName: null,
    profile: null,
    starred: false,
    unsubscribedAt: null,
    enrichment: null,
    productRecommendation: null,
    notes: null,
    lists: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Prospect;
}

describe('buildRecommendation', () => {
  it('matches accommodation businesses to Mahana', () => {
    const result = buildRecommendation(
      prospect({
        company: 'Pension du Lagon',
        profile: {
          type: 'Pension de famille avec bungalows',
          description: 'Réservations de bungalows et gestion des disponibilités.',
          sites_web: ['https://example.pf'],
          source_url: 'https://example.pf',
        },
        enrichment: {
          activity: 'Hébergement touristique',
          website: 'https://example.pf',
          sources: ['https://example.pf'],
        },
      }),
    );

    expect(result.productId).toBe('mahana');
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('matches vehicle rental businesses to Roulibre', () => {
    const result = buildRecommendation(
      prospect({
        company: 'Tahiti Car Rental',
        profile: {
          type: 'Location de voiture et scooter',
          description: 'Flotte de véhicules avec réservation.',
          source_url: 'https://cars.example.pf',
        },
        enrichment: {
          activity: 'Location de véhicules',
          website: 'https://cars.example.pf',
          sources: ['https://cars.example.pf'],
        },
      }),
    );

    expect(result.productId).toBe('roulibre');
    expect(result.score).toBeGreaterThanOrEqual(60);
  });

  it('prefers Kynexy for field-service artisans with interventions', () => {
    const result = buildRecommendation(
      prospect({
        company: 'Jardin Pro',
        profile: {
          type: 'Entreprise de jardinage',
          besoins: 'Planning équipe, interventions terrain et devis',
          source_url: 'https://jardin.example.pf',
        },
        enrichment: {
          activity: 'Jardinage et entretien extérieur',
          sources: ['https://jardin.example.pf'],
        },
      }),
    );

    expect(result.productId).toBe('kynexy');
    expect(result.reasons.join(' ')).toMatch(/jardin|intervention|planning/i);
  });

  it('returns low-confidence custom fit for ambiguous prospects', () => {
    const result = buildRecommendation(
      prospect({
        company: 'Entreprise Exemple',
        profile: { description: 'Entreprise locale en Polynésie française.' },
      }),
    );

    expect(result.productId).toBe('custom-atelys');
    expect(result.confidence).toBe('low');
  });
});
