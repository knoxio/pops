import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createSinkHandler } from '../sinks.js';

const payloadSchema = z.object({
  id: z.string(),
  amount: z.number(),
});

describe('createSinkHandler', () => {
  it('mounts at /_sinks/<eventType>', () => {
    const handler = createSinkHandler({
      eventType: 'finance.balance.low',
      schema: payloadSchema,
      handler: vi.fn(),
    });
    expect(handler.path).toBe('/_sinks/finance.balance.low');
    expect(handler.eventType).toBe('finance.balance.low');
  });

  it('runs the user handler on a valid payload and returns ok', async () => {
    const handler = vi.fn();
    const sink = createSinkHandler({
      eventType: 'finance.balance.low',
      schema: payloadSchema,
      handler,
    });

    const result = await sink.invoke({ id: 'evt-1', amount: 12.5 });

    expect(handler).toHaveBeenCalledWith({ id: 'evt-1', amount: 12.5 });
    expect(result).toEqual({ status: 'ok' });
  });

  it('rejects invalid payloads with structured issues and does not call the handler', async () => {
    const handler = vi.fn();
    const sink = createSinkHandler({
      eventType: 'finance.balance.low',
      schema: payloadSchema,
      handler,
    });

    const result = await sink.invoke({ id: 'evt-1' });

    expect(handler).not.toHaveBeenCalled();
    expect(result.status).toBe('invalid-payload');
    if (result.status !== 'invalid-payload') return;
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.path).toContain('amount');
  });

  it('captures handler errors as handler-failed for HTTP 5xx mapping', async () => {
    const boom = new Error('database offline');
    const sink = createSinkHandler({
      eventType: 'finance.balance.low',
      schema: payloadSchema,
      handler: async () => {
        throw boom;
      },
    });

    const result = await sink.invoke({ id: 'evt-1', amount: 1 });

    expect(result.status).toBe('handler-failed');
    if (result.status !== 'handler-failed') return;
    expect(result.error).toBe(boom);
  });

  it('awaits asynchronous handlers before returning ok', async () => {
    const order: string[] = [];
    const sink = createSinkHandler({
      eventType: 'finance.balance.low',
      schema: payloadSchema,
      handler: async (payload) => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        order.push(`handled-${payload.id}`);
      },
    });

    const result = await sink.invoke({ id: 'evt-async', amount: 0 });

    expect(order).toEqual(['handled-evt-async']);
    expect(result).toEqual({ status: 'ok' });
  });
});
