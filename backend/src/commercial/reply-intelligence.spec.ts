import { classifyReply } from './reply-intelligence';

describe('reply intelligence', () => {
  it('detects price questions as high-confidence interest', () => {
    const result = classifyReply({ bodyText: 'Bonjour, combien coûte Roulibre par mois ?' });
    expect(result.intent).toBe('price');
    expect(result.suggestedStatus).toBe('interested');
    expect(result.autoReplyAllowed).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('stops on explicit refusals', () => {
    const result = classifyReply({ bodyText: 'Non merci, cela ne nous intéresse pas.' });
    expect(result.intent).toBe('not_interested');
    expect(result.suggestedStatus).toBe('lost');
    expect(result.autoReplyAllowed).toBe(false);
  });

  it('recognizes demo requests', () => {
    const result = classifyReply({ bodyText: 'Est-ce qu’on peut voir une démo ?' });
    expect(result.intent).toBe('demo');
    expect(result.suggestedStatus).toBe('demo');
  });

  it('keeps ambiguous questions out of autonomous replies', () => {
    const result = classifyReply({ bodyText: 'Bonjour, pouvez-vous préciser comment cela fonctionne ?' });
    expect(result.intent).toBe('question');
    expect(result.autoReplyAllowed).toBe(false);
  });
});
