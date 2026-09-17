export type DemoPreparation = {
  prospectId: string
  company: string
  productId: string
  productName: string
  productUrl: string
  demoType: string
  recommendedAngle: string
  factsAllowed: string[]
  evidence: Array<{ source: string; fact: string }>
  branding: {
    name: string
    website: string | null
    activity: string | null
    location: string | null
  }
  sourceRecommendationGeneratedAt: string
  sourceReviewState: 'accepted' | 'overridden'
  artifactStatus: 'not-generated' | 'generated'
  artifactUrls: string[]
  artifactGeneratedAt?: string | null
  artifactVersion?: number
  preparedAt: string
}

export type DemoRecipeScreen = {
  id: string
  title: string
  purpose: string
  personalization: string[]
}

export type DemoRecipe = {
  productId: string
  productName: string
  demoType: string
  targetScreenCount: number
  screens: DemoRecipeScreen[]
}
