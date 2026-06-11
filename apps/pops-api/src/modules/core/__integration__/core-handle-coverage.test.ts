/**
 * Core pillar handle smoke harness.
 *
 * Same shape + intent as the finance smoke harness — opens a fresh
 * per-pillar `core.db` via `openCoreDb(':memory:')` (so the in-package
 * journal applies end-to-end) and exercises every query under
 * `appRouter.core.*`. Catches `SqliteError: no such table` regressions
 * before they ship.
 *
 * Several `core.*` procedures cross-pillar into other pillar handles
 * (e.g. `core.tagRules.listVocabulary` reads via `getFinanceDrizzle()` —
 * the Track N4 #2908 cutover). For those to exercise the right path the
 * smoke harness ALSO points `setFinanceDb` at a fresh per-pillar finance
 * DB. If the cross-pillar table is missing from EITHER package journal,
 * the failure surfaces here.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '@pops/cerebrum-db';
import { openCoreDb, type OpenedCoreDb } from '@pops/core-db';
import { openFinanceDb, type OpenedFinanceDb } from '@pops/finance-db';
import { openInventoryDb, type OpenedInventoryDb } from '@pops/inventory-db';
import { openMediaDb, type OpenedMediaDb } from '@pops/media-db';

import { closeDb, setCoreDb, setDb } from '../../../db.js';
import { setCerebrumDb } from '../../../db/cerebrum-handle.js';
import { setFinanceDb } from '../../../db/finance-handle.js';
import { setInventoryDb } from '../../../db/inventory-handle.js';
import { setMediaDb } from '../../../db/media-db-handle.js';
import { appRouter } from '../../../router.js';
import {
  enumeratePillarQueries,
  runPillarSmokeHarness,
  type PillarSmokeInputs,
} from '../../../shared/pillar-smoke-harness.js';
import { createCaller, createTestDb } from '../../../shared/test-utils.js';

const CORE_INPUTS: PillarSmokeInputs = {
  'core.entities.list': {},
  'core.entities.get': { id: 'nonexistent-entity-id' },
  'core.aiProviders.get': { id: 'nonexistent-provider-id' },
  'core.aiBudgets.getBudgetStatus': { scope: 'global' },
  'core.aiAlerts.rules.get': { id: 1 },
  'core.corrections.get': { id: 'nonexistent-correction-id' },
  'core.corrections.findMatch': { description: 'Smoke probe' },
  'core.corrections.previewMatches': { signal: { description: 'Smoke probe' } },
  'core.jobs.get': { id: 'nonexistent-job-id' },
  'core.embeddings.search': { query: 'smoke probe', limit: 1 },
  'core.tagRules.proposeTagRuleChangeSet': {
    signal: { description: 'Smoke probe', tags: ['Smoke'] },
    transactions: [],
  },
  'core.tagRules.previewTagRuleChangeSet': {
    changeSet: { add: [], edit: [], remove: [], disable: [] },
    transactions: [],
  },
  'core.settings.get': { key: 'nonexistent.key' },
  'core.settings.getBulk': { keys: ['nonexistent.key'] },
  'core.features.isEnabled': { id: 'nonexistent-feature' },
  'core.search.query': { text: 'smoke', context: { app: null, page: null } },
  'core.search.showMore': {
    domain: 'transactions',
    text: 'smoke',
    context: { app: null, page: null },
  },
  'core.uri.resolve': { uri: 'pops:core/probe/none' },
};

let coreHandle: OpenedCoreDb | null = null;
let financeHandle: OpenedFinanceDb | null = null;
let inventoryHandle: OpenedInventoryDb | null = null;
let mediaHandle: OpenedMediaDb | null = null;
let cerebrumHandle: OpenedCerebrumDb | null = null;

beforeEach(() => {
  setDb(createTestDb());
  coreHandle = openCoreDb(':memory:');
  financeHandle = openFinanceDb(':memory:');
  inventoryHandle = openInventoryDb(':memory:');
  mediaHandle = openMediaDb(':memory:');
  cerebrumHandle = openCerebrumDb(':memory:');
  setCoreDb(coreHandle);
  setFinanceDb(financeHandle);
  setInventoryDb(inventoryHandle);
  setMediaDb(mediaHandle);
  setCerebrumDb(cerebrumHandle);
});

afterEach(() => {
  setCoreDb(null);
  setFinanceDb(null);
  setInventoryDb(null);
  setMediaDb(null);
  setCerebrumDb(null);
  coreHandle?.raw.close();
  financeHandle?.raw.close();
  inventoryHandle?.raw.close();
  mediaHandle?.raw.close();
  cerebrumHandle?.raw.close();
  coreHandle = null;
  financeHandle = null;
  inventoryHandle = null;
  mediaHandle = null;
  cerebrumHandle = null;
  closeDb();
});

describe('core pillar handle smoke harness', () => {
  it('enumerates at least one core query procedure (sanity)', () => {
    const queries = enumeratePillarQueries(appRouter, 'core');
    expect(queries.length).toBeGreaterThan(0);
  });

  it('every core query reaches its table on a fresh per-pillar DB', async () => {
    const caller = createCaller(true);
    const failures = await runPillarSmokeHarness(appRouter, caller, 'core', {
      inputs: CORE_INPUTS,
    });

    if (failures.length > 0) {
      const detail = failures.map((f) => `  - ${f.path}: ${f.message}`).join('\n');
      throw new Error(
        `Core pillar smoke harness found ${failures.length.toString()} ` +
          `"no such table" failure(s). One of the pillar journals is ` +
          `missing a table that these procedures expect (note: core ` +
          `procedures often read via other pillar handles — e.g. ` +
          `core.tagRules.* uses getFinanceDrizzle()):\n${detail}`
      );
    }

    expect(failures).toEqual([]);
  });

  it('runs the entire core smoke pass quickly (<5s)', async () => {
    const caller = createCaller(true);
    const started = Date.now();
    await runPillarSmokeHarness(appRouter, caller, 'core', { inputs: CORE_INPUTS });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(5000);
  });
});
