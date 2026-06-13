import { describe, expect, it, vi } from 'vitest';

import {
  callServiceInputSchema,
  CallServiceSender,
  type CallServiceLiveSocket,
  type CallServiceResultFrame,
} from '../ai-tools/index.js';
import { NOOP_SUBSCRIBER_LOGGER } from '../ws-subscriber-types.js';

interface Harness {
  sender: CallServiceSender;
  sent: string[];
  setLive(value: boolean): void;
  nextId(): number;
}

function createHarness(options: { timeoutMs?: number } = {}): Harness {
  let live = true;
  const sent: string[] = [];
  let id = 0;
  const liveSocket: CallServiceLiveSocket = {
    isReady: () => live,
    send: (data) => {
      sent.push(data);
    },
  };
  const sender = new CallServiceSender({
    liveSocket,
    nextCommandId: () => {
      id += 1;
      return id;
    },
    logger: NOOP_SUBSCRIBER_LOGGER,
    timeoutMs: options.timeoutMs ?? 10_000,
  });
  return {
    sender,
    sent,
    setLive: (value) => {
      live = value;
    },
    nextId: () => id,
  };
}

function parseFrame(json: string): Record<string, unknown> {
  const parsed = JSON.parse(json) as unknown;
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('expected object frame');
  }
  return parsed as Record<string, unknown>;
}

describe('callServiceInputSchema', () => {
  it('rejects non-snake-case domains', () => {
    const result = callServiceInputSchema.safeParse({ domain: 'Light', service: 'turn_off' });
    expect(result.success).toBe(false);
  });

  it('rejects non-snake-case services', () => {
    const result = callServiceInputSchema.safeParse({ domain: 'light', service: 'TurnOff' });
    expect(result.success).toBe(false);
  });

  it('accepts a well-formed light.turn_off without entityId', () => {
    const result = callServiceInputSchema.safeParse({ domain: 'light', service: 'turn_off' });
    expect(result.success).toBe(true);
  });

  it('rejects malformed entityId (no dot)', () => {
    const result = callServiceInputSchema.safeParse({
      domain: 'light',
      service: 'turn_off',
      entityId: 'kitchen_ceiling',
    });
    expect(result.success).toBe(false);
  });

  it('strips unknown top-level fields via strict()', () => {
    const result = callServiceInputSchema.safeParse({
      domain: 'light',
      service: 'turn_off',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('CallServiceSender', () => {
  it('serialises a successful call_service frame and resolves ok on HA ack', async () => {
    const h = createHarness();
    const promise = h.sender.call({
      domain: 'light',
      service: 'turn_off',
      entityId: 'light.kitchen_ceiling',
      serviceData: { transition: 2 },
    });

    expect(h.sent).toHaveLength(1);
    const frame = parseFrame(h.sent[0] ?? '');
    expect(frame['id']).toBe(1);
    expect(frame['type']).toBe('call_service');
    expect(frame['domain']).toBe('light');
    expect(frame['service']).toBe('turn_off');
    expect(frame['target']).toEqual({ entity_id: 'light.kitchen_ceiling' });
    expect(frame['service_data']).toEqual({ transition: 2 });

    const result: CallServiceResultFrame = { id: 1, success: true };
    expect(h.sender.handleResult(result)).toBe(true);
    await expect(promise).resolves.toEqual({ kind: 'ok' });
    expect(h.sender.pendingCount()).toBe(0);
  });

  it('rejects with ha-offline when the socket is not ready', async () => {
    const h = createHarness();
    h.setLive(false);
    const outcome = await h.sender.call({ domain: 'light', service: 'turn_off' });
    expect(outcome).toEqual({ kind: 'rejected', reason: 'ha-offline' });
    expect(h.sent).toHaveLength(0);
  });

  it('rejects with invalid-input on schema violation without touching the socket', async () => {
    const h = createHarness();
    const outcome = await h.sender.call({ domain: 'LIGHT', service: 'turn_off' });
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.reason).toBe('invalid-input');
    expect(h.sent).toHaveLength(0);
  });

  it('maps HA service_not_found error code to rejected/service-not-found', async () => {
    const h = createHarness();
    const promise = h.sender.call({ domain: 'light', service: 'no_such_service' });
    h.sender.handleResult({
      id: 1,
      success: false,
      error: { code: 'service_not_found', message: 'Unknown service' },
    });
    const outcome = await promise;
    expect(outcome).toEqual({
      kind: 'rejected',
      reason: 'service-not-found',
      message: 'Unknown service',
    });
  });

  it('treats unknown HA error codes as ha-offline (catch-all)', async () => {
    const h = createHarness();
    const promise = h.sender.call({ domain: 'light', service: 'turn_off' });
    h.sender.handleResult({ id: 1, success: false, error: { code: 'internal_error' } });
    const outcome = await promise;
    expect(outcome.kind).toBe('rejected');
    if (outcome.kind === 'rejected') expect(outcome.reason).toBe('ha-offline');
  });

  it('times out and resolves ha-offline if HA does not respond in window', async () => {
    vi.useFakeTimers();
    try {
      const h = createHarness({ timeoutMs: 100 });
      const promise = h.sender.call({ domain: 'light', service: 'turn_off' });
      vi.advanceTimersByTime(100);
      const outcome = await promise;
      expect(outcome).toEqual({ kind: 'rejected', reason: 'ha-offline', message: 'timeout' });
      expect(h.sender.pendingCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores result frames for unknown ids (no pending entry)', () => {
    const h = createHarness();
    expect(h.sender.handleResult({ id: 999, success: true })).toBe(false);
  });

  it('cancelAll resolves every pending call with the supplied outcome', async () => {
    const h = createHarness();
    const a = h.sender.call({ domain: 'light', service: 'turn_off' });
    const b = h.sender.call({ domain: 'switch', service: 'toggle' });
    expect(h.sender.pendingCount()).toBe(2);
    h.sender.cancelAll({ kind: 'rejected', reason: 'ha-offline' });
    await expect(a).resolves.toEqual({ kind: 'rejected', reason: 'ha-offline' });
    await expect(b).resolves.toEqual({ kind: 'rejected', reason: 'ha-offline' });
    expect(h.sender.pendingCount()).toBe(0);
  });
});
