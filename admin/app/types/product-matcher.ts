export type ProductConfidence = 'high' | 'medium' | 'low'
export type ProductReviewState = 'unreviewed' | 'accepted' | 'overridden' | 'rejected'

export type ProductCatalogItem = {
  id: string
  name: string
  demoTemplate: string
  productUrl: string
}

export type ProductRecommendation = {
  productId: string
  suggestedProductId: string
  productName: string
  score: number
  confidence: ProductConfidence
  reasons: string[]
  evidence: Array<{ source: string; fact: string }>
  painPoints: string[]
  recommendedAngle: string
  demoType: string
  productUrl: string
  reviewState: ProductReviewState
  reviewNote?: string | null
  matchedBy: 'rules' | 'rules+llm'
  generatedAt: string
}
