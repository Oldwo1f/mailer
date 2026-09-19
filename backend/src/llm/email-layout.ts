const WRAPPER_MARKER = 'mailer-email';

type EmailBrand = 'default' | 'kynexy';

type EmailLayoutOptions = {
  senderEmail?: string | null;
  includeKynexyProspectingCard?: boolean;
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
    const kynexyContent = options.includeKynexyProspectingCard
      ? insertKynexyProspectingCard(withStyledLists)
      : withStyledLists;
    return wrapKynexyEmail(kynexyContent);
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

function insertKynexyProspectingCard(content: string): string {
  const card = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;width:100%;margin:24px 0 26px;background-color:#071522;border:1px solid #163a55;border-radius:18px;overflow:hidden;">
  <tr>
    <td style="padding:0;line-height:0;"><img src="https://mailing.aito-flow.com/kynexy-prospection-artisans.jpg" width="530" alt="Kynexy relie le terrain, le planning, les réservations et les devis" style="display:block;width:100%;max-width:530px;height:auto;border:0;outline:none;text-decoration:none;"></td>
  </tr>
  <tr>
    <td style="padding:24px 24px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;text-align:left;">
      <div style="font-size:20px;line-height:1.25;font-weight:700;letter-spacing:-0.35px;color:#ffffff;">Du terrain au devis signé.</div>
      <div style="margin-top:9px;font-size:14px;line-height:1.55;color:#b7c9d8;">Kynexy relie réservations, planning, chantiers et documents — pour vos interventions ponctuelles ou récurrentes, avec ou sans fournitures.</div>
    </td>
  </tr>
</table>`;

  const ctaParagraph = /<p\b[^>]*>[\s\S]*?<a\b[\s\S]*?<\/a>[\s\S]*?<\/p>/i;
  return ctaParagraph.test(content)
    ? content.replace(ctaParagraph, `${card}$&`)
    : `${content}${card}`;
}

/** Turn body <a> into button-style CTAs (unsubscribe links are added later and stay plain). */
function styleBodyLinks(html: string, brand: EmailBrand): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\sstyle\s*=\s*(["'])[\s\S]*?\1/gi, '')
      .trim();
    const style =
      brand === 'kynexy'
        ? 'display:inline-block;margin:18px 0 8px;padding:12px 22px;background-color:#0071e3;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:600;font-size:15px;line-height:1.2;'
        : 'display:inline-block;margin:16px 0 8px;padding:12px 24px;background-color:#0f766e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;font-size:15px;';
    return `<a ${cleaned} style="${style}">`.replace(/<a\s+>/, '<a>');
  });
}

/** Keep lists readable: left-aligned inside the centered card. */
function styleContent(html: string, brand: EmailBrand): string {
  const alignment = brand === 'kynexy' ? 'left' : 'center';
  const styled = html
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
  return brand === 'kynexy'
    ? styled.replace(
        /<strong\b([^>]*)>/gi,
        '<strong$1 style="font-weight:650;color:#1d1d1f;">',
      )
    : styled;
}

function resolveBrand(senderEmail?: string | null): EmailBrand {
  const domain = String(senderEmail || '')
    .trim()
    .toLowerCase()
    .split('@')[1];
  return domain === 'kynexy.fr' ? 'kynexy' : 'default';
}

function wrapKynexyEmail(content: string): string {
  return `<table class="${WRAPPER_MARKER}" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background-color:#f5f5f7;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:32px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:separate;width:100%;max-width:600px;background-color:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e8e8ed;">
        <tr>
          <td style="padding:0;background-color:#0b0b0f;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
              <tr>
                <td style="padding:30px 34px 29px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                    <tr>
                      <td valign="middle" style="padding-right:13px;"><img src="https://kynexy.fr/assets/kynexy-brand-logo-official.png" width="52" height="52" alt="Kynexy" style="display:block;width:52px;height:52px;border:0;border-radius:12px;outline:none;text-decoration:none;"></td>
                      <td valign="middle"><span style="font-size:22px;line-height:1;font-weight:700;letter-spacing:2.2px;color:#f5f5f7;">KYNEXY</span></td>
                    </tr>
                  </table>
                  <div style="margin-top:22px;font-size:24px;line-height:1.18;font-weight:650;letter-spacing:-0.5px;color:#ffffff;">Votre activité. Enfin réunie.</div>
                  <div style="margin-top:8px;font-size:14px;line-height:1.45;color:#a1a1a6;">Le centre de contrôle mobile conçu pour les entreprises de terrain.</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:38px 34px 30px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;letter-spacing:-0.1px;color:#424245;text-align:left;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:22px 34px 25px;background-color:#fbfbfd;border-top:1px solid #eeeeF2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,Helvetica,sans-serif;text-align:center;">
            <div style="font-size:12px;line-height:1.5;color:#6e6e73;">Kynexy · L’activité, l’équipe et les clients au même endroit.</div>
            <div style="margin-top:6px;font-size:12px;line-height:1.5;color:#86868b;">contact@kynexy.fr&nbsp;&nbsp;·&nbsp;&nbsp;kynexy.fr</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}
