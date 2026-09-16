export type ToneDefinition = {
  value: string;
  label: string;
  voiceRules: string;
};

export const TONES: ToneDefinition[] = [
  {
    value: 'professionnel',
    label: 'Professionnel',
    voiceRules: `- Vouvoiement.
- Formulations courtoises et sobres, sans familiarité excessive.`,
  },
  {
    value: 'chaleureux',
    label: 'Chaleureux',
    voiceRules: `- Vouvoiement de préférence.
- Ton amical, humain, empathique ; phrases naturelles.`,
  },
  {
    value: 'direct',
    label: 'Direct / commercial',
    voiceRules: `- Vouvoiement.
- Aller droit au but, bénéfices clairs, CTA net.`,
  },
  {
    value: 'expert',
    label: 'Expert technique',
    voiceRules: `- Vouvoiement.
- Précis et crédible ; jargon uniquement s'il est utile et présent dans le brief.`,
  },
  {
    value: 'tahitien',
    label: 'Tahitien',
    voiceRules: `- Tutoiement obligatoire (tu / ton / ta / te).
- Français simple et chaleureux, ancré Polynésie.
- Intègre 1 à 3 mots tahitiens simples et naturels, bien placés (pas une leçon de langue), par exemple :
  Ia'orana (bonjour / salut), Mārūrū / Maruru (merci), Māuruuru (merci), nana (au revoir), mā'ohi (local).
- Ouverture typique possible avec « Ia'orana » ; remerciement possible avec « Maruru ».
- Ne surcharge pas : le message reste principalement en français.
- Pas de caricature, pas de jargon inventé, pas de phrases entièrement en tahitien.`,
  },
];

const DEFAULT_TONE = TONES[0];

export function resolveTone(value?: string | null): ToneDefinition {
  if (!value) return DEFAULT_TONE;
  return TONES.find((t) => t.value === value) ?? DEFAULT_TONE;
}
