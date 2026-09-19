import { wrapEmailHtml } from './email-layout';

describe('email layout branding', () => {
  const content =
    '<p>Bonjour Adrien,</p><p>Votre activité en un seul endroit.</p><p><a href="https://kynexy.fr">Découvrir Kynexy</a></p>';

  it('uses the Kynexy identity for contact@kynexy.fr', () => {
    const html = wrapEmailHtml(content, {
      senderEmail: 'contact@kynexy.fr',
    });

    expect(html).toContain('KYNEXY');
    expect(html).toContain('Votre activité. Enfin réunie.');
    expect(html).toContain('Le centre de contrôle mobile conçu');
    expect(html).toContain('background-color:#0b0b0f');
    expect(html).toContain('background-color:#0071e3');
    expect(html).toContain('contact@kynexy.fr');
  });

  it('keeps the existing template for other sender domains', () => {
    const html = wrapEmailHtml(content, {
      senderEmail: 'contact@atelys-digital.com',
    });

    expect(html).not.toContain('KYNEXY');
    expect(html).toContain('background-color:#0f766e');
    expect(html).toContain('max-width:560px');
  });

  it('does not wrap an email that is already laid out', () => {
    const wrapped = wrapEmailHtml(content, {
      senderEmail: 'contact@kynexy.fr',
    });

    expect(wrapEmailHtml(wrapped, { senderEmail: 'contact@kynexy.fr' })).toBe(
      wrapped,
    );
  });
});
