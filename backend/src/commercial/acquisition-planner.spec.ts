import { buildAcquisitionPlan } from './acquisition-planner';
import type { CommercialLearningSnapshot } from './commercial-learning';
import type { ProductMarketState } from './product-market.service';

function learning(overrides: Partial<CommercialLearningSnapshot> = {}): CommercialLearningSnapshot {
  return {
    generatedAt: new Date().toISOString(),
    thresholds: {
      minContactedForAdjustment: 8,
      strongContacted: 20,
      priorStrength: 8,
    },
    baseline: {
      prospects: 20,
      contacted: 12,
      replied: 2,
      opportunities: 1,
      won: 0,
      lost: 0,
      wonValueXpf: 0,
      replyRate: 2 / 12,
      opportunityRate: 1 / 12,
      closedWinRate: null,
    },
    replyIntents: [],
    segments: [],
    ...overrides,
  };
}

function market(productId: string, enabled = true): ProductMarketState {
  return {
    productId: productId as any,
    productName: productId,
    marketId: 'pf',
    marketName: 'Polynésie française',
    currency: 'XPF',
    defaultEnabled: true,
    defaultAutopilotEnabled: true,
    priceLabel: null,
    idealCustomers: [],
    buyingSignals: [],
    objections: [],
    firstAction: '',
    demoRule: '',
    enabled,
    autopilotEnabled: enabled,
    effectivePriceLabel: null,
    overridden: false,
  };
}

describe('acquisition planner', () => {
  const markets = ['mahana', 'roulibre', 'kynexy', 'devifact'].map((id) => market(id));

  it('keeps unexplored segments eligible with a controlled batch', () => {
    const plan = buildAcquisitionPlan({ learning: learning(), productMarkets: markets });
    expect(plan[0]?.batchSize).toBe(10);
    expect(plan.some((m) => m.strategy === 'explore' && m.autoEligible)).toBe(true);
  });

  it('accelerates a proven positive product/activity segment', () => {
    const snapshot = learning({
      segments: [
        {
          key: 'product_activity:roulibre:location de véhicules',
          dimension: 'product_activity',
          label: 'Roulibre · location de véhicules',
          productId: 'roulibre',
          productName: 'Roulibre',
          activity: 'location de véhicules',
          prospects: 25,
          contacted: 22,
          replied: 8,
          opportunities: 5,
          won: 2,
          lost: 2,
          wonValueXpf: 200000,
          replyRate: 8 / 22,
          opportunityRate: 5 / 22,
          closedWinRate: 0.5,
          confidence: 'strong',
          radarAdjustment: 7,
          learningReason: 'surperforme',
        },
      ],
    });
    const mission = buildAcquisitionPlan({ learning: snapshot, productMarkets: markets }).find(
      (m) => m.productId === 'roulibre',
    );
    expect(mission?.strategy).toBe('accelerate');
    expect(mission?.priority).toBeGreaterThan(80);
  });

  it('pauses a strongly negative segment and disabled markets', () => {
    const snapshot = learning({
      segments: [
        {
          key: 'product_activity:kynexy:piscine',
          dimension: 'product_activity',
          label: 'Kynexy · piscine',
          productId: 'kynexy',
          productName: 'Kynexy',
          activity: 'piscine',
          prospects: 30,
          contacted: 25,
          replied: 1,
          opportunities: 0,
          won: 0,
          lost: 12,
          wonValueXpf: 0,
          replyRate: 1 / 25,
          opportunityRate: 0,
          closedWinRate: 0,
          confidence: 'strong',
          radarAdjustment: -6,
          learningReason: 'sous-performe',
        },
      ],
    });
    const disabledMarkets = markets.map((m) =>
      m.productId === 'mahana' ? market('mahana', false) : m,
    );
    const plan = buildAcquisitionPlan({ learning: snapshot, productMarkets: disabledMarkets });
    expect(plan.find((m) => m.activity === 'piscine')?.autoEligible).toBe(false);
    expect(plan.find((m) => m.productId === 'mahana')?.priority).toBe(0);
  });
});
