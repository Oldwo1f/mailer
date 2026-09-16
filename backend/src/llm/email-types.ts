export type EmailTypeDefinition = {
  value: string;
  label: string;
  structureRules: string;
};

export const EMAIL_TYPES: EmailTypeDefinition[] = [
  {
    value: 'classique',
    label: 'Classique (paragraphes + CTA)',
    structureRules: `- Structure classique : 2 à 4 courts paragraphes, puis un seul CTA.
- Objet clair et professionnel, sans sensationnalisme.`,
  },
  {
    value: 'storytelling_pain',
    label: 'Storytelling pain point',
    structureRules: `- Structure storytelling : situation concrète → friction / pain point → bascule vers la solution → 1 CTA.
- Récit bref (pas de roman) : chaque étape = 1 paragraphe court.
- Objet qui évoque le problème ou le bénéfice, sans clickbait.`,
  },
  {
    value: 'storytelling_steve_jobs',
    label: 'Storytelling Steve Jobs',
    structureRules: `- Structure keynote : UNE seule grande idée → contraste « le monde d'avant / ce qui devient possible » → bénéfice incarné (démo mentale) → 1 CTA simple et assuré.
- Phrases très courtes, rythme oral ; pas de jargon, pas de liste de features.
- Ton inspirant et clair, jamais commercial agressif ni clickbait.
- N'invente aucun chiffre, client ou preuve absents du brief.`,
  },
  {
    value: 'bullets',
    label: 'Présentation en puces',
    structureRules: `- Structure : 1 courte intro, puis une liste <ul> de 3 à 5 <li> (un bénéfice clair par puce), puis 1 CTA.
- Les puces restent très courtes (une ligne).
- Objet orienté bénéfices / clarté.`,
  },
  {
    value: 'promo_urgente',
    label: 'Offre promotionnelle urgente',
    structureRules: `- Structure promo : offre mise en avant → conditions / deadline / rareté UNIQUEMENT si présentes dans le brief → 1 CTA fort.
- Si aucune deadline/rareté n'est dans le brief, n'en invente pas ; reste convaincant sans fausse urgence.
- Objet direct, orienté offre.`,
  },
  {
    value: 'preuve_sociale',
    label: 'Preuve sociale / cas client',
    structureRules: `- Structure : accroche → preuve sociale ou cas analogue (chiffres / résultats UNIQUEMENT s'ils sont dans le brief ou le profil) → lien avec le prospect → 1 CTA.
- Pas d'invention de clients, logos ou métriques.
- Objet qui évoque un résultat ou une preuve crédible.`,
  },
  {
    value: 'question_insight',
    label: 'Question + insight',
    structureRules: `- Structure : ouverture par une question pertinente → 1 insight utile → proposition courte → 1 CTA.
- Une seule question d'ouverture, pas un interrogatoire.
- Objet interrogatif ou insight-driven.`,
  },
];

const DEFAULT_TYPE = EMAIL_TYPES[0];

export function resolveEmailType(value?: string | null): EmailTypeDefinition {
  if (!value) return DEFAULT_TYPE;
  return EMAIL_TYPES.find((t) => t.value === value) ?? DEFAULT_TYPE;
}
