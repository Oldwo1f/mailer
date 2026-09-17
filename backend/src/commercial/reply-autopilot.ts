import type { ReplyAnalysis } from './reply-intelligence';

export type AutoReplyContext = {
  analysis: ReplyAnalysis;
  contactName?: string | null;
  productName: string;
  priceLabel?: string | null;
  productUrl?: string | null;
  demoUrls?: string[] | null;
  originalSubject?: string | null;
};

export type AutoReplyMessage = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function subjectFor(original: string | null | undefined) {
  const clean = String(original || 'Votre demande').trim();
  return /^re\s*:/i.test(clean) ? clean : `Re: ${clean}`;
}

function greeting(contactName?: string | null) {
  return contactName?.trim() ? `Bonjour ${contactName.trim()},` : 'Bonjour,';
}

function toHtml(text: string) {
  return text
    .split('\n\n')
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function buildAutoReplyMessage(
  context: AutoReplyContext,
): AutoReplyMessage | null {
  const { analysis, productName } = context;
  if (!analysis.autoReplyAllowed || analysis.confidence < 0.82) return null;
  if (!productName || productName === 'Atelys sur-mesure') return null;

  const hello = greeting(context.contactName);
  const price = context.priceLabel?.trim() || '';
  const productUrl = context.productUrl?.trim() || '';
  const demoUrl = context.demoUrls?.find((url) => /^https?:\/\//i.test(url || '')) || '';
  let text: string | null = null;

  if (analysis.intent === 'price') {
    if (!price) return null;
    text = `${hello}\n\nMerci pour votre retour. ${productName} est proposé à ${price}.`;
    if (productUrl) text += `\n\nVous pouvez voir la présentation ici : ${productUrl}`;
    text += '\n\nSi vous me dites simplement comment vous gérez cela aujourd’hui, je peux vous indiquer directement si le produit correspond à votre fonctionnement.';
  } else if (analysis.intent === 'interested') {
    text = `${hello}\n\nMerci pour votre retour. Oui, ${productName} semble correspondre au besoin que nous avions identifié.`;
    if (price) text += ` L’offre actuelle est à ${price}.`;
    if (productUrl) text += `\n\nPrésentation : ${productUrl}`;
    text += '\n\nVous pouvez simplement me répondre avec votre fonctionnement actuel ou la principale difficulté à résoudre, et je vous répondrai sur ce point.';
  } else if (analysis.intent === 'later') {
    text = `${hello}\n\nBien reçu, merci pour votre retour. Aucun souci, je ne vais pas vous pousser maintenant. Nous gardons simplement ${productName} de côté pour le moment où ce sera plus pertinent pour vous.\n\nBonne continuation d’ici là.`;
  } else if (analysis.intent === 'demo') {
    if (!demoUrl) return null;
    text = `${hello}\n\nAvec plaisir. Une démonstration de ${productName} est prête ici : ${demoUrl}\n\nRegardez-la à votre rythme et répondez simplement à ce mail si vous voulez que nous l’adaptions à votre fonctionnement.`;
  }

  if (!text) return null;
  return {
    subject: subjectFor(context.originalSubject),
    text,
    html: toHtml(text),
  };
}
