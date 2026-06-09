import { notImplementedResult } from './not-implemented.js';

import type { IngestHandler } from './types.js';

/**
 * Instagram ingest. Real pipeline lives in PRDs 129 (yt-dlp + cookies +
 * auth-dead detection) + 130 (STT + vision). Stub for PRD-126.
 */
export const runInstagramIngest: IngestHandler<'url-instagram'> = async (_data, _ctx) => {
  return notImplementedResult('url-instagram');
};
