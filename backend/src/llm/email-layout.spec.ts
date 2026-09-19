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
    expect(html).toContain(
      'https://kynexy.fr/assets/kynexy-brand-logo-official.png',
    );
    expect(html).toContain('alt="Kynexy"');
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

  it('adds the prospecting card before the CTA when explicitly enabled', () => {
    const html = wrapEmailHtml(content, {
      senderEmail: 'contact@kynexy.fr',
      includeKynexyProspectingCard: true,
    });

    expect(html).toContain('kynexy-prospection-artisans.jpg');
    expect(html).toContain('Du terrain au devis signé.');
    expect(html).toContain('ponctuelles ou récurrentes');
    expect(html).toContain('avec ou sans fournitures');
    expect(html).not.toContain('border-radius:999px;background-color:#0d293c');
    expect(html).not.toContain('border-radius:999px;background-color:#10352f');
    expect(html.indexOf('kynexy-prospection-artisans.jpg')).toBeLessThan(
      html.indexOf('Découvrir Kynexy'),
    );
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
