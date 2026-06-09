import { notImplementedResult } from './not-implemented.js';

import type { IngestHandler } from './types.js';

/**
 * Web-URL ingest. Real pipeline lives in PRDs 127 (JSON-LD) + 128 (LLM
 * fallback). PRD-126 ships the dispatch shell; this stub keeps the
 * round-trip honest.
 */
export const runWebUrlIngest: IngestHandler<'url-web'> = async (_data, _ctx) => {
  return notImplementedResult('url-web');
};
