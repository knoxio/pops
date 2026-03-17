/** A parsed transaction from any bank source */
export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  account: string;
  type?: string;
  category?: string;
  location?: string;
  country?: string;
  online?: boolean;
}

/** Entity lookup entry: name -> entity ID */
export interface EntityLookup {
  [name: string]: string;
}

/** Result from the entity matching pipeline */
export interface EntityMatch {
  entityName: string;
  entityId: string;
  matchType: 'alias' | 'exact' | 'prefix' | 'contains' | 'ai';
}

/** AI categorization cache entry */
export interface AiCacheEntry {
  description: string;
  entityName: string;
  category: string;
  cachedAt: string;
}

/** Import run mode */
export type RunMode = 'dry-run' | 'execute';
