import {
  discoverLimits,
  type DiscoverBatchSize,
} from './discover.types';

export function parseKeywordTopics(keywords: string): string[] {
  return keywords
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

export function buildDiscoverQueries(
  keywords: string,
  location: string,
  batchSize: DiscoverBatchSize,
): string[] {
  const loc = location.trim() || 'Polynésie française';
  const topics = parseKeywordTopics(keywords);
  const seed = topics.length ? topics : [keywords.trim()].filter(Boolean);
  if (!seed.length) return [];

  const queries: string[] = [];
  const push = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t) queries.push(t);
  };

  for (const k of seed) {
    push(`${k} ${loc} email contact`);
    push(`${k} ${loc} site officiel contact`);
    push(`${k} ${loc} "contact@" OR "info@" OR mailto`);
    push(`${k} Tahiti email`);
    push(`${k} ${loc} tahitibusinessguide`);
    push(`"${k}" ${loc} contact email`);
    push(`${k} ${loc} "nous contacter" @mail.pf`);
  }

  if (batchSize >= 50) {
    const communes = [
      'Papeete',
      'Punaauia',
      "Faa'a",
      'Moorea',
      'Mahina',
      'Pirae',
    ];
    for (const k of seed) {
      for (const commune of communes) {
        push(`${k} ${commune} email contact`);
      }
      push(`${k} ${loc} @mail.pf`);
      push(`${k} ${loc} pagesjaunes contact`);
    }
  }

  if (batchSize >= 100) {
    for (const k of seed) {
      push(`${k} Bora Bora Raiatea Huahine email`);
      push(`${k} Polynésie française annuaire email`);
      push(`${k} ${loc} "nous contacter"`);
      push(`${k} ${loc} facebook contact email`);
    }
  }

  const unique = [...new Set(queries)];
  return unique.slice(0, discoverLimits(batchSize).searches);
}

export function contactPageUrls(website: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(website);
  } catch {
    return [];
  }
  const origin = parsed.origin;
  const paths = [
    '/contact',
    '/nous-contacter',
    '/contactez-nous',
    '/mentions-legales',
    '/contact.html',
    '/contact.php',
    '/contacts',
    '/mentions_legales',
    '/mentions-legales.html',
    '/a-propos',
    '/about',
    '/en/contact',
    '/fr/contact',
    '/fr/contactez-nous',
  ];
  const out: string[] = [];
  const push = (u: string) => {
    if (u && !out.includes(u)) out.push(u);
  };
  push(`${origin}/`);
  if (parsed.pathname && parsed.pathname !== '/') {
    push(`${origin}${parsed.pathname}`);
  }
  for (const p of paths) push(`${origin}${p}`);
  return out;
}

export function buildEmailHuntQueries(
  company: string,
  location: string,
  website: string | null,
): string[] {
  const loc = location.trim() || 'Polynésie française';
  const queries = [
    `"${company}" ${loc} (email OR mailto OR "nous contacter")`,
    `"${company}" ("contact@" OR "info@" OR "reservation@" OR "@mail.pf" OR "@gmail.com")`,
    `"${company}" ${loc} ("mentions légales" OR coordonnées OR mailto)`,
  ];
  if (website) {
    try {
      const host = new URL(website).hostname.replace(/^www\./, '');
      if (host) {
        queries.push(
          `site:${host} (contact OR email OR mailto OR "mentions légales")`,
        );
      }
    } catch {
      /* ignore */
    }
  }
  return queries;
}
