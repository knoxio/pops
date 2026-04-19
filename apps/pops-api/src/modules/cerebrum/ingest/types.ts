/**
 * Shared types for the cerebrum ingestion pipeline (PRD-081).
 */

import type { EngramSource } from '../engrams/schema.js';
import type { Engram } from '../engrams/types.js';

// ---------------------------------------------------------------------------
// Pipeline input
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Classification (US-04)
// ---------------------------------------------------------------------------

export interface ClassificationResult {
  type: string;
  confidence: number;
  template: string | null;
  suggestedTags: string[];
}

// ---------------------------------------------------------------------------
// Entity extraction (US-05)
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Scope inference (US-06)
// ---------------------------------------------------------------------------

export type ScopeSource = 'explicit' | 'rules' | 'llm' | 'fallback';

export interface ScopeInferenceResult {
  scopes: string[];
  source: ScopeSource;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Pipeline output
// ---------------------------------------------------------------------------

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
  scopeInference: ScopeInferenceResult;
}

export interface QuickCaptureResult {
  id: string;
  path: string;
  type: string;
  scopes: string[];
}
