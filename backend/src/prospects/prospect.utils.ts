import type { ProspectProfile } from '../entities/prospect.entity';

const PLACEHOLDER_EMAILS = new Set([
  'johndoe@mail.com',
  'compteprotahiti@gmail.com',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const EMAIL_IN_TEXT_RE =
  /(?:mailto:)?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24})/gi;

const OBFUSCATED_EMAIL_RE =
  /([a-zA-Z0-9._%+\-]{1,64})\s*(?:\(|\[)?\s*(?:@|at|arobase)\s*(?:\)|\])?\s*([a-zA-Z0-9.\-]{1,253})\s*(?:\(|\[)?\s*(?:\.|dot|point)\s*(?:\)|\])?\s*([a-zA-Z]{2,24})/gi;

const BLOCKED_EMAIL_DOMAINS = new Set([
  'example.com',
  'example.org',
  'email.com',
  'domain.com',
  'sentry.io',
  'wixpress.com',
  'cloudflare.com',
  'github.com',
  'githubusercontent.com',
  'schema.org',
  'w3.org',
  'google.com',
  'gstatic.com',
  'facebook.com',
  'instagram.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'tripadvisor.com',
  'tripadvisor.fr',
  'pagesjaunes.fr',
  'tahititourisme.org',
  'tahititourisme.com',
  'tahititourisme.fr',
]);

const BLOCKED_LOCAL_PARTS = new Set([
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'privacy',
  'dpo',
  'abuse',
  'postmaster',
  'mailer-daemon',
  'webmaster',
]);

const ALLOWED_EMAIL_TLDS = new Set([
  'com',
  'net',
  'org',
  'edu',
  'gov',
  'pf',
  'fr',
  'nc',
  'wf',
  'nu',
  'io',
  'co',
  'uk',
  'us',
  'au',
  'nz',
  'de',
  'es',
  'it',
  'be',
  'ch',
  'ca',
  'nl',
  'pt',
  'eu',
  'info',
  'biz',
  'app',
  'dev',
  'cloud',
  'email',
  'hotel',
  'travel',
  'me',
  'tv',
  'cc',
  'fm',
  'ai',
  'online',
  'site',
  'shop',
]);

const DIRECTORY_HOST_RE =
  /(?:^|\.)(facebook|instagram|linkedin|youtube|twitter|x\.com|tiktok|google|gstatic|tripadvisor|yelp|wikipedia|booking|airbnb|pagesjaunes|mappy|apple|microsoft|wixsite|timeout|petitfute|happycow|tahititourisme)(\.|$)/i;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const e = normalizeEmail(email);
  if (!EMAIL_RE.test(e)) return false;
  if (PLACEHOLDER_EMAILS.has(e)) return false;
  if (e.startsWith('noreply@') || e.startsWith('no-reply@')) return false;
  return true;
}

export function isProspectEmail(email: string): boolean {
  if (!isValidEmail(email)) return false;
  const e = normalizeEmail(email);
  const [local, domain] = e.split('@');
  if (!domain) return false;
  const tld = domain.split('.').pop() || '';
  if (!ALLOWED_EMAIL_TLDS.has(tld)) return false;
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return false;
  for (const blocked of BLOCKED_EMAIL_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return false;
  }
  const localBase = local.split('+')[0];
  if (BLOCKED_LOCAL_PARTS.has(localBase)) return false;
  if (/\.(png|jpe?g|gif|webp|svg|css|js|woff2?)$/i.test(e)) return false;
  return true;
}

export function decodeCfEmail(hex: string): string | null {
  const h = hex.trim();
  if (!/^[0-9a-fA-F]{4,}$/.test(h) || h.length % 2 !== 0) return null;
  const key = parseInt(h.slice(0, 2), 16);
  if (Number.isNaN(key)) return null;
  let out = '';
  for (let i = 2; i < h.length; i += 2) {
    const code = parseInt(h.slice(i, i + 2), 16) ^ key;
    if (code < 32 || code > 126) return null;
    out += String.fromCharCode(code);
  }
  return out || null;
}

