/**
 * Pure unit tests for `computeStatus` and clock injection.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  HEARTBEAT_INTERVAL_MS,
  MISS_THRESHOLD,
  UNAVAILABLE_AFTER_MS,
  computeStatus,
  injectRegistryClock,
  registryNow,
  resetRegistryClock,
} from '../modules/registry/status.js';

describe('computeStatus', () => {
  const base = new Date('2026-06-12T12:00:00.000Z');

  it('treats a heartbeat at exactly NOW as healthy', () => {
    expect(computeStatus(base, base)).toBe('healthy');
  });

  it('treats an age just under the threshold as healthy', () => {
    const now = new Date(base.getTime() + UNAVAILABLE_AFTER_MS - 1);
    expect(computeStatus(base, now)).toBe('healthy');
  });

  it('treats an age exactly at the threshold as unavailable (boundary owned by unavailable)', () => {
    const now = new Date(base.getTime() + UNAVAILABLE_AFTER_MS);
    expect(computeStatus(base, now)).toBe('unavailable');
  });

  it('treats negative ages (clock skew) as healthy', () => {
    const now = new Date(base.getTime() - 60_000);
    expect(computeStatus(base, now)).toBe('healthy');
  });

  it('exports the canonical 10s × 3 = 30s constants', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(10_000);
    expect(MISS_THRESHOLD).toBe(3);
    expect(UNAVAILABLE_AFTER_MS).toBe(30_000);
  });
});

describe('registry clock injection', () => {
  afterEach(() => {
    resetRegistryClock();
  });

  it('uses the injected clock for registryNow()', () => {
    const frozen = new Date('2030-01-01T00:00:00.000Z');
    injectRegistryClock(() => frozen);
    expect(registryNow().toISOString()).toBe(frozen.toISOString());
  });

  it('resets to real time when passed null', () => {
    injectRegistryClock(() => new Date('2030-01-01T00:00:00.000Z'));
    injectRegistryClock(null);
    const drift = Math.abs(registryNow().getTime() - Date.now());
    expect(drift).toBeLessThan(1_000);
  });
});
