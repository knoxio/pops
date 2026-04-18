export interface SearchResult {
  sourceType: string;
  sourceId: string;
  chunkIndex: number;
  contentPreview: string;
  score: number;
  distance: number;
}

export interface SearchOptions {
  /** Filter to specific source types (e.g. ['transactions', 'notes']). */
  sourceTypes?: string[];
  /** Maximum number of results to return. Default: 10 */
  limit?: number;
  /** Maximum distance — results beyond this threshold are excluded. Default: 1.0 */
  threshold?: number;
}

export interface EmbeddingStatus {
  total: number;
  /** Records with no embedding yet. */
  pending: number;
  /** Records whose content_hash has changed since last embedding. */
  stale: number;
}
