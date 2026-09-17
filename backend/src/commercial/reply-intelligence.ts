import type { LeadStatus } from '../entities/prospect.entity';

export type ReplyIntent =
  | 'unsubscribe'
  | 'not_interested'
  | 'later'
  | 'price'
  | 'demo'
  | 'meeting'
  | 'interested'
  | 'question'
  | 'unknown';

export type ReplyAnalysis = {
  intent: ReplyIntent;
  confidence: number;
  suggestedStatus: LeadStatus;
  autoReplyAllowed: boolean;
  nextAction: string;
  reason: string;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export function classifyReply(input: {
  subject?: string | null;
  bodyText?: string | null;
}): ReplyAnalysis {
  const text = normalize(`${input.subject || ''}\n${input.bodyText || ''}`);

  if (
    hasAny(text, [
      'desinscri',
      'retirez moi',
      'retirer moi',
      'ne me contactez plus',
      'ne plus me contacter',
      'stop mail',
      'supprimez mon adresse',
    ])
  ) {
    return {
      intent: 'unsubscribe',
      confidence: 0.99,
      suggestedStatus: 'lost',
      autoReplyAllowed: false,
      nextAction: 'Désinscrire immédiatement et arrêter toute prospection.',
      reason: 'Demande explicite de ne plus être contacté.',
    };
  }

  if (
    hasAny(text, [
      'pas interesse',
      'pas d interesse',
      'non merci',
      'aucun interet',
      'ca ne nous interesse pas',
      'cela ne nous interesse pas',
      'nous ne sommes pas interesses',
      'je ne suis pas interesse',
    ])
  ) {
    return {
      intent: 'not_interested',
      confidence: 0.96,
      suggestedStatus: 'lost',
      autoReplyAllowed: false,
      nextAction: 'Classer perdu et ne plus relancer.',
      reason: 'Refus commercial explicite.',
    };
  }

  if (
    hasAny(text, [
      'plus tard',
      'recontactez',
      'recontacte',
      'revenez vers',
      'mois prochain',
      'annee prochaine',
      'pas maintenant',
      'pour le moment',
    ])
  ) {
    return {
      intent: 'later',
      confidence: 0.87,
      suggestedStatus: 'interested',
      autoReplyAllowed: true,
      nextAction: 'Accuser réception et conserver le prospect pour une relance différée.',
      reason: 'Intérêt possible mais échéance repoussée.',
    };
  }

  if (
    hasAny(text, [
      'combien',
      'quel prix',
      'le prix',
      'tarif',
      'cout',
      'budget',
      'abonnement',
      'par mois',
    ])
  ) {
    return {
      intent: 'price',
      confidence: 0.94,
      suggestedStatus: 'interested',
      autoReplyAllowed: true,
      nextAction: 'Répondre au prix avec l’offre correspondant au produit et au marché.',
      reason: 'Question tarifaire détectée.',
    };
  }

  if (
    hasAny(text, [
      'demo',
      'demonstration',
      'voir comment',
      'voir le logiciel',
      'voir l application',
      'essayer',
      'tester',
      'aperçu',
      'apercu',
    ])
  ) {
    return {
      intent: 'demo',
      confidence: 0.93,
      suggestedStatus: 'demo',
      autoReplyAllowed: true,
      nextAction: 'Débloquer la démo seulement si un artefact réel est déjà disponible ; sinon la préparer.',
      reason: 'Demande de démonstration ou d’essai.',
    };
  }

  if (
    hasAny(text, [
      'rendez vous',
      'rendez-vous',
      'rdv',
      'appelez moi',
      'appelez-moi',
      'appel telephonique',
      'on peut s appeler',
      'visio',
      'rencontrer',
    ])
  ) {
    return {
      intent: 'meeting',
      confidence: 0.92,
      suggestedStatus: 'meeting',
      autoReplyAllowed: false,
      nextAction: 'Organiser le rendez-vous ou l’appel.',
      reason: 'Demande explicite de contact synchrone.',
    };
  }

  if (
    hasAny(text, [
      'ca m interesse',
      'cela m interesse',
      'nous sommes interesses',
      'je suis interesse',
      'pourquoi pas',
      'oui ca peut',
      'oui cela peut',
      'bonne idee',
      'interessant',
    ])
  ) {
    return {
      intent: 'interested',
      confidence: 0.84,
      suggestedStatus: 'interested',
      autoReplyAllowed: true,
      nextAction: 'Répondre avec l’offre adaptée et une prochaine étape simple.',
      reason: 'Signal d’intérêt positif détecté.',
    };
  }

  if (text.includes('?') || hasAny(text, ['comment', 'est ce que', 'pouvez vous', 'peut on'])) {
    return {
      intent: 'question',
      confidence: 0.68,
      suggestedStatus: 'replied',
      autoReplyAllowed: false,
      nextAction: 'Question détectée mais réponse automatique non sûre : traiter comme cas à comprendre.',
      reason: 'Question sans intention assez précise.',
    };
  }

  return {
    intent: 'unknown',
    confidence: 0.4,
    suggestedStatus: 'replied',
    autoReplyAllowed: false,
    nextAction: 'Réponse reçue mais intention ambiguë.',
    reason: 'Aucun motif déterministe suffisamment fiable.',
  };
}
