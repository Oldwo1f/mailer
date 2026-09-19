const WRAPPER_MARKER = 'mailer-email';

type EmailBrand = 'default' | 'kynexy';

type EmailLayoutOptions = {
  senderEmail?: string | null;
};

/**
 * Wraps LLM-generated inner HTML in a centered, email-safe layout.
 * Skips if the HTML already contains the mailer-email marker.
 */
export function wrapEmailHtml(
  innerHtml: string,
  options: EmailLayoutOptions = {},
): string {
  const trimmed = (innerHtml || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes(WRAPPER_MARKER)) return trimmed;

  const brand = resolveBrand(options.senderEmail);
  const withStyledLinks = styleBodyLinks(trimmed, brand);
  const withStyledLists = styleContent(withStyledLinks, brand);

  if (brand === 'kynexy') {
    return wrapKynexyEmail(withStyledLists);
  }

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
function styleBodyLinks(html: string, brand: EmailBrand): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
      .trim();
    const style =
      brand === 'kynexy'
        ? 'display:inline-block;margin:18px 0 8px;padding:13px 24px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;line-height:1.2;box-shadow:0 6px 18px rgba(37,99,235,0.24);'
        : 'display:inline-block;margin:16px 0 8px;padding:12px 24px;background-color:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;';
    return `<a ${cleaned} style="${style}">`.replace(/<a\s+>/, '<a>');
  });
}

/** Keep lists readable: left-aligned inside the centered card. */
function styleContent(html: string, brand: EmailBrand): string {
  const alignment = brand === 'kynexy' ? 'left' : 'center';
  return html
    .replace(/<ul\b([^>]*)>/gi, (_m, attrs: string) => {
      const cleaned = String(attrs)
        .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
        .trim();
      const style = `text-align:left;display:inline-block;margin:12px auto;padding:0 0 0 1.25em;max-width:${brand === 'kynexy' ? '480px' : '420px'};`;
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
      const style = `margin:0 0 16px;text-align:${alignment};`;
      return cleaned
        ? `<p ${cleaned} style="${style}">`
        : `<p style="${style}">`;
    });
}

function resolveBrand(senderEmail?: string | null): EmailBrand {
  const domain = String(senderEmail || '')
    .trim()
    .toLowerCase()
    .split('@')[1];
  return domain === 'kynexy.fr' ? 'kynexy' : 'default';
}

function wrapKynexyEmail(content: string): string {
  return `<table class="${WRAPPER_MARKER}" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#eef3fb;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:28px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:separate;width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,0.12);">
        <tr>
          <td style="padding:0;background-color:#081a33;border-bottom:4px solid #2563eb;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="padding:25px 30px;font-family:Arial,Helvetica,sans-serif;">
                  <div style="font-size:25px;line-height:1;font-weight:800;letter-spacing:3px;color:#ffffff;">KYNEXY</div>
                  <div style="margin-top:8px;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.8px;color:#8ec5ff;text-transform:uppercase;">Le centre de contrôle des entreprises de terrain</div>
                  <div style="margin-top:16px;"><span style="display:inline-block;padding:7px 10px;border:1px solid #315783;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.7px;color:#dbeafe;">MOBILE · SIMPLE · CENTRALISÉ</span></div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:34px 32px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#26364d;text-align:left;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 30px 22px;background-color:#f8fafc;border-top:1px solid #e6edf7;font-family:Arial,Helvetica,sans-serif;text-align:center;">
            <div style="font-size:12px;line-height:1.5;color:#64748b;">Kynexy · L’activité, l’équipe et les clients réunis au même endroit.</div>
            <div style="margin-top:5px;font-size:12px;line-height:1.5;color:#94a3b8;">contact@kynexy.fr · kynexy.fr</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
