import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendHistory,
  getEntity,
  openHaBridgeDb,
  pruneHistory,
  upsertEntity,
  type OpenedHaBridgeDb,
} from '../index.js';
import { haStateHistory } from '../schema.js';

describe('ha-bridge-db entities service', () => {
  let opened: OpenedHaBridgeDb;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ha-bridge-db-'));
    opened = openHaBridgeDb(join(dir, 'ha-bridge.db'));
  });

  afterEach(() => {
    opened.raw.close();
  });

  it('runs the baseline migration and creates ha_entities + ha_state_history', () => {
    const tables = opened.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('ha_entities');
    expect(names).toContain('ha_state_history');
  });

  it('upserts an entity, derives the domain, and lifts standard attributes', () => {
    const row = upsertEntity(opened.db, {
      entityId: 'light.kitchen_ceiling',
      state: 'on',
      attributes: {
        friendly_name: 'Kitchen Ceiling',
        device_class: 'light',
        unit_of_measurement: '%',
      },
      area: 'kitchen',
      lastChanged: 1_700_000_000_000,
      lastSeen: 1_700_000_000_500,
    });
    expect(row.domain).toBe('light');
    expect(row.friendlyName).toBe('Kitchen Ceiling');
    expect(row.deviceClass).toBe('light');
    expect(row.unit).toBe('%');
    expect(row.area).toBe('kitchen');
    expect(row.state).toBe('on');

    const fromMirror = getEntity(opened.db, 'light.kitchen_ceiling');
    expect(fromMirror?.state).toBe('on');
  });

  it('replaces state + attributes on a second upsert of the same entity', () => {
    upsertEntity(opened.db, {
      entityId: 'sensor.kitchen_temperature',
      state: '21.0',
      attributes: {
        friendly_name: 'Kitchen Temp',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      },
      area: 'kitchen',
      lastChanged: 1,
      lastSeen: 1,
    });
    upsertEntity(opened.db, {
      entityId: 'sensor.kitchen_temperature',
      state: '22.4',
      attributes: {
        friendly_name: 'Kitchen Temp',
        device_class: 'temperature',
        unit_of_measurement: '°C',
      },
      area: 'kitchen',
      lastChanged: 2,
      lastSeen: 2,
    });

    const row = getEntity(opened.db, 'sensor.kitchen_temperature');
    expect(row?.state).toBe('22.4');
    expect(row?.lastChanged).toBe(2);

    const count = opened.raw
      .prepare('SELECT count(*) as c FROM ha_entities WHERE entity_id = ?')
      .get('sensor.kitchen_temperature') as { c: number };
    expect(count.c).toBe(1);
  });

  it('appends history rows and prunes by cutoff', () => {
    appendHistory(opened.db, {
      entityId: 'sensor.x',
      state: 'a',
      attributes: {},
      observedAt: 100,
    });
    appendHistory(opened.db, {
      entityId: 'sensor.x',
      state: 'b',
      attributes: {},
      observedAt: 200,
    });
    appendHistory(opened.db, {
      entityId: 'sensor.x',
      state: 'c',
      attributes: {},
      observedAt: 300,
    });

    const before = opened.db.select().from(haStateHistory).all();
    expect(before).toHaveLength(3);

    const removed = pruneHistory(opened.db, 250);
    expect(removed).toBe(2);

    const after = opened.db.select().from(haStateHistory).all();
    expect(after).toHaveLength(1);
    expect(after[0]?.state).toBe('c');
  });

  it('opens an existing db idempotently (no double-migrate)', () => {
    const path = opened.raw.name;
    opened.raw.close();
    const reopened = openHaBridgeDb(path);
    try {
      const tables = reopened.raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      expect(tables.map((t) => t.name)).toContain('ha_entities');
    } finally {
      reopened.raw.close();
      opened = reopened;
    }
  });
});
