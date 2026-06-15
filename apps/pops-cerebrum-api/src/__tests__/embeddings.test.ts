/**
 * tRPC caller tests for the read-only `cerebrum.embeddings.*` SDK
 * surface mounted by PRD-249 US-02.
 *
 * Drives `appRouter.createCaller(ctx)` against a per-test in-memory
 * cerebrum.db. Locks in the wire-shape contract for the two procedures
 * the consumer (`apps/pops-api/src/modules/core/embeddings/service.ts`)
 * flips onto in PRD-249 US-03:
 *
 *   - `getStatus({ sourceType? })` — total count, optionally filtered.
 *     `pending` / `stale` placeholder values mirror today's
 *     `service.ts:128` semantics (always 0 at this surface).
 *   - `listSourceIdsByType({ sourceType })` — distinct source ids for a
 *     given source type. Empty list for unknown types.
 *
 * Persistence-layer behaviour (insert / unique constraint) is already
 * covered by `packages/cerebrum-db/src/__tests__/embeddings.test.ts` — we
 * exercise only the router-level read contract here.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { embeddings, openCerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';
import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';

import { appRouter } from '../router.js';
import { type Context } from '../trpc.js';

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-embeddings-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  cerebrumDb.raw.close();
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface SeedEmbedding {
  sourceType: string;
  sourceId: string;
  chunkIndex?: number;
}

function seed(rows: SeedEmbedding[]): void {
  const now = new Date().toISOString();
  for (const r of rows) {
    cerebrumDb.db
      .insert(embeddings)
      .values({
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        chunkIndex: r.chunkIndex ?? 0,
        contentHash: `hash-${r.sourceType}-${r.sourceId}-${r.chunkIndex ?? 0}`,
        contentPreview: `preview-${r.sourceId}`,
        model: 'test-model',
        dimensions: 1536,
        createdAt: now,
      })
      .run();
  }
}

function userCaller(email = 'user@example.com'): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: { email },
    serviceAccount: null,
    coreDb: coreDb.db,
    cerebrumDb: cerebrumDb.db,
  };
  return appRouter.createCaller(ctx);
}

function anonCaller(): ReturnType<typeof appRouter.createCaller> {
  const ctx: Context = {
    user: null,
    serviceAccount: null,
    coreDb: coreDb.db,
    cerebrumDb: cerebrumDb.db,
  };
  return appRouter.createCaller(ctx);
}

describe('cerebrum.embeddings.getStatus (tRPC caller)', () => {
  it('returns zero counts when the embeddings table is empty', async () => {
    const result = await userCaller().cerebrum.embeddings.getStatus({});
    expect(result).toEqual({ total: 0, pending: 0, stale: 0 });
  });

  it('returns the total across all source types when no filter is given', async () => {
    seed([
      { sourceType: 'transactions', sourceId: 'tx-1' },
      { sourceType: 'transactions', sourceId: 'tx-2' },
      { sourceType: 'notes', sourceId: 'note-1' },
    ]);
    const result = await userCaller().cerebrum.embeddings.getStatus({});
    expect(result).toEqual({ total: 3, pending: 0, stale: 0 });
  });

  it('returns the filtered count when sourceType is provided', async () => {
    seed([
      { sourceType: 'transactions', sourceId: 'tx-1' },
      { sourceType: 'transactions', sourceId: 'tx-2' },
      { sourceType: 'notes', sourceId: 'note-1' },
    ]);
    const result = await userCaller().cerebrum.embeddings.getStatus({
      sourceType: 'transactions',
    });
    expect(result).toEqual({ total: 2, pending: 0, stale: 0 });
  });

  it('returns zeros for an unknown source type', async () => {
    seed([{ sourceType: 'transactions', sourceId: 'tx-1' }]);
    const result = await userCaller().cerebrum.embeddings.getStatus({
      sourceType: 'unknown',
    });
    expect(result).toEqual({ total: 0, pending: 0, stale: 0 });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(anonCaller().cerebrum.embeddings.getStatus({})).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });
});

describe('cerebrum.embeddings.listSourceIdsByType (tRPC caller)', () => {
  it('returns an empty list when no embeddings exist for the type', async () => {
    const result = await userCaller().cerebrum.embeddings.listSourceIdsByType({
      sourceType: 'transactions',
    });
    expect(result).toEqual({ sourceIds: [] });
  });

  it('returns the distinct source ids for the given source type', async () => {
    seed([
      { sourceType: 'transactions', sourceId: 'tx-1', chunkIndex: 0 },
      { sourceType: 'transactions', sourceId: 'tx-1', chunkIndex: 1 },
      { sourceType: 'transactions', sourceId: 'tx-2' },
      { sourceType: 'notes', sourceId: 'note-1' },
    ]);
    const result = await userCaller().cerebrum.embeddings.listSourceIdsByType({
      sourceType: 'transactions',
    });
    expect(result.sourceIds.toSorted()).toEqual(['tx-1', 'tx-2']);
  });

  it('does not leak source ids from other source types', async () => {
    seed([
      { sourceType: 'transactions', sourceId: 'tx-1' },
      { sourceType: 'notes', sourceId: 'note-1' },
      { sourceType: 'notes', sourceId: 'note-2' },
    ]);
    const result = await userCaller().cerebrum.embeddings.listSourceIdsByType({
      sourceType: 'notes',
    });
    expect(result.sourceIds.toSorted()).toEqual(['note-1', 'note-2']);
  });

  it('rejects an empty sourceType at the input schema boundary', async () => {
    await expect(
      userCaller().cerebrum.embeddings.listSourceIdsByType({ sourceType: '' })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'BAD_REQUEST',
    });
  });

  it('rejects an anonymous caller (UNAUTHORIZED)', async () => {
    await expect(
      anonCaller().cerebrum.embeddings.listSourceIdsByType({ sourceType: 'transactions' })
    ).rejects.toMatchObject({
      name: 'TRPCError',
      code: 'UNAUTHORIZED',
    });
  });
});
