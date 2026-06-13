/**
 * Shared authentication primitives for the PRD-228 external HTTP-JSON
 * surface (register / heartbeat / deregister).
 *
 * All three endpoints validate the caller in two layers:
 *
 *   1. Constant-time `apiKey` compare against the shared
 *      `POPS_INTERNAL_API_KEY`. This is the "are you on the docker
 *      network" gate (ADR-027).
 *   2. For pillar-addressed mutations (heartbeat / deregister),
 *      `sha256(apiKey)` is compared against the per-row `apiKeyHash`
 *      that was stored on register. This catches key rotation where
 *      the shared env was rotated but a pillar still holds the old
 *      value — the layer-1 check would pass, the layer-2 check fails
 *      with the same 401 shape.
 *
 * The compare helpers live in a separate module so the handler files
 * stay focused on response shaping. The 401 reply uses a single
 * `invalid-api-key` reason for both failure modes so callers cannot
 * use the response to probe which check failed.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time UTF-8 byte compare. `timingSafeEqual` requires equal-
 * length buffers, so the length-mismatch path still pays the same
 * compare cost against a zeroed buffer — no length oracle.
 */
export function constantTimeEquals(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length) {
    const dummy = Buffer.alloc(providedBuf.length);
    timingSafeEqual(providedBuf, dummy);
    return false;
  }
  return timingSafeEqual(providedBuf, expectedBuf);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
