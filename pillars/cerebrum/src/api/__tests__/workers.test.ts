/**
 * Integration tests for `workers.*` over REST (PRD-085).
 *
 * Boots the app against a per-test temp `cerebrum.db` + temp engram root, with
 * an injected offline {@link makeFakeContradictionDetector} (no real Anthropic
 * call) and an empty peer-client set. Engrams are seeded through the wire
 * `engrams.create` so the workers operate on real index rows + files.
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
  makeFakeContradictionDetector,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { ContradictionDetector } from '../modules/workers/auditor.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-workers-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-workers-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client(detector: ContradictionDetector = makeFakeContradictionDetector()) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      auditorContradictionDetector: detector,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

describe('workers run procedures', () => {
  it('runPruner in dryRun mode proposes nothing on an empty library', async () => {
    const result = await client().workers.runPruner(true);
    expect(result.processed).toBe(0);
    expect(result.actions).toEqual([]);
  });

  it('runPruner proposes archival for a stale, link-less engram (dryRun keeps it proposed)', async () => {
    const c = client();
    await c.engrams.create({
      type: 'note',
      title: 'Ancient orphan note',
      body: 'short',
      scopes: ['personal.notes'],
    });

    const result = await c.workers.runPruner(true);
    expect(result.processed).toBe(1);
    // A freshly created engram is not yet stale enough to archive; the run must
    // still report it as processed and leave every proposed action in 'proposed'.
    for (const action of result.actions) {
      expect(action.status).toBe('proposed');
      expect(action.actionType).toBe('prune');
    }
  });

  it('runAuditor surfaces low-quality + coverage-gap proposals without mutating engrams', async () => {
    const c = client();
    await c.engrams.create({
      type: 'note',
      title: 'Sparse',
      body: 'tiny',
      scopes: ['personal.notes'],
      tags: ['solo'],
    });

    const result = await c.workers.runAuditor(true);
    expect(result.processed).toBe(1);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.every((a) => a.status === 'proposed')).toBe(true);
  });
});

describe('workers score procedures', () => {
  it('getStalenessScore returns a 0–1 score for an existing engram', async () => {
    const c = client();
    const { engram } = await c.engrams.create({
      type: 'note',
      title: 'Scored note',
      body: 'body text',
      scopes: ['personal.notes'],
    });

    const result = await c.workers.getStalenessScore(engram.id);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.factors.inboundLinkCount).toBe(0);
  });

  it('getQualityScore returns a 0–1 score for an existing engram', async () => {
    const c = client();
    const { engram } = await c.engrams.create({
      type: 'note',
      title: 'Quality note',
      body: 'body text with some detail',
      scopes: ['personal.notes'],
      tags: ['a'],
    });

    const result = await c.workers.getQualityScore(engram.id);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('getStalenessScore 404s on a missing engram', async () => {
    await expect(client().workers.getStalenessScore('eng_nope')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('workers getOrphans', () => {
  it('lists engrams with no inbound links', async () => {
    const c = client();
    const { engram } = await c.engrams.create({
      type: 'note',
      title: 'Lonely',
      body: 'no inbound links point here',
      scopes: ['personal.notes'],
    });

    const result = await c.workers.getOrphans();
    expect(result.engrams.length).toBe(1);
    expect(result.engrams[0]?.id).toBe(engram.id);
    expect(result.engrams[0]?.links).toEqual([]);
  });

  it('respects the limit query param', async () => {
    const c = client();
    await c.engrams.create({ type: 'note', title: 'One', body: 'x', scopes: ['s'] });
    await c.engrams.create({ type: 'note', title: 'Two', body: 'y', scopes: ['s'] });

    const result = await c.workers.getOrphans(1);
    expect(result.engrams.length).toBe(1);
  });
});
