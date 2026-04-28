/**
 * Glia curation worker BullMQ job handler (PRD-085).
 *
 * Routes glia:prune, glia:consolidate, glia:link, and glia:audit jobs
 * to the corresponding worker class. Registered on the pops-curation queue.
 */
import pino from 'pino';

import { getDrizzle } from '../../../db.js';
import { getEngramService } from '../instance.js';
import { HybridSearchService } from '../retrieval/hybrid-search.js';
import { AuditorWorker } from './auditor.js';
import { ConsolidatorWorker } from './consolidator.js';
import { LinkerWorker } from './linker.js';
import { PrunerWorker } from './pruner.js';

import type { WorkerRunResult } from './types.js';

const logger = pino({ name: 'worker:glia' });

export interface GliaJobData {
  type: 'glia:prune' | 'glia:consolidate' | 'glia:link' | 'glia:audit';
  dryRun?: boolean;
}

/** Process a glia curation job. */
export async function processGliaJob(data: GliaJobData): Promise<WorkerRunResult> {
  const engramService = getEngramService();
  const searchService = new HybridSearchService(getDrizzle());

  const deps = { engramService, searchService };

  logger.info({ type: data.type, dryRun: data.dryRun }, 'Glia job starting');

  let result: WorkerRunResult;

  switch (data.type) {
    case 'glia:prune': {
      const worker = new PrunerWorker(deps);
      result = await worker.run(data.dryRun);
      break;
    }
    case 'glia:consolidate': {
      const worker = new ConsolidatorWorker(deps);
      result = await worker.run(data.dryRun);
      break;
    }
    case 'glia:link': {
      const worker = new LinkerWorker(deps);
      result = await worker.run(data.dryRun);
      break;
    }
    case 'glia:audit': {
      const worker = new AuditorWorker(deps);
      result = await worker.run(data.dryRun);
      break;
    }
    default: {
      const exhaustiveCheck: never = data.type;
      throw new Error(`Unknown glia job type: ${String(exhaustiveCheck)}`);
    }
  }

  logger.info(
    {
      type: data.type,
      actions: result.actions.length,
      processed: result.processed,
      skipped: result.skipped,
    },
    'Glia job completed'
  );

  return result;
}
