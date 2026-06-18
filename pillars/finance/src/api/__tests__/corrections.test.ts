/**
 * Integration tests for the `corrections.*` REST surface — the deterministic
 * CRUD over the finance-owned `transaction_corrections` table.
 *
 * Covers the happy paths (list + filters + pagination, get, createOrUpdate
 * with reinforcement, update, delete, adjustConfidence incl. the
 * confidence-floor GC, findMatch classification, previewMatches against the
 * transactions table), the 404s on unknown ids, and request-validation 400s.
 *
 * Transactions for the previewMatches test are seeded through the finance-db
 * service directly (no REST create-transaction is needed for setup), so the
 * test exercises the real matcher against real rows.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, transactionsService, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-corrections-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({ financeDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3004' })
  );
}

describe('corrections — createOrUpdate, get & list', () => {
  it('creates a correction, then reinforces it on a second create', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS METRO',
      matchType: 'contains',
      entityName: 'Woolworths',
      tags: ['groceries'],
    });
    expect(created.message).toBe('Correction saved');
    expect(created.data).toMatchObject({
      descriptionPattern: 'WOOLWORTHS METRO',
      matchType: 'contains',
      entityName: 'Woolworths',
      tags: ['groceries'],
      isActive: true,
      confidence: 0.5,
      timesApplied: 0,
    });

    // Same (normalized pattern, matchType) → reinforced, not duplicated.
    const reinforced = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS METRO 1234',
      matchType: 'contains',
      tags: ['groceries'],
    });
    expect(reinforced.data.id).toBe(created.data.id);
    expect(reinforced.data.confidence).toBeCloseTo(0.6, 5);
    expect(reinforced.data.timesApplied).toBe(1);

    const list = await client().corrections.list();
    expect(list.data).toHaveLength(1);
    expect(list.pagination).toMatchObject({ total: 1, hasMore: false });
  });

  it('gets a correction by id', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'COLES',
      matchType: 'exact',
    });
    const fetched = await client().corrections.get(created.data.id);
    expect(fetched.data.id).toBe(created.data.id);
    expect(fetched.data.matchType).toBe('exact');
  });

  it('filters by matchType / minConfidence and paginates', async () => {
    await client().corrections.createOrUpdate({ descriptionPattern: 'A', matchType: 'exact' });
    await client().corrections.createOrUpdate({ descriptionPattern: 'B', matchType: 'contains' });
    await client().corrections.createOrUpdate({ descriptionPattern: 'C', matchType: 'contains' });

    const onlyContains = await client().corrections.list({ matchType: 'contains' });
    expect(onlyContains.pagination.total).toBe(2);
    expect(onlyContains.data.every((c) => c.matchType === 'contains')).toBe(true);

    // All three seed at confidence 0.5, so a 0.9 floor excludes everything.
    const highConfidence = await client().corrections.list({ minConfidence: 0.9 });
    expect(highConfidence.pagination.total).toBe(0);

    const firstPage = await client().corrections.list({ limit: 2, offset: 0 });
    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.pagination).toMatchObject({ total: 3, limit: 2, offset: 0, hasMore: true });
  });
});

describe('corrections — update, delete & adjustConfidence', () => {
  it('updates fields on an existing correction', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'NETFLIX',
      matchType: 'contains',
    });
    const updated = await client().corrections.update(created.data.id, {
      tags: ['subscriptions'],
      priority: 3,
      isActive: false,
    });
    expect(updated.message).toBe('Correction updated');
    expect(updated.data).toMatchObject({
      tags: ['subscriptions'],
      priority: 3,
      isActive: false,
    });
  });

  it('deletes a correction', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'SPOTIFY',
      matchType: 'contains',
    });
    const deleted = await client().corrections.delete(created.data.id);
    expect(deleted.message).toBe('Correction deleted');
    await expect(client().corrections.get(created.data.id)).rejects.toMatchObject({ status: 404 });
  });

  it('adjusts confidence and GCs the row when it drops below 0.3', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'AMAZON',
      matchType: 'contains',
    });

    const bumped = await client().corrections.adjustConfidence(created.data.id, 0.2);
    expect(bumped.message).toBe('Confidence adjusted');
    expect((await client().corrections.get(created.data.id)).data.confidence).toBeCloseTo(0.7, 5);

    // 0.7 - 0.5 = 0.2 < 0.3 floor → row is deleted by the GC path.
    await client().corrections.adjustConfidence(created.data.id, -0.5);
    await expect(client().corrections.get(created.data.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('corrections — 404s on unknown ids', () => {
  it('404s get / update / delete / adjustConfidence for a missing id', async () => {
    await expect(client().corrections.get('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().corrections.update('nope', { tags: ['x'] })).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().corrections.delete('nope')).rejects.toMatchObject({ status: 404 });
    await expect(client().corrections.adjustConfidence('nope', 0.1)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('corrections — findMatch', () => {
  it('classifies a confident match, an uncertain match, and a miss', async () => {
    // Confidence starts at 0.5 (uncertain); bumped to 0.95 → matched.
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });

    const uncertain = await client().corrections.findMatch({
      description: 'WOOLWORTHS METRO SYDNEY',
      minConfidence: 0.3,
    });
    expect(uncertain.status).toBe('uncertain');
    expect(uncertain.data?.id).toBe(created.data.id);

    await client().corrections.adjustConfidence(created.data.id, 0.45); // 0.5 → 0.95
    const matched = await client().corrections.findMatch({
      description: 'WOOLWORTHS METRO SYDNEY',
    });
    expect(matched.status).toBe('matched');

    const miss = await client().corrections.findMatch({ description: 'TOTALLY UNRELATED' });
    expect(miss).toEqual({ data: null, status: null });
  });
});

describe('corrections — previewMatches', () => {
  it('returns the transactions a candidate (pattern, matchType) rule would match', async () => {
    const db = financeDb.db;
    transactionsService.createTransaction(db, {
      description: 'WOOLWORTHS 1234 SYDNEY',
      account: 'checking',
      amount: -50,
      date: '2026-01-01',
    });
    transactionsService.createTransaction(db, {
      description: 'WOOLWORTHS METRO',
      account: 'checking',
      amount: -12,
      date: '2026-01-02',
    });
    transactionsService.createTransaction(db, {
      description: 'COLES EXPRESS',
      account: 'checking',
      amount: -8,
      date: '2026-01-03',
    });

    const preview = await client().corrections.previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
    });
    expect(preview.data.scanned).toBe(3);
    expect(preview.data.total).toBe(2);
    expect(preview.data.truncated).toBe(false);
    expect(preview.data.matches.map((m) => m.description).toSorted()).toEqual([
      'WOOLWORTHS 1234 SYDNEY',
      'WOOLWORTHS METRO',
    ]);

    const truncatedPreview = await client().corrections.previewMatches({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      limit: 1,
    });
    expect(truncatedPreview.data.total).toBe(2);
    expect(truncatedPreview.data.matches).toHaveLength(1);
    expect(truncatedPreview.data.truncated).toBe(true);
  });
});

describe('corrections — request validation', () => {
  it('400s a createOrUpdate with an empty descriptionPattern', async () => {
    await expect(
      client().corrections.createOrUpdate({ descriptionPattern: '', matchType: 'exact' })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('400s an adjustConfidence with an out-of-range delta', async () => {
    const created = await client().corrections.createOrUpdate({
      descriptionPattern: 'DELTA',
      matchType: 'exact',
    });
    await expect(client().corrections.adjustConfidence(created.data.id, 5)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('400s a previewMatches with an invalid matchType', async () => {
    await expect(
      client().corrections.previewMatches({ descriptionPattern: 'X', matchType: 'fuzzy' })
    ).rejects.toMatchObject({ status: 400 });
  });
});
