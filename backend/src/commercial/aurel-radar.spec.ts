import { buildAurelRadar, buildAurelRadarItem } from './aurel-radar';

describe('Aurel Radar', () => {
  it('keeps a cold prospect away from real demo generation', () => {
    const item = buildAurelRadarItem({
      id: 'cold-1',
      company: 'Cold Co',
      leadStatus: 'new',
      enrichment: { activity: 'Jardinage' },
      productRecommendation: {
        productName: 'Kynexy',
        confidence: 'high',
        reviewState: 'accepted',
      },
    });

    expect(item.tier).toBe('cold');
    expect(item.demoEligible).toBe(false);
    expect(item.demoMode).toBe('none');
  });

  it('prepares only lightweight data for a promising prospect', () => {
    const item = buildAurelRadarItem(
      {
        id: 'warm-1',
        company: 'Warm Co',
        leadStatus: 'contacted',
        enrichment: {
          activity: 'Location de véhicules',
          website: 'https://example.com',
          location: 'Tahiti',
          sources: ['site'],
        },
        productRecommendation: {
          productName: 'Roulibre',
          confidence: 'high',
          reviewState: 'accepted',
        },
      },
      { sent: 1, opens: 2, clicks: 0 },
    );

    expect(item.tier).toBe('promising');
    expect(item.demoEligible).toBe(false);
    expect(item.demoMode).toBe('prepare');
  });

  it('allows real demo generation only after strong commercial intent', () => {
    const item = buildAurelRadarItem(
      {
        id: 'hot-1',
        company: 'Hot Co',
        leadStatus: 'replied',
        replyDetectedAt: new Date(),
        enrichment: { activity: 'Pension de famille' },
        productRecommendation: {
          productName: 'Mahana',
          confidence: 'high',
          reviewState: 'accepted',
        },
      },
      { sent: 1, opens: 2, clicks: 1 },
    );

    expect(item.tier).toBe('hot');
    expect(item.demoEligible).toBe(true);
    expect(item.demoMode).toBe('generate');
    expect(item.nextAction).toContain('réponse');
  });

  it('sorts active prospects by opportunity and excludes closed deals', () => {
    const radar = buildAurelRadar(
      [
        { id: 'a', company: 'A', leadStatus: 'new' },
        {
          id: 'b',
          company: 'B',
          leadStatus: 'interested',
          dealValueXpf: 150000,
          productRecommendation: {
            productName: 'Kynexy',
            confidence: 'high',
            reviewState: 'accepted',
          },
        },
        { id: 'c', company: 'C', leadStatus: 'won', dealValueXpf: 200000 },
      ],
      new Map(),
    );

    expect(radar.items.map((item) => item.prospectId)).toEqual(['b', 'a']);
    expect(radar.summary.totalActive).toBe(2);
    expect(radar.summary.activePipelineValueXpf).toBe(150000);
  });
});
