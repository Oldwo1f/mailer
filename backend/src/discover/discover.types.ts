export const DISCOVER_BATCH_SIZES = [10, 50, 100] as const;
export type DiscoverBatchSize = (typeof DISCOVER_BATCH_SIZES)[number];

export type DiscoverJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export type DiscoverLogEntry = {
  at: string;
  text: string;
};

export type DiscoverFoundProspect = {
  id: string;
  company: string;
  emails: string[];
  created: boolean;
};

export type DiscoverJobResults = {
  prospects: DiscoverFoundProspect[];
};

export type DiscoverCandidate = {
  company: string;
  emails: string[];
  website: string | null;
  contactName: string | null;
  commune: string | null;
  type: string | null;
  notes: string | null;
  sourceUrl: string | null;
};

export type DiscoverLimits = {
  searches: number;
  scrapes: number;
  candidates: number;
  llm: number;
};

export function isDiscoverBatchSize(n: number): n is DiscoverBatchSize {
  return (DISCOVER_BATCH_SIZES as readonly number[]).includes(n);
}

export function discoverLimits(batchSize: DiscoverBatchSize): DiscoverLimits {
  if (batchSize === 10) {
    return { searches: 18, scrapes: 48, candidates: 48, llm: 16 };
  }
  if (batchSize === 50) {
    return { searches: 42, scrapes: 140, candidates: 180, llm: 42 };
  }
  return { searches: 64, scrapes: 260, candidates: 300, llm: 64 };
}
