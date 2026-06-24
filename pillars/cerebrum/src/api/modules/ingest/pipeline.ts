/**
 * IngestService — ingestion pipeline orchestrator (ingestion-pipeline).
 *
 * All collaborators are injected via {@link IngestServiceDeps} (DB handle,
 * engram root, template registry, scope-rule engine, LLM port, curation-queue
 * accessor) so the service stands alone and tests can run offline against a
 * temp DB + fake LLM + no Redis.
 *
 * Stages (full submit): normalise → classify (when type omitted) → extract
 * entities → infer scopes → dedup by body hash → write via EngramService. The
 * shared stage runner + enqueue helper live in `pipeline-stages.ts`. Quick
 * capture bypasses classification/extraction and enqueues a `classifyEngram`
 * job.
 */
import { ScopeRuleEngine } from '../engrams/scope-rules.js';
import { EngramService } from '../engrams/service.js';
import { CortexClassifier } from './classifier.js';
import { CortexEntityExtractor } from './entity-extractor.js';
import { normaliseBody } from './normalizer.js';
import {
  deriveTitle,
  findDuplicate,
  hashContent,
  mergeReferencedDates,
} from './pipeline-helpers.js';
import { enqueueClassify, runPipelineStages, type IngestServiceDeps } from './pipeline-stages.js';
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

export type { CurationQueueAccessor, IngestServiceDeps } from './pipeline-stages.js';

const QUICK_CAPTURE_TYPE = 'capture';
const QUICK_CAPTURE_SOURCE: EngramSource = 'cli';

export class IngestService {
  private readonly deps: IngestServiceDeps;
  private readonly classifier: CortexClassifier;
  private readonly entityExtractor: CortexEntityExtractor;
  private readonly scopeRuleEngine: ScopeRuleEngine;

  constructor(deps: IngestServiceDeps) {
    this.deps = deps;
    this.classifier = new CortexClassifier(deps.llm);
    this.entityExtractor = new CortexEntityExtractor(deps.llm);
    this.scopeRuleEngine = new ScopeRuleEngine(deps.engramRoot);
  }

  private engramService(): EngramService {
    return new EngramService({
      root: this.deps.engramRoot,
      db: this.deps.db,
      templates: this.deps.templates,
      scopeRuleEngine: this.scopeRuleEngine,
    });
  }

  private runStages(input: IngestInput): ReturnType<typeof runPipelineStages> {
    return runPipelineStages(input, {
      classifier: this.classifier,
      entityExtractor: this.entityExtractor,
      inferScopes: (scopeInput) => this.inferScopes(scopeInput),
    });
  }

  /** Run the full ingestion pipeline and write an engram. */
  async submit(input: IngestInput): Promise<IngestResult> {
    const stages = await this.runStages(input);
    const { body, type, classification, entities, referencedDates, mergedTags, scopeInference } =
      stages;

    const duplicate = findDuplicate(this.deps.db, hashContent(body));
    if (duplicate) {
      console.warn(`[IngestService] Duplicate content detected (${duplicate}) — skipping write`);
      const { engram: existing } = this.engramService().read(duplicate);
      return { engram: existing, classification, entities, scopeInference };
    }

    const customFields = mergeReferencedDates(input.customFields, referencedDates);

    const engram = this.engramService().create({
      type,
      title: input.title ?? deriveTitle(body),
      body,
      scopes: scopeInference.scopes,
      tags: mergedTags.length > 0 ? mergedTags : undefined,
      template: input.template ?? classification?.template ?? undefined,
      source: stages.source,
      customFields,
    });

    return { engram, classification, entities, scopeInference };
  }

  /** Preview what the pipeline would produce without writing. */
  async preview(input: IngestInput): Promise<PreviewResult> {
    const stages = await this.runStages(input);
    return {
      normalisedBody: stages.body,
      classification: stages.classification,
      entities: stages.entities,
      referencedDates: stages.referencedDates,
      scopeInference: stages.scopeInference,
    };
  }

  /**
   * Quick capture — minimal-friction path. Stores raw content immediately as
   * type=capture, then enqueues an async `classifyEngram` job.
   *
   * When `suggestedScopes` is supplied the engram is written with those scopes
   * and `_reconcile_scopes: true` so the curation worker reconciles them
   * against the existing vocabulary instead of inferring from scratch.
   *
   * `requeued` is `false` when the enrichment job could not be enqueued (no
   * Redis) — the engram is still created, so this is a fire-and-forget soft
   * signal rather than an error.
   */
  async quickCapture(
    text: string,
    source: EngramSource = QUICK_CAPTURE_SOURCE,
    suggestedScopes?: string[]
  ): Promise<QuickCaptureResult> {
    const body = normaliseBody(text);

    const trimmedSuggestions =
      suggestedScopes?.map((s) => s.trim()).filter((s) => s.length > 0) ?? [];
    const hasSuggestions = trimmedSuggestions.length > 0;

    const scopes = hasSuggestions
      ? trimmedSuggestions
      : this.scopeRuleEngine.inferScopes({
          source,
          type: QUICK_CAPTURE_TYPE,
          tags: [],
          explicitScopes: [],
        });

    const customFields = hasSuggestions ? { _reconcile_scopes: true } : undefined;

    const engram = this.engramService().create({
      type: QUICK_CAPTURE_TYPE,
      title: deriveTitle(body),
      body,
      scopes,
      source,
      customFields,
    });

    const requeued = await enqueueClassify(this.deps.curationQueue, engram.id);

    return {
      id: engram.id,
      path: engram.filePath,
      type: engram.type,
      scopes: engram.scopes,
      requeued,
    };
  }

  /** Classify body only — `POST /ingest/classify`. */
  async classify(body: string, title?: string): Promise<ClassificationResult> {
    return this.classifier.classify(normaliseBody(body), title);
  }

  /** Extract entities only — `POST /ingest/extract-entities`. */
  async extractEntities(
    body: string,
    existingTags: string[] = []
  ): Promise<EntityExtractionResult> {
    return this.entityExtractor.extract(normaliseBody(body), existingTags);
  }

  /** Infer scopes only — `POST /ingest/infer-scopes`. */
  async inferScopes(input: {
    body: string;
    type: string;
    tags: string[];
    source: string;
    explicitScopes?: string[];
    knownScopes?: string[];
  }): Promise<ScopeInferenceResult> {
    const svc = createScopeInferenceService(this.scopeRuleEngine.getConfig(), this.deps.llm);
    return svc.infer(input);
  }

  /** Read the engram (404s on miss) — exposed so handlers can pre-check existence. */
  readEngram(engramId: string): ReturnType<EngramService['read']> {
    return this.engramService().read(engramId);
  }

  /**
   * Re-enqueue the `classifyEngram` job for an engram. The engram must already
   * exist (verified here, 404s otherwise). Returns `false` when the queue is
   * unavailable (no Redis).
   */
  async retryEnrichment(engramId: string): Promise<boolean> {
    this.engramService().read(engramId);
    return enqueueClassify(this.deps.curationQueue, engramId);
  }
}
