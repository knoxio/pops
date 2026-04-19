export interface RetrievalResult {
  sourceType: string;
  sourceId: string;
  title: string;
  contentPreview: string;
  score: number;
  distance?: number;
  matchType: 'semantic' | 'structured' | 'both';
  metadata: Record<string, unknown>;
}

export interface SourceAttribution {
  sourceType: string;
  sourceId: string;
  title: string;
  relevanceScore: number;
  chunkRange?: [number, number];
}

export interface RetrievalFilters {
  types?: string[];
  scopes?: string[];
  tags?: string[];
  dateRange?: { from?: string; to?: string };
  status?: string[];
  sourceTypes?: string[];
  customFields?: Record<string, unknown>;
  includeSecret?: boolean;
}
