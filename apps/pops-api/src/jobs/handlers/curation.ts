/**
 * Curation queue handler.
 *
 * Handles 'classifyEngram' jobs enqueued by quickCapture: reads the stored
 * capture engram, runs full classification + entity extraction + scope
 * inference, and updates the engram in-place.
 */
import pino from 'pino';

import { CortexClassifier } from '../../modules/cerebrum/ingest/classifier.js';
import { CortexEntityExtractor } from '../../modules/cerebrum/ingest/entity-extractor.js';
import { createScopeInferenceService } from '../../modules/cerebrum/ingest/scope-inference.js';
import { getEngramService, getScopeRuleEngine } from '../../modules/cerebrum/instance.js';

import type { Job } from 'bullmq';

import type { ClassifyEngramJobData, CurationQueueJobData } from '../types.js';

const logger = pino({ name: 'worker:curation' });

export async function process(job: Job<CurationQueueJobData>): Promise<unknown> {
  const { type } = job.data;
  logger.info({ jobId: job.id, type }, 'Curation job received');

  if (job.data.type === 'classifyEngram') {
    const data = job.data as ClassifyEngramJobData;
    return processClassifyEngram(data.engramId);
  }

  throw new Error(`Curation handler not implemented for type: ${type}`);
}

async function processClassifyEngram(engramId: string): Promise<{ engramId: string }> {
  const engramService = getEngramService();
  const { engram, body } = engramService.read(engramId);

  const classifier = new CortexClassifier();
  const entityExtractor = new CortexEntityExtractor();

  const classification = await classifier.classify(body, engram.title);
  const { tags: entityTags } = await entityExtractor.extract(body, engram.tags);

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

  engramService.update(engramId, {
    scopes: scopeResult.scopes,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
  });

  logger.info(
    {
      engramId,
      type: classification.type,
      confidence: classification.confidence,
      scopes: scopeResult.scopes,
    },
    '[curation] Engram enriched'
  );

  return { engramId };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
