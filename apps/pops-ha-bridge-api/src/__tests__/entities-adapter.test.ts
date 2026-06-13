import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openHaBridgeDb, upsertEntity, type OpenedHaBridgeDb } from '@pops/ha-bridge-db';

import {
  HA_ENTITIES_ADAPTER_NAME,
  HA_ENTITIES_ENTITY_TYPE,
  HA_ENTITIES_PROCEDURE_PATH,
  runHaEntitiesSearch,
  type HaEntityHitData,
} from '../search/entities-adapter.js';

function isHaEntityHitData(value: unknown): value is HaEntityHitData {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['id'] === 'string' &&
    typeof v['label'] === 'string' &&
    typeof v['domain'] === 'string' &&
    typeof v['state'] === 'string' &&
    typeof v['snippet'] === 'string'
  );
}

describe('ha bridge entities-adapter', () => {
  let opened: OpenedHaBridgeDb;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ha-bridge-adapter-'));
    opened = openHaBridgeDb(join(dir, 'ha-bridge.db'));
  });

  afterEach(() => {
    opened.raw.close();
  });

  it('exports stable identifiers', () => {
    expect(HA_ENTITIES_ADAPTER_NAME).toBe('haEntities');
    expect(HA_ENTITIES_ENTITY_TYPE).toBe('ha-entity');
    expect(HA_ENTITIES_PROCEDURE_PATH).toBe('habridge.entities.search');
  });

  it('returns [] for missing / empty / whitespace-only text', () => {
    upsertEntity(opened.db, {
      entityId: 'sensor.kitchen_temperature',
      state: '21',
      attributes: { friendly_name: 'Kitchen Temp', device_class: 'temperature' },
      area: 'kitchen',
      lastChanged: 1,
      lastSeen: 1,
    });

    expect(runHaEntitiesSearch(opened.db, {})).toEqual([]);
    expect(runHaEntitiesSearch(opened.db, { text: '' })).toEqual([]);
    expect(runHaEntitiesSearch(opened.db, { text: '   ' })).toEqual([]);
  });

  it('returns ScoredResult-shaped rows the orchestrator can consume', () => {
    upsertEntity(opened.db, {
      entityId: 'sensor.kitchen_temperature',
      state: '21.4',
      attributes: { friendly_name: 'Kitchen Temp', device_class: 'temperature' },
      area: 'kitchen',
      lastChanged: 1,
      lastSeen: 1,
    });

    const results = runHaEntitiesSearch(opened.db, { text: 'kitchen temperature' });
    expect(results.length).toBeGreaterThan(0);
    const top = results[0];
    expect(top).toBeDefined();
    expect(typeof top?.score).toBe('number');
    expect(top?.entityName).toBe('Kitchen Temp');
    expect(isHaEntityHitData(top?.data)).toBe(true);
    if (top !== undefined && isHaEntityHitData(top.data)) {
      expect(top.data.id).toBe('sensor.kitchen_temperature');
      expect(top.data.area).toBe('kitchen');
      expect(top.data.deviceClass).toBe('temperature');
      expect(top.data.state).toBe('21.4');
      expect(top.data.domain).toBe('sensor');
    }
  });

  it('falls back to entity_id when the friendly name is missing', () => {
    upsertEntity(opened.db, {
      entityId: 'sensor.cellar_humidity',
      state: '55',
      attributes: { device_class: 'humidity' },
      area: 'cellar',
      lastChanged: 1,
      lastSeen: 1,
    });
    const results = runHaEntitiesSearch(opened.db, { text: 'cellar' });
    expect(results[0]?.entityName).toBe('sensor.cellar_humidity');
  });

  it('ranks an exact area+device-class match above a pure name match', () => {
    upsertEntity(opened.db, {
      entityId: 'sensor.kitchen_temperature',
      state: '21.4',
      attributes: { friendly_name: 'Kitchen Temp', device_class: 'temperature' },
      area: 'kitchen',
      lastChanged: 1,
      lastSeen: 1,
    });
    upsertEntity(opened.db, {
      entityId: 'sensor.garage_outdoor',
      state: '8',
      attributes: {
        friendly_name: 'Garage Outdoor Kitchen Temperature Probe',
        device_class: 'temperature',
      },
      area: 'garage',
      lastChanged: 1,
      lastSeen: 1,
    });

    const results = runHaEntitiesSearch(opened.db, { text: 'kitchen temperature' });
    expect(results[0]?.entityName).toBe('Kitchen Temp');
  });

  it('honours the limit option', () => {
    for (let i = 0; i < 5; i += 1) {
      upsertEntity(opened.db, {
        entityId: `sensor.kitchen_probe_${i}`,
        state: String(i),
        attributes: { friendly_name: `Kitchen Probe ${i}`, device_class: 'temperature' },
        area: 'kitchen',
        lastChanged: 1,
        lastSeen: 1,
      });
    }
    const results = runHaEntitiesSearch(opened.db, { text: 'kitchen', limit: 2 });
    expect(results).toHaveLength(2);
  });
});
