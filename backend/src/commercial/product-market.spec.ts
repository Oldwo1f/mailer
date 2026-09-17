import {
  PRODUCT_MARKET_PROFILES,
  getProductMarketProfile,
} from './product-market';

describe('product market profiles', () => {
  it('keeps Polynesia active in XPF for every current Atelys product', () => {
    const pf = PRODUCT_MARKET_PROFILES.filter((row) => row.marketId === 'pf');
    expect(pf).toHaveLength(5);
    expect(pf.every((row) => row.defaultEnabled)).toBe(true);
    expect(pf.every((row) => row.defaultAutopilotEnabled)).toBe(true);
    expect(pf.every((row) => row.currency === 'XPF')).toBe(true);
  });

  it('keeps France locked until an EUR offer is explicitly activated', () => {
    const fr = PRODUCT_MARKET_PROFILES.filter((row) => row.marketId === 'fr');
    expect(fr).toHaveLength(5);
    expect(fr.every((row) => !row.defaultEnabled)).toBe(true);
    expect(fr.every((row) => !row.defaultAutopilotEnabled)).toBe(true);
    expect(fr.every((row) => row.currency === 'EUR')).toBe(true);
    expect(fr.every((row) => row.priceLabel === null)).toBe(true);
  });

  it('finds one product/market playbook deterministically', () => {
    const profile = getProductMarketProfile('roulibre', 'pf');
    expect(profile?.productName).toBe('Roulibre');
    expect(profile?.buyingSignals.length).toBeGreaterThan(2);
    expect(getProductMarketProfile('roulibre', 'unknown')).toBeNull();
  });
});
