import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openHaBridgeDb, upsertEntity, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';

import { entityGetStateInputSchema, runEntityGetState } from '../ai-tools/entity-get-state.js';

describe('ha bridge entity-get-state AI tool', () => {
  let opened: OpenedHaBridgeDb;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ha-bridge-entity-get-state-'));
    opened = openHaBridgeDb(join(dir, 'ha-bridge.db'));
  });

  afterEach(() => {
    opened.raw.close();
  });

  it('returns the mirrored row for a known entity', () => {
    upsertEntity(opened.db, {
      entityId: 'light.kitchen',
      state: 'on',
      attributes: { friendly_name: 'Kitchen Light', device_class: 'illuminance' },
      area: 'kitchen',
      lastChanged: 100,
      lastSeen: 200,
    });

    const result = runEntityGetState(opened.db, { entityId: 'light.kitchen' });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error('unreachable');
    expect(result.entity.entityId).toBe('light.kitchen');
    expect(result.entity.domain).toBe('light');
    expect(result.entity.state).toBe('on');
    expect(result.entity.area).toBe('kitchen');
    expect(result.entity.friendlyName).toBe('Kitchen Light');
  });

  it('returns the typed not-found discriminant when the entity is not mirrored', () => {
    const result = runEntityGetState(opened.db, { entityId: 'light.does_not_exist' });
    expect(result).toEqual({ kind: 'not-found' });
  });

  it('does not leak rows across different entityIds', () => {
    upsertEntity(opened.db, {
      entityId: 'light.kitchen',
      state: 'on',
      attributes: {},
      area: null,
      lastChanged: 1,
      lastSeen: 1,
    });

    const hit = runEntityGetState(opened.db, { entityId: 'light.kitchen' });
    const miss = runEntityGetState(opened.db, { entityId: 'light.bedroom' });

    expect(hit.kind).toBe('ok');
    expect(miss.kind).toBe('not-found');
  });

  it('rejects malformed entityId at the Zod boundary', () => {
    expect(entityGetStateInputSchema.safeParse({ entityId: 'Light.Kitchen' }).success).toBe(false);
    expect(entityGetStateInputSchema.safeParse({ entityId: 'lightkitchen' }).success).toBe(false);
    expect(entityGetStateInputSchema.safeParse({ entityId: '' }).success).toBe(false);
    expect(entityGetStateInputSchema.safeParse({}).success).toBe(false);
    expect(
      entityGetStateInputSchema.safeParse({ entityId: 'light.kitchen', extra: 1 }).success
    ).toBe(false);
    expect(entityGetStateInputSchema.safeParse({ entityId: 'light.kitchen' }).success).toBe(true);
  });
});
