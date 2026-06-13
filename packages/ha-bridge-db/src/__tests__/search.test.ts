import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openHaBridgeDb, searchEntities, upsertEntity, type OpenedHaBridgeDb } from '../index.js';

interface FtsRow {
  entity_id: string;
  friendly_name: string;
  domain: string;
  area: string;
  device_class: string;
  attributes_searchable: string;
}

describe('ha-bridge-db search (FTS5)', () => {
  let opened: OpenedHaBridgeDb;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'ha-bridge-search-'));
    opened = openHaBridgeDb(join(dir, 'ha-bridge.db'));
  });

  afterEach(() => {
    opened.raw.close();
  });

  function ftsRows(): FtsRow[] {
    return opened.raw
      .prepare(
        'SELECT entity_id, friendly_name, domain, area, device_class, attributes_searchable FROM ha_entities_fts ORDER BY entity_id'
      )
      .all() as FtsRow[];
  }

  it('creates the ha_entities_fts virtual table and triggers', () => {
    const tables = opened.raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toContain('ha_entities_fts');

    const triggers = opened.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='ha_entities' ORDER BY name"
      )
      .all() as { name: string }[];
    expect(triggers.map((t) => t.name)).toEqual([
      'ha_entities_fts_ad',
      'ha_entities_fts_ai',
      'ha_entities_fts_au',
    ]);
  });

  describe('trigger sync', () => {
    it('mirrors an INSERT into the FTS table', () => {
      upsertEntity(opened.db, {
        entityId: 'sensor.kitchen_temperature',
        state: '21.4',
        attributes: {
          friendly_name: 'Kitchen Temp',
          device_class: 'temperature',
          unit_of_measurement: '°C',
        },
        area: 'kitchen',
        lastChanged: 1,
        lastSeen: 1,
      });

      const rows = ftsRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entity_id).toBe('sensor.kitchen_temperature');
      expect(rows[0]?.friendly_name).toBe('Kitchen Temp');
      expect(rows[0]?.area).toBe('kitchen');
      expect(rows[0]?.device_class).toBe('temperature');
      expect(rows[0]?.attributes_searchable).toContain('Kitchen Temp');
      expect(rows[0]?.attributes_searchable).toContain('temperature');
    });

    it('reflects an UPDATE (entity renamed) in the FTS table', () => {
      upsertEntity(opened.db, {
        entityId: 'sensor.kitchen_temperature',
        state: '21.4',
        attributes: { friendly_name: 'Kitchen Temp', device_class: 'temperature' },
        area: 'kitchen',
        lastChanged: 1,
        lastSeen: 1,
      });
      upsertEntity(opened.db, {
        entityId: 'sensor.kitchen_temperature',
        state: '22.0',
        attributes: { friendly_name: 'Pantry Thermometer', device_class: 'temperature' },
        area: 'pantry',
        lastChanged: 2,
        lastSeen: 2,
      });

      const rows = ftsRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.friendly_name).toBe('Pantry Thermometer');
      expect(rows[0]?.area).toBe('pantry');
    });

    it('removes the FTS row on DELETE', () => {
      upsertEntity(opened.db, {
        entityId: 'switch.lamp',
        state: 'off',
        attributes: { friendly_name: 'Lamp', device_class: 'switch' },
        area: 'office',
        lastChanged: 1,
        lastSeen: 1,
      });
      expect(ftsRows()).toHaveLength(1);

      opened.raw.prepare('DELETE FROM ha_entities WHERE entity_id = ?').run('switch.lamp');
      expect(ftsRows()).toHaveLength(0);
    });
  });

  describe('searchEntities ranking', () => {
    function seed(): void {
      upsertEntity(opened.db, {
        entityId: 'sensor.kitchen_temperature',
        state: '21.4',
        attributes: { friendly_name: 'Kitchen Temp', device_class: 'temperature' },
        area: 'kitchen',
        lastChanged: 1,
        lastSeen: 1,
      });
      upsertEntity(opened.db, {
        entityId: 'sensor.living_room_temperature',
        state: '22.1',
        attributes: { friendly_name: 'Living Room Temp', device_class: 'temperature' },
        area: 'living_room',
        lastChanged: 1,
        lastSeen: 1,
      });
      upsertEntity(opened.db, {
        entityId: 'light.kitchen_ceiling',
        state: 'on',
        attributes: { friendly_name: 'Kitchen Ceiling', device_class: 'light' },
        area: 'kitchen',
        lastChanged: 1,
        lastSeen: 1,
      });
      upsertEntity(opened.db, {
        entityId: 'sensor.bedroom_motion',
        state: 'off',
        attributes: { friendly_name: 'Bedroom Motion', device_class: 'motion' },
        area: 'bedroom',
        lastChanged: 1,
        lastSeen: 1,
      });
    }

    it('ranks an exact area + device_class match above pure friendly-name matches', () => {
      seed();
      const hits = searchEntities(opened.db, 'kitchen temperature');
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0]?.entityId).toBe('sensor.kitchen_temperature');
    });

    it('returns ranked snippets with a [marker] around matched tokens', () => {
      seed();
      const hits = searchEntities(opened.db, 'kitchen');
      expect(hits[0]?.snippet).toContain('[');
      expect(hits[0]?.snippet).toContain(']');
    });

    it('boosts area-token matches over results in other areas', () => {
      seed();
      const hits = searchEntities(opened.db, 'bedroom');
      const ids = hits.map((h) => h.entityId);
      expect(ids).toContain('sensor.bedroom_motion');
      expect(ids[0]).toBe('sensor.bedroom_motion');
    });

    it('honours the limit option', () => {
      seed();
      const hits = searchEntities(opened.db, 'kitchen temperature', { limit: 1 });
      expect(hits).toHaveLength(1);
    });

    it('returns [] for an empty or whitespace-only query', () => {
      seed();
      expect(searchEntities(opened.db, '')).toEqual([]);
      expect(searchEntities(opened.db, '   ')).toEqual([]);
    });

    it('returns [] when the index is empty (cold boot)', () => {
      expect(searchEntities(opened.db, 'kitchen')).toEqual([]);
    });

    it('returns [] when nothing matches', () => {
      seed();
      expect(searchEntities(opened.db, 'thereisnosuchentity')).toEqual([]);
    });

    it('reflects a rename — query matches the new name, not the old one', () => {
      upsertEntity(opened.db, {
        entityId: 'sensor.x',
        state: '1',
        attributes: { friendly_name: 'Hallway Probe', device_class: 'temperature' },
        area: 'hallway',
        lastChanged: 1,
        lastSeen: 1,
      });
      upsertEntity(opened.db, {
        entityId: 'sensor.x',
        state: '1',
        attributes: { friendly_name: 'Garage Probe', device_class: 'temperature' },
        area: 'garage',
        lastChanged: 2,
        lastSeen: 2,
      });

      expect(searchEntities(opened.db, 'hallway')).toEqual([]);
      const garage = searchEntities(opened.db, 'garage');
      expect(garage[0]?.entityId).toBe('sensor.x');
    });

    it('all hits carry a score in (0, ~1+boosts]', () => {
      seed();
      const hits = searchEntities(opened.db, 'kitchen temperature');
      for (const hit of hits) {
        expect(hit.score).toBeGreaterThan(0);
        expect(hit.score).toBeLessThanOrEqual(1.6);
      }
    });
  });
});
