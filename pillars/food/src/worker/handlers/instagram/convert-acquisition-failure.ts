import type { IngestJobResult, IngestMeta } from '../../../contract/queue/index.js';
/**
 * Convert acquisition `AcquisitionResult` failure variants into the
 * `IngestJobResult` shape the worker shell hands back to the ingest
 * worker-complete flow.
 *
 * `auth-dead` is the special case: surfaced as `ok: true` with a
 * placeholder DSL and `partialReason='auth-dead'` so the review queue
 * shows the cookie-refresh prompt instead of treating it as a failure.
 * Rate-limited propagates `retryAfterSec` to BullMQ.
 */
import type { AcquisitionResult } from '../instagram-acquisition.js';

export interface ConvertOptions {
  sourceId: number;
  extractorVersion: string;
}

type AcquisitionFailure = Extract<AcquisitionResult, { ok: false }>;

export function convertAcquisitionFailure(
  acq: AcquisitionFailure,
  opts: ConvertOptions
): IngestJobResult {
  const meta: IngestMeta = {
    extractor_version: opts.extractorVersion,
    stages: { acquisition: { ok: false, kind: acq.kind } },
  };

  switch (acq.kind) {
    case 'auth-dead':
      return {
        ok: true,
        dsl: buildAuthDeadPlaceholderDsl(opts.sourceId),
        meta,
        partialReason: 'auth-dead',
      };
    case 'rate-limited':
      return {
        ok: false,
        errorCode: 'InstagramRateLimited',
        errorMessage: 'IG rate-limited; will retry',
        meta,
        retryAfterSec: acq.retryAfter,
      };
    case 'generic-failure':
      return {
        ok: false,
        errorCode: 'InstagramAcquisitionFailed',
        errorMessage: `yt-dlp exit ${acq.exitCode}: ${truncate(acq.stderr, 200)}`,
        meta,
      };
    case 'missing-artifacts':
      return {
        ok: false,
        errorCode: 'InstagramArtifactsMissing',
        errorMessage: 'yt-dlp succeeded but expected files not present',
        meta,
      };
    case 'cancelled':
      return {
        ok: false,
        errorCode: 'Cancelled',
        errorMessage: 'Instagram acquisition cancelled',
        meta,
      };
    default: {
      const exhaustive: never = acq;
      throw new Error(`Unhandled acquisition failure kind: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function buildAuthDeadPlaceholderDsl(sourceId: number): string {
  const slug = `ig-pending-${sourceId}`;
  return [
    `@recipe(slug="${slug}", title="Instagram ingest pending — cookies need refresh", servings=1)`,
    `@yield(${slug}, 1:count)`,
    '',
  ].join('\n');
}

function truncate(input: string, max: number): string {
  return input.length > max ? `${input.slice(0, max)}…` : input;
}
