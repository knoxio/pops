import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openHaBridgeDb, upsertEntity, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';

import {
  decodeEntityCursor,
  encodeEntityCursor,
  ENTITY_LIST_DEFAULT_LIMIT,
  ENTITY_LIST_MAX_LIMIT,
  entityListInputSchema,
  runEntityList,
} from '../ai-tools/entity-list.js';

interface SeedSpec {
  entityId: string;
  state?: string;
  area?: string | null;
  friendlyName?: string;
  deviceClass?: string;
}

function seed(opened: OpenedHaBridgeDb, specs: SeedSpec[]): void {
  for (const spec of specs) {
    const attributes: Record<string, unknown> = {};
    if (spec.friendlyName !== undefined) attributes['friendly_name'] = spec.friendlyName;
    if (spec.deviceClass !== undefined) attributes['device_class'] = spec.deviceClass;
    upsertEntity(opened.db, {
      entityId: spec.entityId,
      state: spec.state ?? 'on',
      attributes,
      area: spec.area ?? null,
      lastChanged: 1,
      lastSeen: 1,
    });
  }
}

describe('ha bridge entity-list AI tool', () => {
  let opened: OpenedHaBridgeDb;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ha-bridge-entity-list-'));
    opened = openHaBridgeDb(join(dir, 'ha-bridge.db'));
  });

  afterEach(() => {
    opened.raw.close();
  });

  it('returns every entity when no filter is supplied, sorted by entity_id', () => {
    seed(opened, [
      { entityId: 'light.kitchen' },
      { entityId: 'light.living_room' },
      { entityId: 'sensor.bedroom_temperature' },
    ]);

    const result = runEntityList(opened.db, {});
    expect(result.entities.map((e) => e.entityId)).toEqual([
      'light.kitchen',
      'light.living_room',
      'sensor.bedroom_temperature',
    ]);
    expect(result.nextCursor).toBeNull();
  });

  it('filters by domain', () => {
    seed(opened, [
      { entityId: 'light.kitchen', area: 'kitchen' },
      { entityId: 'light.bedroom', area: 'bedroom' },
      { entityId: 'sensor.kitchen_temperature', area: 'kitchen' },
    ]);

    const result = runEntityList(opened.db, { domain: 'light' });
    expect(result.entities.map((e) => e.entityId)).toEqual(['light.bedroom', 'light.kitchen']);
    expect(result.entities.every((e) => e.domain === 'light')).toBe(true);
  });

  it('filters by area', () => {
    seed(opened, [
      { entityId: 'light.kitchen', area: 'kitchen' },
      { entityId: 'sensor.kitchen_humidity', area: 'kitchen' },
      { entityId: 'light.bedroom', area: 'bedroom' },
    ]);

    const result = runEntityList(opened.db, { area: 'kitchen' });
    expect(result.entities.map((e) => e.entityId)).toEqual([
      'light.kitchen',
      'sensor.kitchen_humidity',
    ]);
  });

  it('combines domain + area filters with AND semantics', () => {
    seed(opened, [
      { entityId: 'light.kitchen', area: 'kitchen' },
      { entityId: 'light.bedroom', area: 'bedroom' },
      { entityId: 'sensor.kitchen_humidity', area: 'kitchen' },
    ]);

    const result = runEntityList(opened.db, { domain: 'light', area: 'kitchen' });
    expect(result.entities.map((e) => e.entityId)).toEqual(['light.kitchen']);
  });

  it('paginates with a stable cursor that survives upserts between pages', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map((suffix) => `light.${suffix}`);
    seed(
      opened,
      ids.map((entityId) => ({ entityId }))
    );

    const page1 = runEntityList(opened.db, { limit: 2 });
    expect(page1.entities.map((e) => e.entityId)).toEqual(['light.a', 'light.b']);
    expect(page1.nextCursor).not.toBeNull();

    upsertEntity(opened.db, {
      entityId: 'light.a',
      state: 'off',
      attributes: {},
      area: null,
      lastChanged: 2,
      lastSeen: 2,
    });

    const cursor = page1.nextCursor;
    expect(cursor).not.toBeNull();
    const page2 = runEntityList(opened.db, { limit: 2, cursor: cursor ?? undefined });
    expect(page2.entities.map((e) => e.entityId)).toEqual(['light.c', 'light.d']);

    const page3 = runEntityList(opened.db, { limit: 2, cursor: page2.nextCursor ?? undefined });
    expect(page3.entities.map((e) => e.entityId)).toEqual(['light.e', 'light.f']);
    expect(page3.nextCursor).toBeNull();
  });

  it('clamps limit to the default and respects the max', () => {
    seed(
      opened,
      Array.from({ length: ENTITY_LIST_DEFAULT_LIMIT + 5 }, (_, i) => ({
        entityId: `light.l_${i.toString().padStart(3, '0')}`,
      }))
    );

    const defaulted = runEntityList(opened.db, {});
    expect(defaulted.entities).toHaveLength(ENTITY_LIST_DEFAULT_LIMIT);
    expect(defaulted.nextCursor).not.toBeNull();

    const parseLargeLimit = entityListInputSchema.safeParse({ limit: ENTITY_LIST_MAX_LIMIT + 1 });
    expect(parseLargeLimit.success).toBe(false);
  });

  it('rejects malformed input at the Zod boundary', () => {
    expect(entityListInputSchema.safeParse({ domain: 'Light' }).success).toBe(false);
    expect(entityListInputSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(entityListInputSchema.safeParse({ unknown: 1 }).success).toBe(false);
    expect(entityListInputSchema.safeParse({ domain: 'light' }).success).toBe(true);
  });

  it('round-trips the entity-id cursor encoding', () => {
    const cursor = encodeEntityCursor('sensor.kitchen.temperature');
    expect(cursor).not.toContain('.');
    expect(decodeEntityCursor(cursor)).toBe('sensor.kitchen.temperature');
    expect(decodeEntityCursor('')).toBeNull();
  });
});
