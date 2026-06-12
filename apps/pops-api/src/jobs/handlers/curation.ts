/**
 * Curation queue handler.
 *
 * Handles 'classifyEngram' jobs enqueued by quickCapture: reads the stored
 * capture engram, runs full classification + entity extraction + scope
 * inference, and updates the engram's type, template, tags, scopes, and
 * referenced_dates in both the file and the index.
 *
 * Idempotent: skips enrichment if the engram's content hash hasn't changed
 * since the last enrichment (tracked via `_enrichedHash` custom field).
 */
import pino from 'pino';

import { getCerebrumDrizzle } from '../../db/cerebrum-handle.js';
import { createScopeReconciliationService } from '../../modules/cerebrum/engrams/scope-reconciliation.js';
import { listScopes } from '../../modules/cerebrum/engrams/scopes-router.js';
import { CortexClassifier } from '../../modules/cerebrum/ingest/classifier.js';
import { CortexEntityExtractor } from '../../modules/cerebrum/ingest/entity-extractor.js';
import { createScopeInferenceService } from '../../modules/cerebrum/ingest/scope-inference.js';
import { getEngramService, getScopeRuleEngine } from '../../modules/cerebrum/instance.js';

import type { Job } from 'bullmq';

import type { ScopeSuggestion } from '../../modules/cerebrum/engrams/scope-reconciliation.js';
import type { UpdateEngramInput } from '../../modules/cerebrum/engrams/service.js';
import type { Engram } from '../../modules/cerebrum/engrams/types.js';
import type { ClassifyEngramJobData, CurationQueueJobData } from '../types.js';

interface ScopeResolutionResult {
  scopes: string[];
  reconciled: boolean;
  suggestions: ScopeSuggestion[];
}

const logger = pino({ name: 'worker:curation' });

const GLIA_JOB_TYPES = ['glia:prune', 'glia:consolidate', 'glia:link', 'glia:audit'] as const;
type GliaJobType = (typeof GLIA_JOB_TYPES)[number];

function isGliaJobType(type: string): type is GliaJobType {
  return (GLIA_JOB_TYPES as readonly string[]).includes(type);
}

export async function process(job: Job<CurationQueueJobData>): Promise<unknown> {
  const { type } = job.data;
  logger.info({ jobId: job.id, type }, 'Curation job received');

  if (job.data.type === 'classifyEngram') {
    const data = job.data as ClassifyEngramJobData;
    return processClassifyEngram(data.engramId);
  }

  if (isGliaJobType(type)) {
    const { processGliaJob } = await import('../../modules/cerebrum/workers/handler.js');
    const dryRun = (job.data as Record<string, unknown>)['dryRun'] as boolean | undefined;
    return processGliaJob({ type, dryRun });
  }

  throw new Error(`Curation handler not implemented for type: ${type}`);
}

async function processClassifyEngram(engramId: string): Promise<{ engramId: string }> {
  const engramService = getEngramService();
  const { engram, body } = engramService.read(engramId);

  // Idempotency: skip if content hasn't changed since last enrichment.
  const previousHash = engram.customFields['_enrichedHash'] as string | undefined;
  if (previousHash && previousHash === engram.contentHash) {
    logger.info({ engramId }, '[curation] Content unchanged — skipping enrichment');
    return { engramId };
  }

  const classifier = new CortexClassifier();
  const entityExtractor = new CortexEntityExtractor();
  const referenceDate = engram.created.slice(0, 10);

  const classification = await classifier.classify(body, engram.title);
  const { tags: entityTags, referencedDates } = await entityExtractor.extract(
    body,
    engram.tags,
    referenceDate
  );

  const mergedTags = dedupe([...engram.tags, ...entityTags, ...classification.suggestedTags]);

  // Build custom fields: merge referenced_dates + enrichment hash.
  const customFields: Record<string, unknown> = { ...engram.customFields };
  if (referencedDates.length > 0) {
    customFields['referenced_dates'] = referencedDates;
  }
  customFields['_enrichedHash'] = engram.contentHash;

  const scopeResolution = await resolveScopes(engram, body, classification.type, mergedTags);
  // Always clear stale suggestions from any prior enrichment run; only the
  // current reconciliation pass (when active and producing matches) gets to
  // populate them. This handles the case where `_reconcile_scopes` was true
  // on a previous run but is now false.
  if (scopeResolution.reconciled && scopeResolution.suggestions.length > 0) {
    customFields['_scope_suggestions'] = scopeResolution.suggestions;
  } else {
    delete customFields['_scope_suggestions'];
  }

  const updateInput: UpdateEngramInput = {
    scopes: scopeResolution.scopes,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    customFields,
  };
  if (classification.template) {
    updateInput.template = classification.template;
  }
  engramService.update(engramId, updateInput);

  // PRD-081 US-03 AC #6: graduate capture engrams to their classified type
  // folder. `changeType` is a no-op when types already match, so this is safe
  // to call unconditionally.
  if (classification.type !== engram.type) {
    engramService.changeType(engramId, classification.type);
  }

  logger.info(
    {
      engramId,
      type: classification.type,
      template: classification.template,
      confidence: classification.confidence,
      scopes: scopeResolution.scopes,
      reconciled: scopeResolution.reconciled,
      scopeSuggestions: scopeResolution.suggestions.length,
      referencedDates: referencedDates.length,
    },
    '[curation] Engram enriched'
  );

  return { engramId };
}

/**
 * Decide what scopes to write for the engram. When the engram opted into
 * scope reconciliation (`_reconcile_scopes: true`, set by quickCapture when
 * the user provides scopes from the manual surface), preserve the user's
 * scopes and propose canonical alternatives via the reconciliation service
 * (PRD-081 US-10). Otherwise, run the standard scope inference pipeline.
 */
async function resolveScopes(
  engram: Engram,
  body: string,
  classifiedType: string,
  mergedTags: string[]
): Promise<ScopeResolutionResult> {
  if (engram.customFields['_reconcile_scopes'] === true) {
    const dismissed = engram.customFields['_scope_suggestions_dismissed'];
    const dismissedKeys = Array.isArray(dismissed)
      ? dismissed.filter((v): v is string => typeof v === 'string')
      : [];
    const reconciler = createScopeReconciliationService();
    const { suggestions } = reconciler.reconcile({
      suggestedScopes: engram.scopes,
      knownScopes: listScopes(getCerebrumDrizzle()),
      dismissedSegmentSetKeys: dismissedKeys,
    });
    return { scopes: engram.scopes, reconciled: true, suggestions };
  }

  const config = getScopeRuleEngine().getConfig();
  const scopeService = createScopeInferenceService(config);
  const scopeResult = await scopeService.infer({
    body,
    type: classifiedType,
    tags: mergedTags,
    source: engram.source,
    explicitScopes: undefined,
  });
  return { scopes: scopeResult.scopes, reconciled: false, suggestions: [] };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
