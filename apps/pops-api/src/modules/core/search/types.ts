export interface Query {
  text: string;
  filters?: StructuredFilter[];
}

export interface StructuredFilter {
  key: string;
  value: string;
}

export interface SearchContext {
  app: string | null;
  page: string | null;
  entity?: {
    uri: string;
    type: string;
    title: string;
  };
  filters?: Record<string, string>;
}

export interface SearchHit<T = unknown> {
  uri: string;
  score: number;
  matchField: string;
  matchType: "exact" | "prefix" | "contains";
  data: T;
}

export interface SearchAdapter<T = unknown> {
  domain: string;
  icon: string;
  color: string;
  search(
    query: Query,
    context: SearchContext,
    options?: { limit?: number }
  ): SearchHit<T>[] | Promise<SearchHit<T>[]>;
}
