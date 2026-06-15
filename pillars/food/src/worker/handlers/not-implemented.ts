import type { IngestJobData, IngestJobResult } from '../../contract/queue/index.js';

/**
 * Shared NotImplemented stub. PRDs 127–132 replace each per-kind handler
 * with the real pipeline. Until then every dispatch lands here so the
 * worker → pops-api round-trip is end-to-end exercisable.
 *
 * `extractor_version` carries the worker's own version so the inbox can
 * tell apart a deliberate stub from an old worker image still in flight.
 */
export const NOT_IMPLEMENTED_EXTRACTOR_VERSION = 'pops-worker-food/stub@0.1.0';

export function notImplementedResult(kind: IngestJobData['kind']): IngestJobResult {
  return {
    ok: false,
    errorCode: 'NotImplemented',
    errorMessage: `Handler for kind="${kind}" is not implemented yet (PRDs 127–132).`,
    meta: {
      extractor_version: NOT_IMPLEMENTED_EXTRACTOR_VERSION,
      stages: {},
    },
  };
}
