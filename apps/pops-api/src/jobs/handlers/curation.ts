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

import { CortexClassifier } from '../../modules/cerebrum/ingest/classifier.js';
import { CortexEntityExtractor } from '../../modules/cerebrum/ingest/entity-extractor.js';
import { createScopeInferenceService } from '../../modules/cerebrum/ingest/scope-inference.js';
import { getEngramService, getScopeRuleEngine } from '../../modules/cerebrum/instance.js';

import type { Job } from 'bullmq';

import type { ClassifyEngramJobData, CurationQueueJobData } from '../types.js';

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

  const config = getScopeRuleEngine().getConfig();
  const scopeService = createScopeInferenceService(config);
  const scopeResult = await scopeService.infer({
    body,
    type: classification.type,
    tags: mergedTags,
    source: engram.source,
    explicitScopes: undefined,
  });

  // Build custom fields: merge referenced_dates + enrichment hash.
  const customFields: Record<string, unknown> = { ...engram.customFields };
  if (referencedDates.length > 0) {
    customFields['referenced_dates'] = referencedDates;
  }
  customFields['_enrichedHash'] = engram.contentHash;

  engramService.update(engramId, {
    scopes: scopeResult.scopes,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    customFields,
  });

  logger.info(
    {
      engramId,
      type: classification.type,
      confidence: classification.confidence,
      scopes: scopeResult.scopes,
      referencedDates: referencedDates.length,
    },
    '[curation] Engram enriched'
  );

  return { engramId };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
