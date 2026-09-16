const WRAPPER_MARKER = 'mailer-email';

/**
 * Wraps LLM-generated inner HTML in a centered, email-safe layout.
 * Skips if the HTML already contains the mailer-email marker.
 */
export function wrapEmailHtml(innerHtml: string): string {
  const trimmed = (innerHtml || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(WRAPPER_MARKER)) return trimmed;

  const withStyledLinks = styleBodyLinks(trimmed);
  const withStyledLists = styleLists(withStyledLinks);

  return `<table class="${WRAPPER_MARKER}" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f3f4f6;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="border-collapse:collapse;width:100%;max-width:560px;background-color:#ffffff;border-radius:8px;">
        <tr>
          <td align="center" style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;text-align:center;">
            ${withStyledLists}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

/** Turn body <a> into button-style CTAs (unsubscribe links are added later and stay plain). */
function styleBodyLinks(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
      .trim();
    const style =
      'display:inline-block;margin:16px 0 8px;padding:12px 24px;background-color:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;';
    return `<a ${cleaned} style="${style}">`.replace(/<a\s+>/, '<a>');
  });
}

/** Keep lists readable: left-aligned inside the centered card. */
function styleLists(html: string): string {
  return html
    .replace(/<ul\b([^>]*)>/gi, (_m, attrs: string) => {
      const cleaned = String(attrs)
        .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
        .trim();
      const style =
        'text-align:left;display:inline-block;margin:12px auto;padding:0 0 0 1.25em;max-width:420px;';
      return cleaned
        ? `<ul ${cleaned} style="${style}">`
        : `<ul style="${style}">`;
    })
    .replace(/<li\b([^>]*)>/gi, (_m, attrs: string) => {
      const cleaned = String(attrs)
        .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
        .trim();
      const style = 'margin:0 0 8px;text-align:left;';
      return cleaned
        ? `<li ${cleaned} style="${style}">`
        : `<li style="${style}">`;
    })
    .replace(/<p\b([^>]*)>/gi, (_m, attrs: string) => {
      const cleaned = String(attrs)
        .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
        .trim();
      const style = 'margin:0 0 14px;text-align:center;';
      return cleaned
        ? `<p ${cleaned} style="${style}">`
        : `<p style="${style}">`;
    });
}
