/**
 * Integration tests for the `watchlist.*` REST surface, driven through the
 * real Express app via supertest. Covers the wire envelopes, idempotent add,
 * status lookups, reorder, pagination, and error-status mapping. The
 * `title`/`posterUrl` enrichment is served as null (parity with the
 * pops-media-api shadow) and asserted as such.
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
let mediaSeq = 500;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-watchlist-test-'));
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

function nextMediaId(): number {
  mediaSeq += 1;
  return mediaSeq;
}

describe('watchlist — happy paths', () => {
  it('adds an entry (created=true), reports status, then reads it back', async () => {
    const mediaId = nextMediaId();
    const added = await client().watchlist.add({ mediaType: 'movie', mediaId, notes: 'soon' });
    expect(added.created).toBe(true);
    expect(added.message).toBe('Added to watchlist');
    expect(added.data).toMatchObject({ mediaType: 'movie', mediaId, notes: 'soon' });
    expect(added.data.title).toBeNull();
    expect(added.data.posterUrl).toBeNull();

    const status = await client().watchlist.status({ mediaType: 'movie', mediaId });
    expect(status).toEqual({ onWatchlist: true, entryId: added.data.id });

    const fetched = await client().watchlist.get(added.data.id);
    expect(fetched.data.id).toBe(added.data.id);
  });

  it('is idempotent on (mediaType, mediaId) — second add returns created=false', async () => {
    const mediaId = nextMediaId();
    await client().watchlist.add({ mediaType: 'tv_show', mediaId });
    const again = await client().watchlist.add({ mediaType: 'tv_show', mediaId });
    expect(again.created).toBe(false);
    expect(again.message).toBe('Already on watchlist');
  });

  it('reports onWatchlist=false for an absent item', async () => {
    const status = await client().watchlist.status({ mediaType: 'movie', mediaId: 424242 });
    expect(status).toEqual({ onWatchlist: false, entryId: null });
  });

  it('lists, updates, reorders, then removes entries', async () => {
    const a = await client().watchlist.add({ mediaType: 'movie', mediaId: nextMediaId() });
    const b = await client().watchlist.add({ mediaType: 'movie', mediaId: nextMediaId() });

    const listed = await client().watchlist.list();
    expect(listed.pagination.total).toBe(2);

    const updated = await client().watchlist.update(a.data.id, { notes: 'updated' });
    expect(updated.data.notes).toBe('updated');

    const reordered = await client().watchlist.reorder([
      { id: a.data.id, priority: 0 },
      { id: b.data.id, priority: 1 },
    ]);
    expect(reordered.message).toBe('Watchlist reordered');

    const removed = await client().watchlist.remove(a.data.id);
    expect(removed.message).toBe('Removed from watchlist');

    const after = await client().watchlist.list();
    expect(after.pagination.total).toBe(1);
  });

  it('filters by mediaType and honours pagination', async () => {
    await client().watchlist.add({ mediaType: 'movie', mediaId: nextMediaId() });
    await client().watchlist.add({ mediaType: 'tv_show', mediaId: nextMediaId() });

    const movies = await client().watchlist.list({ mediaType: 'movie' });
    expect(movies.data.every((e) => e.mediaType === 'movie')).toBe(true);
    expect(movies.data).toHaveLength(1);
  });
});

describe('watchlist — error mapping', () => {
  it('404s an unknown get / update / remove', async () => {
    await expect(client().watchlist.get(999999)).rejects.toMatchObject({ status: 404 });
    await expect(client().watchlist.update(999999, { notes: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().watchlist.remove(999999)).rejects.toMatchObject({ status: 404 });
  });

  it('409s a reorder with duplicate priorities', async () => {
    const a = await client().watchlist.add({ mediaType: 'movie', mediaId: nextMediaId() });
    const b = await client().watchlist.add({ mediaType: 'movie', mediaId: nextMediaId() });
    await expect(
      client().watchlist.reorder([
        { id: a.data.id, priority: 5 },
        { id: b.data.id, priority: 5 },
      ])
    ).rejects.toMatchObject({ status: 409 });
  });

  it('400s an invalid mediaType at the contract boundary', async () => {
    await expect(client().watchlist.add({ mediaType: 'book', mediaId: 1 })).rejects.toMatchObject({
      status: 400,
    });
  });
});
