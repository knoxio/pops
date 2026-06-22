/**
 * Integration tests for the `tagRules.*` REST surface: vocabulary listing,
 * deterministic ChangeSet propose/preview (impact diffs, new-tag flagging,
 * userTags short-circuit, match-type semantics), apply (rule persistence +
 * vocabulary upsert, 404 on editing an unknown rule), and reject (follow-up
 * proposal only when a signal is supplied).
 *
 * The finance baseline migration seeds a default tag vocabulary, so tests
 * use a clearly-unseeded tag (`CUSTOM_TAG`) for new-tag assertions rather
 * than assuming an empty vocabulary.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-tagrules-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

const CUSTOM_TAG = 'midnight-snacks';

const addOp = {
  source: 'test',
  ops: [
    {
      op: 'add',
      data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [CUSTOM_TAG] },
    },
  ],
};

describe('tagRules — vocabulary & apply', () => {
  it('upserts accepted new tags on apply, ignoring blanks', async () => {
    const initial = (await client().tagRules.vocabulary()).tags;
    expect(initial).not.toContain(CUSTOM_TAG); // unseeded
    expect(initial.length).toBeGreaterThan(0); // baseline seed present

    const applied = await client().tagRules.apply({
      changeSet: addOp,
      acceptedNewTags: [CUSTOM_TAG, '  '],
    });
    expect(applied.rules).toHaveLength(1);
    expect(applied.rules[0]).toMatchObject({
      descriptionPattern: 'WOOLWORTHS',
      matchType: 'contains',
      tags: [CUSTOM_TAG],
      isActive: true,
      confidence: 0.95,
    });

    const after = (await client().tagRules.vocabulary()).tags;
    expect(after).toContain(CUSTOM_TAG);
    expect(after).not.toContain(''); // blank-only entry ignored
    expect(after.length).toBe(initial.length + 1);
  });

  it('edits and removes a persisted rule via ChangeSet ops', async () => {
    const created = await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [] });
    const id = created.rules[0]?.id ?? '';

    const edited = await client().tagRules.apply({
      changeSet: { ops: [{ op: 'edit', id, data: { tags: [CUSTOM_TAG, 'late-night'] } }] },
      acceptedNewTags: [],
    });
    expect(edited.rules[0]?.tags).toEqual([CUSTOM_TAG, 'late-night']);

    const removed = await client().tagRules.apply({
      changeSet: { ops: [{ op: 'remove', id }] },
      acceptedNewTags: [],
    });
    expect(removed.rules).toHaveLength(0);
  });

  it('404s an edit op targeting an unknown rule id', async () => {
    await expect(
      client().tagRules.apply({
        changeSet: { ops: [{ op: 'edit', id: 'nope', data: { tags: ['x'] } }] },
        acceptedNewTags: [],
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('tagRules — propose & preview', () => {
  const txs = [
    { transactionId: 't1', description: 'WOOLWORTHS 1234 SYDNEY', entityId: null },
    { transactionId: 't2', description: 'COLES 5678', entityId: null },
    { transactionId: 't3', description: 'WOOLWORTHS METRO', entityId: null, userTags: ['mine'] },
  ];

  it('proposes an add ChangeSet with a deterministic impact preview', async () => {
    const proposal = await client().tagRules.propose({
      signal: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains', tags: [CUSTOM_TAG] },
      transactions: txs,
    });

    expect(proposal.changeSet.ops).toHaveLength(1);
    expect(proposal.rationale).toContain('WOOLWORTHS');
    // t1 matches; t2 doesn't; t3 is skipped (has userTags).
    expect(proposal.preview.counts.affected).toBe(1);
    expect(proposal.preview.affected[0]?.transactionId).toBe('t1');
    // CUSTOM_TAG is not in the seeded vocabulary → flagged new.
    expect(proposal.preview.affected[0]?.after.suggestedTags[0]).toMatchObject({
      tag: CUSTOM_TAG,
      isNew: true,
    });
    expect(proposal.preview.counts.newTagProposals).toBe(1);
  });

  it('preview honours match-type semantics (exact vs contains)', async () => {
    const exact = await client().tagRules.preview({
      changeSet: {
        ops: [
          {
            op: 'add',
            data: { descriptionPattern: 'WOOLWORTHS', matchType: 'exact', tags: ['g'] },
          },
        ],
      },
      transactions: txs,
    });
    // No description equals 'WOOLWORTHS' exactly → nothing affected.
    expect(exact.counts.affected).toBe(0);

    const contains = await client().tagRules.preview({
      changeSet: {
        ops: [
          { op: 'add', data: { descriptionPattern: 'COLES', matchType: 'contains', tags: ['g'] } },
        ],
      },
      transactions: txs,
    });
    expect(contains.affected.map((a) => a.transactionId)).toEqual(['t2']);
  });

  it('marks a tag already in the vocabulary as not new', async () => {
    await client().tagRules.apply({ changeSet: addOp, acceptedNewTags: [CUSTOM_TAG] });

    const preview = await client().tagRules.preview({
      changeSet: addOp,
      transactions: [{ transactionId: 't1', description: 'WOOLWORTHS 1234', entityId: null }],
    });
    expect(preview.affected[0]?.after.suggestedTags[0]).toMatchObject({
      tag: CUSTOM_TAG,
      isNew: false,
    });
    expect(preview.counts.newTagProposals).toBe(0);
  });
});

describe('tagRules — reject', () => {
  it('returns a follow-up proposal only when a signal is supplied', async () => {
    const withSignal = await client().tagRules.reject({
      changeSet: addOp,
      feedback: 'too broad',
      signal: { descriptionPattern: 'WOOLWORTHS METRO', matchType: 'contains', tags: [CUSTOM_TAG] },
      transactions: [],
    });
    expect(withSignal.message).toBe('Tag rule ChangeSet rejected');
    expect(withSignal.followUpProposal).not.toBeNull();
    expect(withSignal.followUpProposal?.rationale).toContain('too broad');

    const withoutSignal = await client().tagRules.reject({ changeSet: addOp, feedback: 'no' });
    expect(withoutSignal.followUpProposal).toBeNull();
  });
});
