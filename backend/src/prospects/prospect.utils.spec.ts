import {
  decodeCfEmail,
  extractEmailsFromText,
  extractImportRecords,
  extractSameOriginContactUrls,
  isCompanyWebsite,
  isProspectEmail,
  isPublicHttpUrl,
} from './prospect.utils';
import {
  buildDiscoverQueries,
  buildEmailHuntQueries,
  contactPageUrls,
  parseKeywordTopics,
} from '../discover/discover.queries';
import { isDiscoverBatchSize } from '../discover/discover.types';

describe('extractEmailsFromText', () => {
  it('extrait les emails explicites et mailto', () => {
    const text = `
      Contact: iai@coco.pf
      <a href="mailto:hello@atelier.pf">écrire</a>
      junk noreply@shop.pf
    `;
    expect(extractEmailsFromText(text)).toEqual(
      expect.arrayContaining(['iai@coco.pf', 'hello@atelier.pf']),
    );
    expect(extractEmailsFromText(text)).not.toContain('noreply@shop.pf');
  });

  it('ignore les domaines d’annuaire et placeholders', () => {
    const text =
      'bsachet@tahititourisme.org support@example.com contact@real-spa.pf';
    expect(extractEmailsFromText(text)).toEqual(['contact@real-spa.pf']);
  });

  it('reconstruit les emails obfusqués', () => {
    expect(extractEmailsFromText('contact [at] salon [dot] pf')).toEqual([
      'contact@salon.pf',
    ]);
  });

  it('décode Cloudflare data-cfemail et JSON-LD', () => {
    const key = 0x3d;
    const email = 'contact@salon.pf';
    let hex = key.toString(16).padStart(2, '0');
    for (const ch of email) {
      hex += (ch.charCodeAt(0) ^ key).toString(16).padStart(2, '0');
    }
    expect(decodeCfEmail(hex)).toBe(email);
    const html = `<span class="__cf_email__" data-cfemail="${hex}"></span>
      <script type="application/ld+json">{"email":"hello@atelier.pf"}</script>
      <a href="mailto:resa%40hotel.pf?subject=Hi">mail</a>`;
    expect(extractEmailsFromText(html)).toEqual(
      expect.arrayContaining([
        'contact@salon.pf',
        'hello@atelier.pf',
        'resa@hotel.pf',
      ]),
    );
  });

  it('extrait JSON-LD tableau, data-email et liens contact', () => {
    const html = `<script type="application/ld+json">
      {"email":["accueil@spa.pf","info@spa.pf"]}
    </script>
    <a href="/nous-contacter" data-email="resa@spa.pf">contact</a>
    <span itemprop="email" content="hello@spa.pf"></span>`;
    expect(extractEmailsFromText(html)).toEqual(
      expect.arrayContaining([
        'accueil@spa.pf',
        'info@spa.pf',
        'resa@spa.pf',
        'hello@spa.pf',
      ]),
    );
    expect(
      extractSameOriginContactUrls(html, 'https://www.spa.pf/accueil'),
    ).toEqual(['https://www.spa.pf/nous-contacter']);
  });
});

describe('isProspectEmail / isCompanyWebsite', () => {
  it('ignore les TLD fantaisistes extraits du texte', () => {
    expect(isProspectEmail('relax@ion.french')).toBe(false);
    expect(isProspectEmail('st@istiques.le')).toBe(false);
    expect(isProspectEmail('info@hoteltahitinui.pf')).toBe(true);
    expect(isProspectEmail('privacy@brand.com')).toBe(false);
  });

  it('refuse les URLs d’annuaire comme site entreprise', () => {
    expect(isCompanyWebsite('https://www.facebook.com/salon')).toBe(false);
    expect(isCompanyWebsite('https://www.tahititourisme.fr/listing/x')).toBe(
      false,
    );
    expect(isCompanyWebsite('https://www.atelier-coco.pf/contact')).toBe(true);
  });

  it('bloque les URLs privées pour le fetch', () => {
    expect(isPublicHttpUrl('https://atelier.pf/contact')).toBe(true);
    expect(isPublicHttpUrl('http://127.0.0.1/secret')).toBe(false);
    expect(isPublicHttpUrl('http://192.168.1.9/x')).toBe(false);
    expect(isPublicHttpUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('parseKeywordTopics / buildDiscoverQueries', () => {
  it('sépare les thématiques', () => {
    expect(parseKeywordTopics('plombier, électricien ; spa')).toEqual([
      'plombier',
      'électricien',
      'spa',
    ]);
  });

  it('génère plus de requêtes pour un batch 100', () => {
    const small = buildDiscoverQueries('spa', 'Tahiti', 10);
    const large = buildDiscoverQueries('spa', 'Tahiti', 100);
    expect(small.length).toBeGreaterThan(0);
    expect(large.length).toBeGreaterThan(small.length);
    expect(small.every((q) => q.includes('spa'))).toBe(true);
  });

  it('valide les tailles de lot', () => {
    expect(isDiscoverBatchSize(10)).toBe(true);
    expect(isDiscoverBatchSize(25)).toBe(false);
  });

  it('prépare les pages contact et les requêtes email', () => {
    const pages = contactPageUrls('https://www.salon.pf/accueil');
    expect(pages).toEqual(
      expect.arrayContaining([
        'https://www.salon.pf/',
        'https://www.salon.pf/contact',
        'https://www.salon.pf/mentions-legales',
      ]),
    );
    const hunts = buildEmailHuntQueries(
      'Salon Coco',
      'Tahiti',
      'https://www.salon.pf',
    );
    expect(hunts.some((q) => q.includes('site:salon.pf'))).toBe(true);
    expect(hunts.some((q) => q.includes('@mail.pf'))).toBe(true);
  });
});

describe('extractImportRecords', () => {
  const row = { nom: 'Aito-flow', emails: ['alexis@example.com'] };

  it('accepte un tableau racine', () => {
    expect(extractImportRecords([row])).toEqual([row]);
  });

  it.each(['records', 'data', 'prospects', 'prospect'] as const)(
    'accepte l’enveloppe {%s}',
    (key) => {
      expect(extractImportRecords({ [key]: [row] })).toEqual([row]);
    },
  );

  it('refuse un objet sans tableau reconnu', () => {
    expect(extractImportRecords({ items: [row] })).toBeNull();
    expect(extractImportRecords({ prospect: row })).toBeNull();
    expect(extractImportRecords(null)).toBeNull();
  });
});
