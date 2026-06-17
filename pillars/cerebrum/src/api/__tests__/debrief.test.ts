/**
 * Integration tests for `cerebrum.debrief.*` over REST (PRD-248).
 *
 * Boots the app against a per-test temp `cerebrum.db` (debrief tables present
 * via migration 0055) and exercises the surface end-to-end through the REST
 * client. Covers create→get round-trip, getByMedia, create idempotency,
 * record (404 without a session), dismiss (idempotent + 404),
 * deleteByWatchHistoryId cascade, and listPending pagination.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { TemplateRegistry } from '../modules/templates/registry.js';

let tmpDir: string;
let engramRoot: string;
let templateRegistry: TemplateRegistry;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-debrief-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-debrief-root-'));
  templateRegistry = makeTemplateRegistry();
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry,
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

describe('cerebrum.debrief.create + get', () => {
  it('round-trips a created session by id', async () => {
    const c = client();
    const { data: created } = await c.debrief.create({
      watchHistoryId: 10,
      mediaType: 'movie',
      mediaId: 42,
    });
    expect(created).toMatchObject({
      watchHistoryId: 10,
      mediaType: 'movie',
      mediaId: 42,
      status: 'pending',
    });

    const { data: fetched } = await c.debrief.get(created.id);
    expect(fetched).toEqual(created);
  });

  it('returns null for an unknown session id (benign miss, not 404)', async () => {
    const { data } = await client().debrief.get(99999);
    expect(data).toBeNull();
  });
});

describe('cerebrum.debrief.getByMedia', () => {
  it('returns the most recent pending session for the media tuple', async () => {
    const c = client();
    await c.debrief.create({ watchHistoryId: 1, mediaType: 'episode', mediaId: 7 });

    const { data } = await c.debrief.getByMedia('episode', 7);
    expect(data).toMatchObject({ mediaType: 'episode', mediaId: 7, status: 'pending' });
  });

  it('returns null when no session exists for the tuple', async () => {
    const { data } = await client().debrief.getByMedia('movie', 1234);
    expect(data).toBeNull();
  });
});

describe('cerebrum.debrief.create idempotency', () => {
  it('replaces a prior pending/active session for the same media tuple', async () => {
    const c = client();
    const first = await c.debrief.create({ watchHistoryId: 1, mediaType: 'movie', mediaId: 5 });
    const second = await c.debrief.create({ watchHistoryId: 2, mediaType: 'movie', mediaId: 5 });

    expect(second.data.id).not.toBe(first.data.id);

    const prior = await c.debrief.get(first.data.id);
    expect(prior.data).toBeNull();

    const byMedia = await c.debrief.getByMedia('movie', 5);
    expect(byMedia.data?.id).toBe(second.data.id);
    expect(byMedia.data?.watchHistoryId).toBe(2);
  });
});

describe('cerebrum.debrief.record', () => {
  it('records a result row against an existing session', async () => {
    const c = client();
    const { data: session } = await c.debrief.create({
      watchHistoryId: 3,
      mediaType: 'movie',
      mediaId: 9,
    });

    const { data: result } = await c.debrief.record({
      sessionId: session.id,
      dimensionId: 11,
      comparisonId: 22,
    });
    expect(result).toMatchObject({
      sessionId: session.id,
      dimensionId: 11,
      comparisonId: 22,
    });
  });

  it('accepts a null comparisonId (skipped dimension)', async () => {
    const c = client();
    const { data: session } = await c.debrief.create({
      watchHistoryId: 4,
      mediaType: 'movie',
      mediaId: 8,
    });

    const { data: result } = await c.debrief.record({
      sessionId: session.id,
      dimensionId: 12,
      comparisonId: null,
    });
    expect(result.comparisonId).toBeNull();
  });

  it('404s when the session does not exist', async () => {
    await expect(
      client().debrief.record({ sessionId: 77777, dimensionId: 1, comparisonId: null })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('cerebrum.debrief.dismiss', () => {
  it('transitions a session to complete', async () => {
    const c = client();
    const { data: session } = await c.debrief.create({
      watchHistoryId: 5,
      mediaType: 'episode',
      mediaId: 3,
    });

    const { data: dismissed } = await c.debrief.dismiss(session.id);
    expect(dismissed.status).toBe('complete');
  });

  it('is idempotent — re-dismissing a complete session is a no-op', async () => {
    const c = client();
    const { data: session } = await c.debrief.create({
      watchHistoryId: 6,
      mediaType: 'episode',
      mediaId: 4,
    });

    const first = await c.debrief.dismiss(session.id);
    const second = await c.debrief.dismiss(session.id);
    expect(second.data).toEqual(first.data);
    expect(second.data.status).toBe('complete');
  });

  it('404s on an unknown session id', async () => {
    await expect(client().debrief.dismiss(88888)).rejects.toMatchObject({ status: 404 });
  });
});

describe('cerebrum.debrief.logWatchCompletion', () => {
  it('creates a session and reports dimensionsQueued: 0', async () => {
    const result = await client().debrief.logWatchCompletion({
      watchHistoryId: 50,
      mediaType: 'movie',
      mediaId: 100,
    });
    expect(result.dimensionsQueued).toBe(0);
    expect(result.sessionId).toBeGreaterThan(0);
  });
});

describe('cerebrum.debrief.deleteByWatchHistoryId', () => {
  it('cascade-deletes sessions and their results', async () => {
    const c = client();
    const { data: session } = await c.debrief.create({
      watchHistoryId: 200,
      mediaType: 'movie',
      mediaId: 1,
    });
    await c.debrief.record({ sessionId: session.id, dimensionId: 1, comparisonId: 1 });
    await c.debrief.record({ sessionId: session.id, dimensionId: 2, comparisonId: null });

    const deleted = await c.debrief.deleteByWatchHistoryId(200);
    expect(deleted).toEqual({ deletedSessions: 1, deletedResults: 2 });

    const after = await c.debrief.get(session.id);
    expect(after.data).toBeNull();
  });

  it('returns zero counts for a watch_history id with no debrief rows', async () => {
    const deleted = await client().debrief.deleteByWatchHistoryId(999);
    expect(deleted).toEqual({ deletedSessions: 0, deletedResults: 0 });
  });
});

describe('cerebrum.debrief.listPending', () => {
  it('paginates pending sessions newest-first and reports the unpaged total', async () => {
    const c = client();
    for (let i = 0; i < 5; i++) {
      await c.debrief.create({ watchHistoryId: 300 + i, mediaType: 'movie', mediaId: 500 + i });
    }

    const page = await c.debrief.listPending({ limit: 2, offset: 1 });
    expect(page.pagination).toEqual({ limit: 2, offset: 1, total: 5 });
    expect(page.data).toHaveLength(2);
  });

  it('narrows by media tuple and excludes completed sessions', async () => {
    const c = client();
    const { data: keep } = await c.debrief.create({
      watchHistoryId: 1,
      mediaType: 'movie',
      mediaId: 1,
    });
    const { data: dismissMe } = await c.debrief.create({
      watchHistoryId: 2,
      mediaType: 'episode',
      mediaId: 2,
    });
    await c.debrief.dismiss(dismissMe.id);

    const all = await c.debrief.listPending();
    expect(all.pagination.total).toBe(1);
    expect(all.data[0]?.id).toBe(keep.id);

    const byMedia = await c.debrief.listPending({ mediaType: 'movie', mediaId: 1 });
    expect(byMedia.pagination.total).toBe(1);

    const otherMedia = await c.debrief.listPending({ mediaType: 'movie', mediaId: 999 });
    expect(otherMedia.pagination.total).toBe(0);
  });
});
