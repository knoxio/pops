/**
 * Deps + stage-runner extracted from `pipeline.ts` to keep that file under the
 * per-file line budget. Holds the injectable {@link IngestServiceDeps} shape,
 * the intermediate {@link PipelineStages} type, the shared normalise →
 * classify → extract → infer stage runner, and the curation-queue enqueue
 * helper. The orchestrating `IngestService` lives in `pipeline.ts`.
 */
import { type Queue } from 'bullmq';

import { type CerebrumDb } from '../../../db/index.js';
import { type CortexClassifier } from './classifier.js';
import { type CortexEntityExtractor } from './entity-extractor.js';
import { type IngestLlm } from './llm.js';
import { normaliseBody } from './normalizer.js';
import { dedupe } from './pipeline-helpers.js';
import { type ClassifyEngramJobData } from './queue.js';

import type { EngramSource } from '../engrams/schema.js';
import type { TemplateRegistry } from '../templates/registry.js';
import type {
  ClassificationResult,
  EntityExtractionResult,
  IngestInput,
  ScopeInferenceResult,
} from './types.js';

/** Accessor returning the curation queue, or `null` when Redis is unconfigured. */
export type CurationQueueAccessor = () => Queue<ClassifyEngramJobData> | null;

export interface IngestServiceDeps {
  db: CerebrumDb;
  engramRoot: string;
  templates: TemplateRegistry;
  llm: IngestLlm;
  /** Resolves the curation queue lazily; returns `null` without Redis. */
  curationQueue: CurationQueueAccessor;
}

export interface PipelineStages {
  body: string;
  type: string;
  classification: ClassificationResult | null;
  entities: EntityExtractionResult['entities'];
  referencedDates: string[];
  mergedTags: string[];
  scopeInference: ScopeInferenceResult;
  source: EngramSource;
}

export interface StageCollaborators {
  classifier: CortexClassifier;
  entityExtractor: CortexEntityExtractor;
  inferScopes(input: {
    body: string;
    type: string;
    tags: string[];
    source: string;
    explicitScopes?: string[];
    knownScopes?: string[];
  }): Promise<ScopeInferenceResult>;
}

/** Run normalise → classify → extract → infer and return the merged result. */
export async function runPipelineStages(
  input: IngestInput,
  collaborators: StageCollaborators
): Promise<PipelineStages> {
  const body = normaliseBody(input.body);
  const source: EngramSource = input.source ?? 'manual';
  const existingTags = input.tags ?? [];
  const referenceDate = new Date().toISOString().slice(0, 10);

  let classification: ClassificationResult | null = null;
  let type = input.type ?? '';
  if (!type) {
    classification = await collaborators.classifier.classify(body, input.title);
    type = classification.type;
  }

  const {
    entities,
    tags: entityTags,
    referencedDates,
  } = await collaborators.entityExtractor.extract(body, existingTags, referenceDate);
  const mergedTags = dedupe([
    ...existingTags,
    ...entityTags,
    ...(classification?.suggestedTags ?? []),
  ]);

  const scopeInference = await collaborators.inferScopes({
    body,
    type,
    tags: mergedTags,
    source,
    explicitScopes: input.scopes,
  });

  return {
    body,
    type,
    classification,
    entities,
    referencedDates,
    mergedTags,
    scopeInference,
    source,
  };
}

/**
 * Enqueue a `classifyEngram` curation job. Returns `false` (soft signal) when
 * the queue is unavailable (no Redis) or the enqueue throws — the engram has
 * already been written, so enrichment is best-effort.
 */
export async function enqueueClassify(
  queueAccessor: CurationQueueAccessor,
  engramId: string
): Promise<boolean> {
  const queue = queueAccessor();
  if (queue === null) {
    console.warn(
      `[IngestService] Curation queue unavailable (no Redis) — enrichment skipped for ${engramId}`
    );
    return false;
  }
  try {
    await queue.add('classifyEngram', { type: 'classifyEngram', engramId });
    return true;
  } catch (err) {
    console.warn(
      `[IngestService] Failed to enqueue classify job for ${engramId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}
