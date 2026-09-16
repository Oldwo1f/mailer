export const CAMPAIGN_TONES = [
  { label: 'Professionnel', value: 'professionnel' },
  { label: 'Chaleureux', value: 'chaleureux' },
  { label: 'Direct / commercial', value: 'direct' },
  { label: 'Expert technique', value: 'expert' },
  { label: 'Tahitien', value: 'tahitien' },
] as const

export const CAMPAIGN_EMAIL_TYPES = [
  { label: 'Classique (paragraphes + CTA)', value: 'classique' },
  { label: 'Storytelling pain point', value: 'storytelling_pain' },
  { label: 'Storytelling Steve Jobs', value: 'storytelling_steve_jobs' },
  { label: 'Présentation en puces', value: 'bullets' },
  { label: 'Offre promotionnelle urgente', value: 'promo_urgente' },
  { label: 'Preuve sociale / cas client', value: 'preuve_sociale' },
  { label: 'Question + insight', value: 'question_insight' },
] as const

export function emailTypeLabel(value?: string | null): string {
  if (!value) return CAMPAIGN_EMAIL_TYPES[0].label
  return (
    CAMPAIGN_EMAIL_TYPES.find((t) => t.value === value)?.label ?? value
  )
}
