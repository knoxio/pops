/**
 * Integration tests for the `shelfImpressions.*` REST surface via supertest.
 * Covers recording, the recent-window aggregation, the freshness multiplier
 * + its 404 for untouched shelves, cleanup, and contract-boundary validation.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let mediaDb: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-shelf-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createMediaApiApp({ mediaDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3003' })
  );
}

describe('shelf-impressions', () => {
  it('records impressions and aggregates them in the recent window', async () => {
    const recorded = await client().shelfImpressions.record(['shelf:a', 'genre/action']);
    expect(recorded).toEqual({ ok: true, recorded: 2 });

    const recent = await client().shelfImpressions.recent();
    expect(recent.windowDays).toBe(7);
    const byId = new Map(recent.entries.map((e) => [e.shelfId, e.impressionCount]));
    expect(byId.get('shelf:a')).toBe(1);
    expect(byId.get('genre/action')).toBe(1);
  });

  it('accumulates repeat impressions for the same shelf', async () => {
    await client().shelfImpressions.record(['shelf:b']);
    await client().shelfImpressions.record(['shelf:b']);
    const fresh = await client().shelfImpressions.freshness({ shelfId: 'shelf:b' });
    expect(fresh.impressionCount).toBe(2);
    expect(fresh.freshness).toBeGreaterThan(0);
    expect(fresh.freshness).toBeLessThanOrEqual(1);
  });

  it('404s freshness for a shelf with no impressions', async () => {
    await expect(
      client().shelfImpressions.freshness({ shelfId: 'never-shown' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('cleanup is idempotent and returns ok', async () => {
    const result = await client().shelfImpressions.cleanup();
    expect(result).toEqual({ ok: true });
  });

  it('400s an empty shelfIds array at the contract boundary', async () => {
    await expect(client().shelfImpressions.record([])).rejects.toMatchObject({ status: 400 });
  });

  it('400s a shelfId that violates the id charset', async () => {
    await expect(client().shelfImpressions.record(['has spaces!'])).rejects.toMatchObject({
      status: 400,
    });
  });
});
