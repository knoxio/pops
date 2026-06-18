/** Shared helpers for rule-specific evaluators. */

/** Compute the ISO timestamp of the rolling window start. */
export function rollingWindowStart(now: Date, minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}
