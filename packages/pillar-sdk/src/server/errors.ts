/**
 * Thrown the first time `pillar()` (server) is invoked without a
 * service-account API key available — either via {@link configureServerSdk}
 * or the `POPS_INTERNAL_API_KEY` env var.
 *
 * Server-side calls go pillar-to-pillar without traversing nginx, so the
 * absence of an internal key is treated as a configuration bug rather than
 * a transient runtime failure.
 */
export class PillarServerSdkError extends Error {
  override readonly name = 'PillarServerSdkError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}
