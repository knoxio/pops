/**
 * SSE reconnection helper tests (Theme 13 PRD-164).
 *
 * Drives `startReconnectingSubscription` with a fake clock + fake
 * subscription handle so the schedule can be asserted deterministically:
 *
 *   - Each close triggers exactly one snapshot refetch.
 *   - Reconnect attempts follow exponential backoff capped at 30s.
 *   - A successful reconnect resets the attempt counter.
 *   - `stop()` halts everything: no further reconnects, the handle is
 *     closed if active.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  RECONNECT_INITIAL_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  computeBackoffDelay,
  startReconnectingSubscription,
  type SubscriptionHandle,
} from '../reconnect.js';

interface FakeHandle extends SubscriptionHandle {
  triggerClose: () => void;
  closeCount: number;
}

function createFakeHandle(): FakeHandle {
  let closeListener: ((reason?: unknown) => void) | null = null;
  let closed = false;
  const handle = {
    closeCount: 0,
    close: (): void => {
      if (closed) return;
      closed = true;
      handle.closeCount += 1;
      closeListener?.();
    },
    onClose: (listener: (reason?: unknown) => void): (() => void) => {
      closeListener = listener;
      return () => {
        closeListener = null;
      };
    },
    triggerClose: (): void => {
      if (closed) return;
      closed = true;
      closeListener?.();
    },
  };
  return handle;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeBackoffDelay', () => {
  it('returns the initial delay for attempt 1', () => {
    expect(computeBackoffDelay(1)).toBe(RECONNECT_INITIAL_DELAY_MS);
  });

  it('doubles by default for each subsequent attempt', () => {
    expect(computeBackoffDelay(2)).toBe(RECONNECT_INITIAL_DELAY_MS * 2);
    expect(computeBackoffDelay(3)).toBe(RECONNECT_INITIAL_DELAY_MS * 4);
    expect(computeBackoffDelay(4)).toBe(RECONNECT_INITIAL_DELAY_MS * 8);
  });

  it('caps at RECONNECT_MAX_DELAY_MS (30s)', () => {
    expect(computeBackoffDelay(20)).toBe(RECONNECT_MAX_DELAY_MS);
    expect(computeBackoffDelay(50)).toBe(RECONNECT_MAX_DELAY_MS);
  });

  it('respects custom initial / max / factor', () => {
    expect(
      computeBackoffDelay(3, { initialDelayMs: 100, backoffFactor: 3, maxDelayMs: 100_000 })
    ).toBe(900);
    expect(
      computeBackoffDelay(10, { initialDelayMs: 100, backoffFactor: 3, maxDelayMs: 5_000 })
    ).toBe(5_000);
  });
});

describe('startReconnectingSubscription', () => {
  it('opens an initial connection without delay', async () => {
    const handles: FakeHandle[] = [];
    const connect = vi.fn(async () => {
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });
    const fetchSnapshot = vi.fn();

    const sub = startReconnectingSubscription({ connect, fetchSnapshot });
    await vi.advanceTimersByTimeAsync(0);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(fetchSnapshot).not.toHaveBeenCalled();
    sub.stop();
  });

  it('refetches the snapshot once and reconnects after the underlying handle closes', async () => {
    const handles: FakeHandle[] = [];
    const connect = vi.fn(async () => {
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });
    const fetchSnapshot = vi.fn().mockResolvedValue(undefined);

    const sub = startReconnectingSubscription({ connect, fetchSnapshot });
    await vi.advanceTimersByTimeAsync(0);
    expect(handles).toHaveLength(1);

    handles[0]!.triggerClose();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(2);
    sub.stop();
  });

  it('follows exponential backoff across consecutive failures', async () => {
    let connectAttempts = 0;
    const handles: FakeHandle[] = [];
    const connect = vi.fn(async () => {
      connectAttempts += 1;
      if (connectAttempts <= 4) throw new Error(`connect fail ${connectAttempts}`);
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });
    const fetchSnapshot = vi.fn().mockResolvedValue(undefined);
    const onReconnectScheduled = vi.fn();
    const onReconnectError = vi.fn();

    const sub = startReconnectingSubscription({
      connect,
      fetchSnapshot,
      onReconnectScheduled,
      onReconnectError,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(onReconnectError).toHaveBeenCalledTimes(1);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(1, RECONNECT_INITIAL_DELAY_MS);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(2, RECONNECT_INITIAL_DELAY_MS * 2);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS * 2);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(3, RECONNECT_INITIAL_DELAY_MS * 4);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS * 4);
    expect(connect).toHaveBeenCalledTimes(4);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(4, RECONNECT_INITIAL_DELAY_MS * 8);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS * 8);
    expect(connect).toHaveBeenCalledTimes(5);
    expect(handles).toHaveLength(1);

    sub.stop();
  });

  it('caps backoff at the configured maximum', async () => {
    const scheduledDelays: number[] = [];
    const connect = vi.fn(async () => {
      throw new Error('always fail');
    });
    const sub = startReconnectingSubscription({
      connect,
      fetchSnapshot: vi.fn(),
      initialDelayMs: 1_000,
      maxDelayMs: 4_000,
      backoffFactor: 2,
      onReconnectScheduled: (_attempt, delay) => scheduledDelays.push(delay),
    });

    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 8; i += 1) {
      const delay = scheduledDelays[scheduledDelays.length - 1] ?? 1_000;
      await vi.advanceTimersByTimeAsync(delay);
    }

    expect(scheduledDelays.slice(0, 4)).toEqual([1_000, 2_000, 4_000, 4_000]);
    expect(scheduledDelays.every((d) => d <= 4_000)).toBe(true);
    sub.stop();
  });

  it('resets the attempt counter after a successful reconnect', async () => {
    let phase = 0;
    const handles: FakeHandle[] = [];
    const connect = vi.fn(async () => {
      phase += 1;
      if (phase === 2) throw new Error('transient');
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });
    const onReconnectScheduled = vi.fn();
    const sub = startReconnectingSubscription({
      connect,
      fetchSnapshot: vi.fn().mockResolvedValue(undefined),
      onReconnectScheduled,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(sub.currentAttempt()).toBe(0);

    handles[0]!.triggerClose();
    await vi.advanceTimersByTimeAsync(0);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(1, RECONNECT_INITIAL_DELAY_MS);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(2, RECONNECT_INITIAL_DELAY_MS * 2);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS * 2);
    expect(sub.currentAttempt()).toBe(0);

    handles[1]!.triggerClose();
    await vi.advanceTimersByTimeAsync(0);
    expect(onReconnectScheduled).toHaveBeenLastCalledWith(1, RECONNECT_INITIAL_DELAY_MS);

    sub.stop();
  });

  it('stop() halts the schedule and closes the active handle', async () => {
    const handles: FakeHandle[] = [];
    const connect = vi.fn(async () => {
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });

    const sub = startReconnectingSubscription({ connect, fetchSnapshot: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(handles).toHaveLength(1);

    sub.stop();

    handles[0]!.triggerClose();
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_DELAY_MS * 2);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(handles[0]!.closeCount).toBeGreaterThanOrEqual(1);
  });

  it('stop() during a pending reconnect prevents the next connect', async () => {
    const handles: FakeHandle[] = [];
    let shouldFail = true;
    const connect = vi.fn(async () => {
      if (shouldFail) throw new Error('fail');
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });

    const sub = startReconnectingSubscription({ connect, fetchSnapshot: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    expect(connect).toHaveBeenCalledTimes(1);

    sub.stop();
    shouldFail = false;
    await vi.advanceTimersByTimeAsync(RECONNECT_MAX_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('reports snapshot refetch errors via onReconnectError', async () => {
    const handles: FakeHandle[] = [];
    const connect = vi.fn(async () => {
      const handle = createFakeHandle();
      handles.push(handle);
      return handle;
    });
    const fetchSnapshot = vi.fn().mockRejectedValue(new Error('snapshot 503'));
    const onReconnectError = vi.fn();

    const sub = startReconnectingSubscription({
      connect,
      fetchSnapshot,
      onReconnectError,
    });

    await vi.advanceTimersByTimeAsync(0);
    handles[0]!.triggerClose();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(onReconnectError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(RECONNECT_INITIAL_DELAY_MS);
    expect(connect).toHaveBeenCalledTimes(2);
    sub.stop();
  });
});
