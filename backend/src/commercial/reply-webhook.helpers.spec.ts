import { extractEmail, freshReplyText } from './reply-webhook.helpers';

describe('Resend reply webhook helpers', () => {
  it('extracts an address from a display-name header', () => {
    expect(extractEmail('Adrien Largier <Adrien@example.com>')).toBe(
      'adrien@example.com',
    );
  });

  it('keeps only the new reply above a French quoted thread', () => {
    expect(
      freshReplyText(
        'Ça fonctionne\n\nLe ven. 18 sept. 2026, Kynexy <contact@kynexy.fr> a écrit :\n> ancien message',
      ),
    ).toBe('Ça fonctionne');
  });
});
