export type UnsubscribePageModel =
  | { state: 'invalid' }
  | { state: 'already'; email: string; company: string | null }
  | { state: 'confirm'; token: string; email: string; company: string | null }
  | { state: 'success'; email: string; company: string | null };

export function renderUnsubscribePage(model: UnsubscribePageModel): string {
  const title =
    model.state === 'success' || model.state === 'already'
      ? 'Désinscription'
      : 'Se désinscrire';

  let body = '';
  if (model.state === 'invalid') {
    body = `
      <h1>Lien invalide</h1>
      <p class="lead">Ce lien de désinscription n’est plus valide ou a déjà expiré.</p>
      <p class="muted">Si vous continuez à recevoir des messages, contactez l’expéditeur directement.</p>`;
  } else if (model.state === 'already') {
    body = `
      <h1>Déjà désinscrit</h1>
      <p class="lead"><strong>${escapeHtml(model.email)}</strong> ne reçoit plus nos emails de prospection.</p>
      ${companyLine(model.company)}
      <p class="muted">Aucune action supplémentaire n’est nécessaire.</p>`;
  } else if (model.state === 'success') {
    body = `
      <div class="icon ok" aria-hidden="true">✓</div>
      <h1>C’est fait</h1>
      <p class="lead"><strong>${escapeHtml(model.email)}</strong> a été désinscrit.</p>
      ${companyLine(model.company)}
      <p class="muted">Vous ne recevrez plus d’emails de prospection de notre part.</p>`;
  } else {
    body = `
      <h1>Se désinscrire</h1>
      <p class="lead">Vous ne souhaitez plus recevoir nos emails à l’adresse&nbsp;:</p>
      <p class="email">${escapeHtml(model.email)}</p>
      ${companyLine(model.company)}
      <form method="post" action="/u/${encodeURIComponent(model.token)}">
        <button type="submit">Me désinscrire</button>
      </form>
      <p class="muted">Un seul clic — aucune autre étape.</p>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="robots" content="noindex, nofollow"/>
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(160deg, #f0fdfa 0%, #f8fafc 45%, #eef2ff 100%);
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
    }
    .card {
      width: min(440px, 100%);
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 28px 24px 24px;
      box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
    }
    h1 { margin: 0 0 12px; font-size: 1.45rem; line-height: 1.25; }
    .lead { margin: 0 0 12px; font-size: 1rem; line-height: 1.5; color: #334155; }
    .email {
      margin: 0 0 16px;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.92rem;
      word-break: break-all;
    }
    .company { margin: 0 0 16px; color: #64748b; font-size: 0.92rem; }
    .muted { margin: 16px 0 0; color: #64748b; font-size: 0.88rem; line-height: 1.45; }
    form { margin: 8px 0 0; }
    button {
      width: 100%;
      border: 0;
      border-radius: 10px;
      padding: 14px 18px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      background: #0f766e;
      color: #fff;
      transition: background 0.15s ease;
    }
    button:hover { background: #0d9488; }
    button:focus-visible { outline: 2px solid #14b8a6; outline-offset: 2px; }
    .icon {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.6rem;
      font-weight: 700;
      margin-bottom: 12px;
    }
    .icon.ok { background: #d1fae5; color: #047857; }
  </style>
</head>
<body>
  <main class="card">${body}</main>
</body>
</html>`;
}

function companyLine(company: string | null) {
  if (!company) return '';
  return `<p class="company">Prospect : <strong>${escapeHtml(company)}</strong></p>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