export function extractEmailsFromText(text: string): string[] {
  if (!text) return [];
  const decoded = text
    .replace(/&#x40;|&#64;|&commat;|%40/gi, '@')
    .replace(/［at］|\[at\]|\(at\)|\s+arobase\s+/gi, '@')
    .replace(/［dot］|\[dot\]|\(dot\)/gi, '.')
    .replace(/\uFF20/g, '@');
  const found = new Map<string, string>();

  const add = (raw: string) => {
    let cleaned = raw.replace(/[.,;:)+>]+$/g, '');
    try {
      cleaned = decodeURIComponent(cleaned);
    } catch {
      /* keep */
    }
    cleaned = cleaned.split('?')[0].split('#')[0];
    if (!isProspectEmail(cleaned)) return;
    const n = normalizeEmail(cleaned);
    found.set(n, n);
  };

  for (const match of decoded.matchAll(/data-cfemail=["']([0-9a-fA-F]+)["']/gi)) {
    const email = decodeCfEmail(match[1]);
    if (email) add(email);
  }
  for (const match of decoded.matchAll(/email-protection#([0-9a-fA-F]+)/gi)) {
    const email = decodeCfEmail(match[1]);
    if (email) add(email);
  }
  for (const match of decoded.matchAll(
    /["']email["']\s*:\s*["']([^"']+@[^"']+)["']/gi,
  )) {
    add(match[1]);
  }
  for (const match of decoded.matchAll(/"email"\s*:\s*\[([^\]]{0,800})\]/gi)) {
    for (const inner of match[1].matchAll(
      /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24})/g,
    )) {
      add(inner[1]);
    }
  }
  for (const match of decoded.matchAll(
    /data-(?:email|mail)=["']([^"']+)["']/gi,
  )) {
    add(match[1]);
  }
  for (const match of decoded.matchAll(
    /itemprop=["']email["'][^>]*content=["']([^"']+)["']/gi,
  )) {
    add(match[1]);
  }
  for (const match of decoded.matchAll(
    /content=["']([^"']+)["'][^>]*itemprop=["']email["']/gi,
  )) {
    add(match[1]);
  }
  for (const match of decoded.matchAll(
    /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24})/gi,
  )) {
    add(match[1]);
  }
  for (const match of decoded.matchAll(EMAIL_IN_TEXT_RE)) {
    add(match[1] || match[0]);
  }
  for (const match of decoded.matchAll(OBFUSCATED_EMAIL_RE)) {
    add(`${match[1]}@${match[2]}.${match[3]}`);
  }
  for (const match of decoded.matchAll(
    /['"]([a-zA-Z0-9._%+\-]{1,64})['"]\s*\+\s*['"]@['"]\s*\+\s*['"]([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,24})['"]/g,
  )) {
    add(`${match[1]}@${match[2]}`);
  }
  return [...found.values()];
}

export function isPublicHttpUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return false;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || a === 169) return false;
    if (a === 192 && b === 168) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
  }
  if (host === '::1' || host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd')) {
    return false;
  }
  return true;
}

const CONTACT_HREF_HINT =
  /contact|mentions|legal|about|a-propos|nous-contacter|privacy|cgv|impressum|equipe|r[eé]servation|booking|coordonn/i;

