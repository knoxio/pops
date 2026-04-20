/**
 * IngestService — main ingestion pipeline orchestrator (PRD-081).
 *
 * Stages (full submit):
 *   1. Normalise body
 *   2. Classify content type (when not provided)
 *   3. Extract entities → merge into tags
 *   4. Infer scopes (when not provided)
 *   5. Deduplication check by body hash
 *   6. Write engram via EngramService
 *
 * Quick capture bypasses classification and entity extraction; a BullMQ
 * job is enqueued to enrich the engram asynchronously (US-03).
 */
import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';

import { engramIndex } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { getCurationQueue } from '../../../jobs/queues.js';
import { logger } from '../../../lib/logger.js';
import { getEngramService, getScopeRuleEngine } from '../instance.js';
import { CortexClassifier } from './classifier.js';
import { CortexEntityExtractor } from './entity-extractor.js';
import { normaliseBody } from './normalizer.js';
import { createScopeInferenceService } from './scope-inference.js';

import type { EngramSource } from '../engrams/schema.js';
import type {
  ClassificationResult,
  EntityExtractionResult,
  IngestInput,
  IngestResult,
  PreviewResult,
  QuickCaptureResult,
  ScopeInferenceResult,
} from './types.js';

const QUICK_CAPTURE_TYPE = 'capture';
const QUICK_CAPTURE_SOURCE: EngramSource = 'cli';

export class IngestService {
  private readonly classifier: CortexClassifier;
  private readonly entityExtractor: CortexEntityExtractor;

  constructor() {
    this.classifier = new CortexClassifier();
    this.entityExtractor = new CortexEntityExtractor();
  }

  private async runPipelineStages(input: IngestInput): Promise<{
    body: string;
    type: string;
    classification: ClassificationResult | null;
    entities: EntityExtractionResult['entities'];
    mergedTags: string[];
    scopeInference: ScopeInferenceResult;
    source: EngramSource;
  }> {
    const body = normaliseBody(input.body);
    const source: EngramSource = input.source ?? 'manual';
    const existingTags = input.tags ?? [];

    let classification: ClassificationResult | null = null;
    let type = input.type ?? '';
    if (!type) {
      classification = await this.classifier.classify(body, input.title);
      type = classification.type;
    }

    const { entities, tags: entityTags } = await this.entityExtractor.extract(body, existingTags);
    const mergedTags = dedupe([
      ...existingTags,
      ...entityTags,
      ...(classification?.suggestedTags ?? []),
    ]);

    const scopeInference = await this.inferScopes({
      body,
      type,
      tags: mergedTags,
      source,
      explicitScopes: input.scopes,
    });

    return { body, type, classification, entities, mergedTags, scopeInference, source };
  }

  /** Run the full ingestion pipeline and write an engram. */
  async submit(input: IngestInput): Promise<IngestResult> {
    const stages = await this.runPipelineStages(input);
    const { body, type, classification, entities, mergedTags, scopeInference, source } = stages;

    const duplicate = findDuplicate(hashContent(body));
    if (duplicate) {
      logger.warn(
        { duplicateId: duplicate },
        '[IngestService] Duplicate content detected — skipping write'
      );
      const { engram: existing } = getEngramService().read(duplicate);
      return { engram: existing, classification, entities, scopeInference };
    }

    const engram = getEngramService().create({
      type,
      title: input.title ?? deriveTitle(body),
      body,
      scopes: scopeInference.scopes,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      template: input.template ?? classification?.template ?? undefined,
      source,
      customFields: input.customFields,
    });

    return { engram, classification, entities, scopeInference };
  }

  /** Preview what the pipeline would produce without writing. */
  async preview(input: IngestInput): Promise<PreviewResult> {
    const stages = await this.runPipelineStages(input);
    return {
      normalisedBody: stages.body,
      classification: stages.classification,
      entities: stages.entities,
      scopeInference: stages.scopeInference,
    };
  }

  /**
   * Quick capture — minimal friction path (US-03).
   * Stores raw content immediately as type=capture, then enqueues an async
   * BullMQ job to classify, extract entities, and update scopes.
   */
  async quickCapture(
    text: string,
    source: EngramSource = QUICK_CAPTURE_SOURCE
  ): Promise<QuickCaptureResult> {
    const body = normaliseBody(text);

    const scopeRuleEngine = getScopeRuleEngine();
    const fallbackScopes = scopeRuleEngine.inferScopes({
      source,
      type: QUICK_CAPTURE_TYPE,
      tags: [],
      explicitScopes: [],
    });

    const engramService = getEngramService();
    const engram = engramService.create({
      type: QUICK_CAPTURE_TYPE,
      title: deriveTitle(body),
      body,
      scopes: fallbackScopes,
      source,
    });

    // Enqueue async enrichment job (fire-and-forget)
    try {
      const queue = getCurationQueue();
      await queue.add('classifyEngram', {
        type: 'classifyEngram',
        engramId: engram.id,
      });
    } catch (err) {
      logger.warn(
        { engramId: engram.id, error: err instanceof Error ? err.message : String(err) },
        '[IngestService] Failed to enqueue classify job — capture stored but enrichment skipped'
      );
    }

    return {
      id: engram.id,
      path: engram.filePath,
      type: engram.type,
      scopes: engram.scopes,
    };
  }

  /** Classify body only — used by cerebrum.ingest.classify endpoint. */
  async classify(body: string, title?: string): Promise<ClassificationResult> {
    const normBody = normaliseBody(body);
    return this.classifier.classify(normBody, title);
  }

  /** Extract entities only — used by cerebrum.ingest.extractEntities endpoint. */
  async extractEntities(
    body: string,
    existingTags: string[] = []
  ): Promise<EntityExtractionResult> {
    const normBody = normaliseBody(body);
    return this.entityExtractor.extract(normBody, existingTags);
  }

  /** Infer scopes only — used by cerebrum.ingest.inferScopes endpoint. */
  async inferScopes(input: {
    body: string;
    type: string;
    tags: string[];
    source: string;
    explicitScopes?: string[];
    knownScopes?: string[];
  }): Promise<ScopeInferenceResult> {
    const config = getScopeRuleEngine().getConfig();
    const svc = createScopeInferenceService(config);
    return svc.infer(input);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashContent(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function findDuplicate(bodyHash: string): string | null {
  try {
    const db = getDrizzle();
    const row = db
      .select({ id: engramIndex.id })
      .from(engramIndex)
      .where(and(eq(engramIndex.bodyHash, bodyHash), eq(engramIndex.status, 'active')))
      .get();
    return row?.id ?? null;
  } catch {
    return null;
  }
}

function deriveTitle(body: string): string {
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed.replace(/^#+\s*/, '').slice(0, 120);
    }
  }
  return 'Untitled';
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
