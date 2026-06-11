/**
 * Cerebrum pillar handle smoke harness.
 *
 * Opens a fresh per-pillar `cerebrum.db` via `openCerebrumDb(':memory:')`
 * and exercises every query under `appRouter.cerebrum.*` AND
 * `appRouter.ego.*` (cerebrum-ego is a sibling manifest mounted at the
 * `ego` top-level id but owned by the cerebrum module). Catches
 * `SqliteError: no such table` for cutovers that resolve through
 * `getCerebrumDrizzle()`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';

import { closeDb, setDb } from '../../../db.js';
import { setCerebrumDb } from '../../../db/cerebrum-handle.js';
import { appRouter } from '../../../router.js';
import {
  enumeratePillarQueries,
  runPillarSmokeHarness,
  type PillarSmokeInputs,
} from '../../../shared/pillar-smoke-harness.js';
import { createCaller, createTestDb } from '../../../shared/test-utils.js';

/**
 * Procedures that read via the shared `getDrizzle()` (NOT
 * `getCerebrumDrizzle()`) and touch tables the simplified `createTestDb()`
 * fixture doesn't carry. Each entry cites the table + reason so a
 * future cutover-to-pillar removes the entry once the call resolves
 * via `getCerebrumDrizzle()`.
 */
const CEREBRUM_IGNORE = new Set<string>([
  // `plexus_adapters` lives on the shared schema (see src/db/schema.ts) but
  // is NOT in createTestDb's synthetic fixture. Pillar handle not involved.
  'cerebrum.plexus.adapters.list',
  // `reflex_executions` — same shared-only situation.
  'cerebrum.reflex.history',
  // `embeddings_vec` is a sqlite-vec virtual table that requires the
  // extension to be loaded — createTestDb doesn't bind sqlite-vec so the
  // table can't exist in this fixture. Pillar handle not involved.
  'cerebrum.retrieval.similar',
]);

const CEREBRUM_INPUTS: PillarSmokeInputs = {
  'cerebrum.engrams.get': { id: 'nonexistent-engram-id' },
  'cerebrum.scopes.validate': { scopes: [] },
  'cerebrum.scopes.reconcile': { scopes: [] },
  'cerebrum.scopes.filter': { scopes: [] },
  'cerebrum.templates.get': { id: 'nonexistent-template-id' },
  'cerebrum.retrieval.search': { query: 'smoke' },
  'cerebrum.retrieval.context': { query: 'smoke' },
  'cerebrum.retrieval.similar': { engramId: 'nonexistent-engram-id' },
  'cerebrum.ingest.preview': { content: 'smoke' },
  'cerebrum.ingest.classify': { content: 'smoke' },
  'cerebrum.ingest.extractEntities': { content: 'smoke' },
  'cerebrum.ingest.inferScopes': { content: 'smoke' },
  'cerebrum.ingest.enrichmentStatus': { engramId: 'nonexistent-engram-id' },
  'cerebrum.query.retrieve': { query: 'smoke' },
  'cerebrum.query.explain': { query: 'smoke' },
  'cerebrum.emit.preview': { engramId: 'nonexistent-engram-id' },
  'cerebrum.glia.actions.get': { id: 'nonexistent-action-id' },
  'cerebrum.glia.actions.history': { engramId: 'nonexistent-engram-id' },
  'cerebrum.glia.trustState.get': { actionType: 'tag' },
  'cerebrum.glia.getStalenessScore': { engramId: 'nonexistent-engram-id' },
  'cerebrum.glia.getQualityScore': { engramId: 'nonexistent-engram-id' },
  'cerebrum.nudges.get': { id: 'nonexistent-nudge-id' },
  'cerebrum.plexus.adapters.get': { id: 'nonexistent-adapter-id' },
  'cerebrum.reflex.get': { id: 'nonexistent-reflex-id' },
  'ego.conversations.get': { id: 'nonexistent-conversation-id' },
};

let cerebrumHandle: OpenedCerebrumDb | null = null;

beforeEach(() => {
  setDb(createTestDb());
  cerebrumHandle = openCerebrumDb(':memory:');
  setCerebrumDb(cerebrumHandle);
});

afterEach(() => {
  setCerebrumDb(null);
  cerebrumHandle?.raw.close();
  cerebrumHandle = null;
  closeDb();
});

describe('cerebrum pillar handle smoke harness', () => {
  it('enumerates at least one cerebrum query procedure (sanity)', () => {
    const queries = enumeratePillarQueries(appRouter, 'cerebrum');
    expect(queries.length).toBeGreaterThan(0);
  });

  it('every cerebrum query reaches its table on a fresh per-pillar DB', async () => {
    const caller = createCaller(true);
    const cerebrumFailures = await runPillarSmokeHarness(appRouter, caller, 'cerebrum', {
      inputs: CEREBRUM_INPUTS,
      ignorePaths: CEREBRUM_IGNORE,
    });
    const egoFailures = await runPillarSmokeHarness(appRouter, caller, 'ego', {
      inputs: CEREBRUM_INPUTS,
      ignorePaths: CEREBRUM_IGNORE,
    });
    const failures = [...cerebrumFailures, ...egoFailures];

    if (failures.length > 0) {
      const detail = failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n');
      throw new Error(
        `Cerebrum pillar smoke harness found ${failures.length.toString()} ` +
          `"no such table" failure(s). The fresh per-pillar cerebrum.db ` +
          `is missing one or more tables that these procedures expect:\n${detail}`
      );
    }

    expect(failures).toEqual([]);
  });

  it('runs the entire cerebrum + ego smoke pass quickly (<5s)', async () => {
    const caller = createCaller(true);
    const started = Date.now();
    await runPillarSmokeHarness(appRouter, caller, 'cerebrum', {
      inputs: CEREBRUM_INPUTS,
      ignorePaths: CEREBRUM_IGNORE,
    });
    await runPillarSmokeHarness(appRouter, caller, 'ego', {
      inputs: CEREBRUM_INPUTS,
      ignorePaths: CEREBRUM_IGNORE,
    });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
  });
});
