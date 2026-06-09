import { notImplementedResult } from './not-implemented.js';

import type { IngestHandler } from './types.js';

/**
 * Text ingest. Real pipeline lives in PRD-132 (paste → Claude text).
 * Stub for PRD-126.
 */
export const runTextIngest: IngestHandler<'text'> = async (_data, _ctx) => {
  return notImplementedResult('text');
};
