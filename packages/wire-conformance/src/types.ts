/**
 * Inputs the harness needs in order to validate a pillar candidate.
 *
 * `baseUrl` is the pillar's tRPC base (no trailing slash). The harness
 * appends `/trpc/...`, `/manifest.json`, `/health`.
 *
 * `apiKey` is the shared `POPS_INTERNAL_API_KEY` used for the
 * `core.registry.register` handshake (§6). The harness assumes the
 * candidate exposes a `core.registry.register` endpoint compatible with
 * the spec — when validating a pillar that does not host the registry
 * itself (the common case), pass the `coreBaseUrl` of `core-api`.
 *
 * `probes` lets callers nominate procedures the harness should use for
 * each scenario. Defaults match the in-tree fixture pillar.
 */
export type ConformanceInput = {
  baseUrl: string;
  apiKey: string;
  coreBaseUrl?: string;
  probes?: ConformanceProbes;
  /**
   * Optional fetch implementation. Useful for tests that want to inject
   * an MSW handler or capture traffic.
   */
  fetchImpl?: typeof fetch;
};

/**
 * Procedure paths the harness needs in order to exercise each surface.
 *
 * The fixture pillar in this package exposes every one of these; in
 * production a pillar would map them onto its own procedures.
 */
export type ConformanceProbes = {
  /** Procedure that returns a deterministic success for any input. */
  successProcedure: string;
  /** Procedure that always returns a `NOT_FOUND` error envelope. */
  notFoundProcedure: string;
  /** Subscription procedure that emits at least one frame then completes. */
  subscriptionProcedure: string;
  /** Subscription that stays idle long enough to emit a heartbeat. */
  idleSubscriptionProcedure: string;
  /** Subscription that emits an `event: error` then closes. */
  errorSubscriptionProcedure: string;
  /** Manifest pillarId used in the registration probe. */
  registrationPillarId: string;
};

export const DEFAULT_PROBES: ConformanceProbes = {
  successProcedure: 'fixture.ping',
  notFoundProcedure: 'fixture.notFound',
  subscriptionProcedure: 'fixture.tick',
  idleSubscriptionProcedure: 'fixture.idle',
  errorSubscriptionProcedure: 'fixture.errorStream',
  registrationPillarId: 'fixture',
};
