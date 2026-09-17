import { buildAutoReplyMessage } from './reply-autopilot';
import { classifyReply } from './reply-intelligence';

describe('reply autopilot templates', () => {
  it('answers a clear price question with configured market pricing', () => {
    const message = buildAutoReplyMessage({
      analysis: classifyReply({ bodyText: 'Combien coûte Roulibre ?' }),
      productName: 'Roulibre',
      priceLabel: '5 900 XPF / mois',
      productUrl: 'https://atelys-digital.com/creations',
      originalSubject: 'Roulibre',
    });
    expect(message?.text).toContain('5 900 XPF / mois');
    expect(message?.subject).toBe('Re: Roulibre');
  });

  it('does not invent a demo when no real artifact exists', () => {
    const message = buildAutoReplyMessage({
      analysis: classifyReply({ bodyText: 'Est-ce que je peux voir une démo ?' }),
      productName: 'Mahana',
      priceLabel: '2 900 XPF / mois',
      demoUrls: [],
    });
    expect(message).toBeNull();
  });

  it('does not autonomously price custom work', () => {
    const message = buildAutoReplyMessage({
      analysis: classifyReply({ bodyText: 'Quel est le prix ?' }),
      productName: 'Atelys sur-mesure',
      priceLabel: 'Sur devis',
    });
    expect(message).toBeNull();
  });
});
