export function extractEmail(value: string | undefined) {
  const raw = String(value || '').trim();
  const bracket = raw.match(/<([^>]+)>/);
  const candidate = (bracket?.[1] || raw).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export function freshReplyText(value: string) {
  const lines = String(value || '')
    .replace(/\r/g, '')
    .slice(0, 12_000)
    .split('\n');
  const fresh: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^>/.test(trimmed)) continue;
    if (/^on .+wrote:$/i.test(trimmed)) break;
    if (/^le .+a [ée]crit\s*:/i.test(trimmed)) break;
    if (/^-{2,}\s*message (d'origine|original)\s*-{2,}$/i.test(trimmed)) break;
    if (/^(from:|de\s*:\s)/i.test(trimmed) && fresh.length > 0) break;
    fresh.push(line);
  }
  return fresh.join('\n').trim().slice(0, 12_000);
}
