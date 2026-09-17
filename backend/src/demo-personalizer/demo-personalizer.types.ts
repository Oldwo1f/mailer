import type { ProductCatalogEntry } from '../product-matcher/product-catalog';

export type DemoArtifactStatus = 'not-generated' | 'generated';

export type DemoBranding = {
  name: string;
  website: string | null;
  activity: string | null;
  location: string | null;
};

export type DemoFact = {
  source: string;
  fact: string;
};

export type DemoPreparation = {
  prospectId: string;
  company: string;
  productId: ProductCatalogEntry['id'];
  productName: string;
  productUrl: string;
  demoType: string;
  recommendedAngle: string;
  factsAllowed: string[];
  evidence: DemoFact[];
  branding: DemoBranding;
  sourceRecommendationGeneratedAt: string;
  sourceReviewState: 'accepted' | 'overridden';
  artifactStatus: DemoArtifactStatus;
  artifactUrls: string[];
  artifactGeneratedAt?: string | null;
  artifactVersion?: number;
  preparedAt: string;
};

export type DemoRecipeScreen = {
  id: string;
  title: string;
  purpose: string;
  personalization: string[];
};

export type DemoRecipe = {
  productId: ProductCatalogEntry['id'];
  productName: string;
  demoType: string;
  targetScreenCount: number;
  screens: DemoRecipeScreen[];
};
