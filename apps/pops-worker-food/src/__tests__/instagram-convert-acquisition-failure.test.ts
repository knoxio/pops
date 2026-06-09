/**
 * PRD-130 — acquisition-failure conversion tests. Covers each of the
 * five `AcquisitionResult & { ok: false }` kinds.
 */
import { describe, expect, it } from 'vitest';

import {
  buildAuthDeadPlaceholderDsl,
  convertAcquisitionFailure,
} from '../handlers/instagram/convert-acquisition-failure.js';

const OPTS = { sourceId: 42, extractorVersion: 'ig-stt-vision@test' };

describe('convertAcquisitionFailure', () => {
  it('auth-dead surfaces as a partial draft with placeholder DSL', () => {
    const result = convertAcquisitionFailure({ ok: false, kind: 'auth-dead', stderr: '' }, OPTS);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.partialReason).toBe('auth-dead');
    expect(result.dsl).toContain('Instagram ingest pending');
    expect(result.dsl).toContain('ig-pending-42');
  });

  it('rate-limited propagates retryAfter', () => {
    const result = convertAcquisitionFailure(
      { ok: false, kind: 'rate-limited', retryAfter: 600 },
      OPTS
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('InstagramRateLimited');
    expect(result.retryAfterSec).toBe(600);
  });

  it('generic-failure carries the truncated stderr in the message', () => {
    const result = convertAcquisitionFailure(
      { ok: false, kind: 'generic-failure', exitCode: 1, stderr: 'x'.repeat(500) },
      OPTS
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('InstagramAcquisitionFailed');
    expect(result.errorMessage.length).toBeLessThan(260);
  });

  it('missing-artifacts is a structured failure', () => {
    const result = convertAcquisitionFailure({ ok: false, kind: 'missing-artifacts' }, OPTS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('InstagramArtifactsMissing');
  });

  it('cancelled propagates as the worker shell Cancelled errorCode', () => {
    const result = convertAcquisitionFailure({ ok: false, kind: 'cancelled' }, OPTS);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.errorCode).toBe('Cancelled');
  });

  it('buildAuthDeadPlaceholderDsl produces a parseable header + yield', () => {
    const dsl = buildAuthDeadPlaceholderDsl(99);
    expect(dsl).toContain('@recipe(slug="ig-pending-99"');
    expect(dsl).toContain('@yield(ig-pending-99, 1:count)');
  });
});
