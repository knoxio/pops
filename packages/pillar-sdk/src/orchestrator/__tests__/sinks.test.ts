import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { publishEvent, type SinkPoster, type SinkSchemaRegistry } from '../sinks.js';
import { snapshot } from './fixtures.js';

import type { PillarSnapshot } from '../../discovery/types.js';
import type { ManifestPayload } from '../../manifest-schema/schema.js';

function withSink(
  base: PillarSnapshot,
  descriptors: ManifestPayload['sinks'] extends infer T
    ? T extends { descriptors: infer D } | undefined
      ? D
      : never
    : never
): PillarSnapshot {
  return {
    ...base,
    manifest: { ...base.manifest, sinks: { descriptors } },
  };
}

const payloadSchema = z.object({
  id: z.string(),
  amount: z.number(),
});

const eventType = 'finance.balance.low';

function registry(): SinkSchemaRegistry {
  return new Map<string, z.ZodType<unknown>>([[eventType, payloadSchema]]);
}

function sinkDescriptor() {
  return {
    eventType,
    description: 'Subscribes to low-balance events from the finance pillar.',
    schema: { type: 'object' },
  };
}

describe('publishEvent', () => {
  it('dispatches the validated payload to every subscriber', async () => {
    const haBridge = withSink(snapshot('ha-bridge', []), [sinkDescriptor()]);
    const cerebrum = withSink(snapshot('cerebrum', []), [sinkDescriptor()]);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-1', amount: 12.5 },
      discovery: [haBridge, cerebrum],
      schemas: registry(),
      poster,
    });

    expect(result.failures).toEqual([]);
    expect(result.delivered).toEqual([
      { pillarId: 'ha-bridge', eventType },
      { pillarId: 'cerebrum', eventType },
    ]);
    expect(poster).toHaveBeenCalledTimes(2);
    expect(poster).toHaveBeenNthCalledWith(1, {
      pillarId: 'ha-bridge',
      baseUrl: 'https://ha-bridge.test',
      eventType,
      payload: { id: 'evt-1', amount: 12.5 },
    });
  });

  it('skips pillars whose manifest has no matching sink', async () => {
    const haBridge = withSink(snapshot('ha-bridge', []), [sinkDescriptor()]);
    const unrelated = snapshot('finance', []);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-2', amount: 0 },
      discovery: [haBridge, unrelated],
      schemas: registry(),
      poster,
    });

    expect(result.delivered).toEqual([{ pillarId: 'ha-bridge', eventType }]);
    expect(poster).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid payloads without dispatching to any sink', async () => {
    const haBridge = withSink(snapshot('ha-bridge', []), [sinkDescriptor()]);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-3', amount: 'not-a-number' },
      discovery: [haBridge],
      schemas: registry(),
      poster,
    });

    expect(poster).not.toHaveBeenCalled();
    expect(result.delivered).toEqual([]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toBe('invalid-payload');
  });

  it('reports schema-missing when the runtime registry has no entry', async () => {
    const haBridge = withSink(snapshot('ha-bridge', []), [sinkDescriptor()]);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-4', amount: 1 },
      discovery: [haBridge],
      schemas: new Map(),
      poster,
    });

    expect(poster).not.toHaveBeenCalled();
    expect(result.failures).toEqual([
      { pillarId: 'ha-bridge', eventType, reason: 'schema-missing' },
    ]);
  });

  it('marks unreachable pillars as pillar-offline without throwing', async () => {
    const healthy = withSink(snapshot('cerebrum', []), [sinkDescriptor()]);
    const offline = withSink(snapshot('ha-bridge', []), [sinkDescriptor()]);
    const poster = vi.fn<SinkPoster>().mockImplementation(async ({ pillarId }) => {
      if (pillarId === 'ha-bridge') throw new Error('ECONNREFUSED');
    });

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-5', amount: 99 },
      discovery: [healthy, offline],
      schemas: registry(),
      poster,
    });

    expect(result.delivered).toEqual([{ pillarId: 'cerebrum', eventType }]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatchObject({
      pillarId: 'ha-bridge',
      eventType,
      reason: 'pillar-offline',
    });
  });

  it('is a no-op when no pillar subscribes to the eventType', async () => {
    const finance = snapshot('finance', []);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-6', amount: 1 },
      discovery: [finance],
      schemas: registry(),
      poster,
    });

    expect(poster).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: [], failures: [] });
  });

  it('skips pillars whose registration is not active', async () => {
    const haBridge = withSink(snapshot('ha-bridge', [], false), [sinkDescriptor()]);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-7', amount: 1 },
      discovery: [haBridge],
      schemas: registry(),
      poster,
    });

    expect(poster).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: [], failures: [] });
  });

  it('resolves discovery from an async fetcher', async () => {
    const haBridge = withSink(snapshot('ha-bridge', []), [sinkDescriptor()]);
    const poster = vi.fn<SinkPoster>().mockResolvedValue(undefined);

    const result = await publishEvent({
      eventType,
      payload: { id: 'evt-8', amount: 2 },
      discovery: async () => [haBridge],
      schemas: registry(),
      poster,
    });

    expect(result.delivered).toEqual([{ pillarId: 'ha-bridge', eventType }]);
  });
});
