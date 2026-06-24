/** Shared types for the cerebrum ingestion pipeline (ingestion-pipeline). */
import type { EngramSource } from '../engrams/schema.js';
import type { Engram } from '../engrams/types.js';

export interface IngestInput {
  body: string;
  title?: string;
  /** Content type. When omitted the classifier infers it. */
  type?: string;
  /** Explicit scopes. When omitted scope inference runs. */
  scopes?: string[];
  tags?: string[];
  template?: string;
  source?: EngramSource;
  customFields?: Record<string, unknown>;
}

export interface ClassificationResult {
  type: string;
  confidence: number;
  template: string | null;
  suggestedTags: string[];
}

export type EntityType = 'person' | 'project' | 'date' | 'topic' | 'organisation';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  /** Normalised form: ISO 8601 for dates, lowercase for topics. */
  normalised: string;
  confidence: number;
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  /** Entity values that pass the confidence threshold, prefixed by type. */
  tags: string[];
  /** ISO 8601 date strings extracted from date entities, for `referenced_dates`. */
  referencedDates: string[];
}

export type ScopeSource = 'explicit' | 'rules' | 'llm' | 'fallback';

export interface ScopeInferenceResult {
  scopes: string[];
  source: ScopeSource;
  confidence: number;
}

export interface IngestResult {
  engram: Engram;
  classification: ClassificationResult | null;
  entities: ExtractedEntity[];
  scopeInference: ScopeInferenceResult;
}

export interface PreviewResult {
  normalisedBody: string;
  classification: ClassificationResult | null;
  entities: ExtractedEntity[];
  referencedDates: string[];
  scopeInference: ScopeInferenceResult;
}

export interface QuickCaptureResult {
  id: string;
  path: string;
  type: string;
  scopes: string[];
  /** False when the async enrichment job could not be enqueued (no Redis). */
  requeued: boolean;
}
