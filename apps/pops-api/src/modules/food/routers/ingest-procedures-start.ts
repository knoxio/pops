/**
 * PRD-125 — `food.ingest.start` implementation.
 *
 * Always creates the `ingest_sources` row first (defensive: the row records
 * the attempt regardless of whether enqueue succeeds). For screenshot
 * inputs the base64 payload is written to disk under the per-source dir
 * BEFORE the BullMQ job is enqueued so the heavy bytes don't ride in Redis.
 */
import { type FoodDb, ingestSourcesService } from '@pops/app-food-db';

import { enqueueIngestJob, type EnqueueResult } from '../services/ingest-enqueue.js';
import { writeScreenshotPayload } from '../services/ingest-storage.js';

import type { IngestJobData } from '@pops/food-contracts';

import type { IngestStartInput } from './ingest-schemas.js';

const EXTRACTOR_VERSION_PLACEHOLDER = 'pipeline-v1.0';

interface StartContext {
  db: FoodDb;
  extractorVersion?: string;
}

interface RowInputForKind {
  kind: 'url-web' | 'url-instagram' | 'text' | 'screenshot';
  extractorVersion: string;
  url?: string;
  caption?: string;
}

function rowInputForKind(input: IngestStartInput, extractorVersion: string): RowInputForKind {
  switch (input.kind) {
    case 'url-web':
    case 'url-instagram':
      return { kind: input.kind, extractorVersion, url: input.url };
    case 'text':
      return { kind: 'text', extractorVersion, caption: input.body };
    case 'screenshot':
      return { kind: 'screenshot', extractorVersion };
  }
}

function jobDataFor(
  input: IngestStartInput,
  sourceId: number,
  screenshotPath: string | null
): IngestJobData {
  switch (input.kind) {
    case 'url-web':
    case 'url-instagram':
      return { kind: input.kind, sourceId, url: input.url };
    case 'text':
      return { kind: 'text', sourceId, body: input.body };
    case 'screenshot':
      if (screenshotPath === null) {
        throw new Error('Screenshot enqueue requested without a written content path');
      }
      return {
        kind: 'screenshot',
        sourceId,
        mimeType: input.mimeType,
        contentPath: screenshotPath,
      };
  }
}

export interface StartResult extends EnqueueResult {
  sourceId: number;
}

export async function startIngest(
  ctx: StartContext,
  input: IngestStartInput
): Promise<StartResult> {
  const extractorVersion = ctx.extractorVersion ?? EXTRACTOR_VERSION_PLACEHOLDER;
  const row = ingestSourcesService.createIngestSource(
    ctx.db,
    rowInputForKind(input, extractorVersion)
  );
  let screenshotPath: string | null = null;
  if (input.kind === 'screenshot') {
    const written = writeScreenshotPayload(row.id, input.mimeType, input.contentBase64);
    screenshotPath = written.relativeContentPath;
  }
  const enqueued = await enqueueIngestJob(jobDataFor(input, row.id, screenshotPath));
  return { sourceId: row.id, jobId: enqueued.jobId, queuedAt: enqueued.queuedAt };
}
