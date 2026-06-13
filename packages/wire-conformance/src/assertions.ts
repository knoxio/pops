/**
 * Stable identifiers for the wire-format v1 conformance assertions.
 *
 * Each ID maps 1:1 to a row in §12 of `docs/themes/13-pillar-finale/specs/pillar-wire-format-v1.md`.
 * Adding or renaming an ID is a wire-format minor bump and requires an ADR.
 */
export const WIRE_ASSERTIONS = [
  'WF-01-single-call-success',
  'WF-02-single-call-error-envelope',
  'WF-03-single-call-missing-input',
  'WF-04-batched-success',
  'WF-05-batched-preserves-order',
  'WF-06-batched-mixed-success-error',
  'WF-07-batched-malformed-envelope',
  'WF-08-subscription-content-type',
  'WF-09-subscription-frame-format',
  'WF-10-subscription-heartbeat',
  'WF-11-subscription-error-event',
  'WF-12-subscription-bad-input',
  'WF-13-manifest-shape',
  'WF-14-manifest-cache-control',
  'WF-15-registration-success',
  'WF-16-registration-bad-key',
  'WF-17-health-healthy',
  'WF-18-health-unhealthy',
  'WF-19-request-id-echo',
  'WF-20-wire-version-unsupported',
] as const;

export type WireAssertionId = (typeof WIRE_ASSERTIONS)[number];

export type AssertionResult = {
  id: WireAssertionId;
  passed: boolean;
  message?: string;
};

export type ConformanceReport = {
  baseUrl: string;
  passed: number;
  failed: number;
  total: number;
  results: AssertionResult[];
};
