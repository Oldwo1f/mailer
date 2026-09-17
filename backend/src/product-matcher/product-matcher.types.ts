import type { ProductCatalogEntry } from './product-catalog';

export type ProductConfidence = 'high' | 'medium' | 'low';
export type ProductReviewState =
  | 'unreviewed'
  | 'accepted'
  | 'overridden'
  | 'rejected';

export type ProductEvidence = {
  source: string;
  fact: string;
};

export type ProductRecommendation = {
  productId: ProductCatalogEntry['id'];
  suggestedProductId: ProductCatalogEntry['id'];
  productName: string;
  score: number;
  confidence: ProductConfidence;
  reasons: string[];
  evidence: ProductEvidence[];
  painPoints: string[];
  recommendedAngle: string;
  demoType: string;
  productUrl: string;
  reviewState: ProductReviewState;
  reviewNote?: string | null;
  matchedBy: 'rules' | 'rules+llm';
  generatedAt: string;
};

export type ProductMatchCandidate = {
  productId: ProductCatalogEntry['id'];
  score: number;
  activityHits: string[];
  positiveHits: string[];
  negativeHits: string[];
};
