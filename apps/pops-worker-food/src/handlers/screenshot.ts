import { notImplementedResult } from './not-implemented.js';

import type { IngestHandler } from './types.js';

/**
 * Screenshot ingest. Real pipeline lives in PRD-131 (single image →
 * Claude vision). Stub for PRD-126.
 */
export const runScreenshotIngest: IngestHandler<'screenshot'> = async (_data, _ctx) => {
  return notImplementedResult('screenshot');
};