export function extractSameOriginContactUrls(
  html: string,
  pageUrl: string,
): string[] {
  if (!html) return [];
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const baseHost = base.hostname.replace(/^www\./i, '').toLowerCase();
  const out: string[] = [];
  for (const match of html.matchAll(/\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    const href = match[1].trim();
    if (!href || /^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    if (!CONTACT_HREF_HINT.test(href)) continue;
    try {
      const abs = new URL(href, base);
      if (!isPublicHttpUrl(abs.href) || !isCompanyWebsite(abs.href)) continue;
      const host = abs.hostname.replace(/^www\./i, '').toLowerCase();
      if (host !== baseHost) continue;
      const clean = abs.href.split('#')[0];
      if (!out.includes(clean)) out.push(clean);
    } catch {
      /* skip */
    }
    if (out.length >= 8) break;
  }
  return out;
}

export function isCompanyWebsite(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (DIRECTORY_HOST_RE.test(host) || DIRECTORY_HOST_RE.test(`${host}.`)) {
      return false;
    }
    if (
      /facebook|instagram|linkedin|youtube|twitter|tiktok|google|tripadvisor|yelp|wikipedia|booking|airbnb|pagesjaunes|tahititourisme|happycow|timeout|petitfute/i.test(
        host,
      )
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function normalizeCompanyName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'liste';
}

export const IMPORT_ENVELOPE_KEYS = [
  'records',
  'data',
  'prospects',
  'prospect',
] as const;

export const IMPORT_PAYLOAD_HINT =
  'JSON attendu : tableau [...] ou objet { prospects: [...] } (clés : records, data, prospects, prospect)';

/** Extraite le tableau d’enregistrements d’un payload d’import. */
export function extractImportRecords(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  const obj = payload as Record<string, unknown>;
  for (const key of IMPORT_ENVELOPE_KEYS) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

export type MappedImportRecord = {
  company: string;
  emails: string[];
  contactName: string | null;
  notes: string | null;
  profile: ProspectProfile | null;
};

function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (typeof v === 'number') return String(v);
  return null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => asString(x)).filter((x): x is string => !!x);
  }
  const s = asString(v);
  return s ? [s] : [];
}

function pickCompany(raw: Record<string, unknown>): string | null {
  return (
    asString(raw.nom) ||
    asString(raw.company) ||
    asString(raw.entreprise) ||
    asString(raw.name)
  );
}

function pickEmails(raw: Record<string, unknown>): string[] {
  const fromArrays = [
    ...asStringArray(raw.emails),
    ...asStringArray(raw.email),
    ...asStringArray(raw.mail),
  ];
  const decideur =
    raw.decideur && typeof raw.decideur === 'object'
      ? (raw.decideur as Record<string, unknown>)
      : null;
  if (decideur?.email) {
    fromArrays.push(...asStringArray(decideur.email));
  }
  const unique = new Map<string, string>();
  for (const e of fromArrays) {
    if (!isValidEmail(e)) continue;
    unique.set(normalizeEmail(e), normalizeEmail(e));
  }
  return [...unique.values()];
}

function pickContactName(raw: Record<string, unknown>): string | null {
  const direct =
    asString(raw.contactName) ||
    asString(raw.personne) ||
    asString(raw.contact);
  if (direct) return direct;
  const decideur =
    raw.decideur && typeof raw.decideur === 'object'
      ? (raw.decideur as Record<string, unknown>)
      : null;
  return decideur ? asString(decideur.nom) : null;
}

function pickNotes(raw: Record<string, unknown>): string | null {
  return (
    asString(raw.notes) ||
    asString(raw.besoins) ||
    asString(raw.besoin) ||
    asString(raw.description)
  );
}

function buildProfile(raw: Record<string, unknown>): ProspectProfile | null {
  const profile: ProspectProfile = {};
  const type = asString(raw.type);
  const commune = asString(raw.commune);
  const adresse = asString(raw.adresse);
  const numTahiti = asString(raw.num_tahiti);
  const cuisine = asString(raw.cuisine);
  const sourceUrl = asString(raw.source_url);
  const besoins = asString(raw.besoins) || asString(raw.besoin);
  const description = asString(raw.description);
  const telephones = asStringArray(raw.telephones);
  const sites = asStringArray(raw.sites_web);
  const facebook = asStringArray(raw.facebook);
  const sources = asStringArray(raw.sources);

  if (type) profile.type = type;
  if (commune) profile.commune = commune;
  if (adresse) profile.adresse = adresse;
  if (numTahiti) profile.num_tahiti = numTahiti;
  if (cuisine) profile.cuisine = cuisine;
  if (sourceUrl) profile.source_url = sourceUrl;
  if (besoins) profile.besoins = besoins;
  if (description) profile.description = description;
  if (telephones.length) profile.telephones = telephones;
  if (sites.length) profile.sites_web = sites;
  if (facebook.length) profile.facebook = facebook;
  if (sources.length) profile.sources = sources;

  if (
    raw.gps &&
    typeof raw.gps === 'object' &&
    raw.gps !== null &&
    ('lat' in raw.gps || 'lon' in raw.gps)
  ) {
    const gps = raw.gps as { lat?: number; lon?: number };
    profile.gps = { lat: gps.lat, lon: gps.lon };
  }

  if (typeof raw.score_completude === 'number') {
    profile.score_completude = raw.score_completude;
  }

  return Object.keys(profile).length ? profile : null;
}

export function mapImportRecord(
  raw: unknown,
): { ok: true; record: MappedImportRecord } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'Enregistrement invalide' };
  }
  const obj = raw as Record<string, unknown>;
  const company = pickCompany(obj);
  if (!company) {
    return { ok: false, reason: 'Nom d’entreprise manquant' };
  }
  const emails = pickEmails(obj);
  if (!emails.length) {
    return { ok: false, reason: 'Aucun email valide' };
  }
  return {
    ok: true,
    record: {
      company,
      emails,
      contactName: pickContactName(obj),
      notes: pickNotes(obj),
      profile: buildProfile(obj),
    },
  };
}

export function mergeProfiles(
  a: ProspectProfile | null | undefined,
  b: ProspectProfile | null | undefined,
): ProspectProfile | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  const out: ProspectProfile = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v == null || v === '') continue;
    const existing = out[k];
    if (Array.isArray(v)) {
      const prev = Array.isArray(existing) ? (existing as string[]) : [];
      out[k] = [...new Set([...prev, ...v.map(String)])];
    } else if (existing == null || existing === '') {
      out[k] = v;
    }
  }
  return out;
}

export function mergeEmailLists(a: string[], b: string[]): string[] {
  const map = new Map<string, string>();
  for (const e of [...a, ...b]) {
    if (!isValidEmail(e) && !EMAIL_RE.test(e)) continue;
    const n = normalizeEmail(e);
    if (!PLACEHOLDER_EMAILS.has(n) && !n.startsWith('noreply@')) {
      map.set(n, n);
    }
  }
  return [...map.values()];
}
