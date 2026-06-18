/**
 * Integration tests for the corrections AI cluster (C1-b): analyze /
 * generate-rules / propose / revise / reject. The Claude completer and the
 * cross-pillar rejection-feedback store are swapped for in-memory fakes via the
 * `__set*ForTests` seams, so no test touches the network or the core pillar.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  openFinanceDb,
  transactionCorrectionsService,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import {
  __setClaudeCompleterForTests,
  __setFeedbackStoreForTests,
  feedbackKey,
  type ClaudeCompleter,
  type FeedbackStore,
} from '../modules/corrections/index.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let feedbackMap: Map<string, string>;

function completerReturning(byOp: Record<string, string | null>): ClaudeCompleter {
  return (req) => Promise.resolve(byOp[req.operation] ?? null);
}

function memoryFeedbackStore(map: Map<string, string>): FeedbackStore {
  return {
    load: (k) => Promise.resolve(map.get(k) ?? null),
    persist: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
  };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-corrections-ai-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  feedbackMap = new Map();
  __setFeedbackStoreForTests(memoryFeedbackStore(feedbackMap));
});

afterEach(() => {
  __setClaudeCompleterForTests(null);
  __setFeedbackStoreForTests(null);
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({ financeDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3004' })
  );
}

describe('corrections.analyzeCorrection', () => {
  it('returns the validated rule when the AI pattern matches the description', async () => {
    __setClaudeCompleterForTests(
      completerReturning({
        'analyze-correction': JSON.stringify({
          matchType: 'contains',
          pattern: 'WOOLWORTHS',
          confidence: 0.95,
        }),
      })
    );
    const res = await client().corrections.analyzeCorrection({
      description: 'WOOLWORTHS METRO 1234',
      entityName: 'Woolworths',
      amount: -12,
    });
    expect(res.data).toEqual({ matchType: 'contains', pattern: 'WOOLWORTHS', confidence: 0.95 });
  });

  it('returns null when the AI pattern does not match the description', async () => {
    __setClaudeCompleterForTests(
      completerReturning({
        'analyze-correction': JSON.stringify({
          matchType: 'contains',
          pattern: 'NETFLIX',
          confidence: 0.9,
        }),
      })
    );
    const res = await client().corrections.analyzeCorrection({
      description: 'WOOLWORTHS METRO',
      entityName: 'Woolworths',
      amount: -12,
    });
    expect(res.data).toBeNull();
  });

  it('returns null when the AI is unavailable (completer yields null)', async () => {
    __setClaudeCompleterForTests(completerReturning({}));
    const res = await client().corrections.analyzeCorrection({
      description: 'WOOLWORTHS METRO',
      entityName: 'Woolworths',
      amount: -12,
    });
    expect(res.data).toBeNull();
  });
});

describe('corrections.generateRules', () => {
  it('parses the AI proposal array', async () => {
    __setClaudeCompleterForTests(
      completerReturning({
        'generate-rules': JSON.stringify([
          {
            descriptionPattern: 'NETFLIX',
            matchType: 'contains',
            tags: ['Entertainment'],
            reasoning: 'streaming',
          },
        ]),
      })
    );
    const res = await client().corrections.generateRules({
      transactions: [
        {
          description: 'NETFLIX.COM',
          entityName: 'Netflix',
          amount: -15,
          account: 'checking',
          currentTags: [],
        },
      ],
    });
    expect(res.proposals).toEqual([
      {
        descriptionPattern: 'NETFLIX',
        matchType: 'contains',
        tags: ['Entertainment'],
        reasoning: 'streaming',
      },
    ]);
  });

  it('returns [] when the AI is unavailable', async () => {
    __setClaudeCompleterForTests(completerReturning({}));
    const res = await client().corrections.generateRules({
      transactions: [
        { description: 'X', entityName: null, amount: -1, account: 'checking', currentTags: [] },
      ],
    });
    expect(res.proposals).toEqual([]);
  });
});

describe('corrections.proposeChangeSet', () => {
  it('proposes an add ChangeSet (no existing rule) and previews the impact', async () => {
    __setClaudeCompleterForTests(completerReturning({}));
    transactionsService.createTransaction(financeDb.db, {
      description: 'WOOLWORTHS METRO',
      account: 'checking',
      amount: -12,
      date: '2026-01-01',
    });

    const res = await client().corrections.proposeChangeSet({
      signal: {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        entityName: 'Woolworths',
        tags: ['groceries'],
      },
    });

    expect(res.changeSet.ops).toHaveLength(1);
    expect(res.changeSet.ops[0]?.op).toBe('add');
    expect(res.rationale).toContain('Add new correction rule');
    expect(res.preview.counts.affected).toBe(1);
    expect(res.targetRules).toEqual({});
  });

  it('proposes an edit ChangeSet when a rule already exists for the pattern', async () => {
    __setClaudeCompleterForTests(completerReturning({}));
    const existing = transactionCorrectionsService.createOrUpdateTransactionCorrection(
      financeDb.db,
      {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        entityName: 'Woolworths',
        tags: ['groceries'],
      }
    );

    const res = await client().corrections.proposeChangeSet({
      signal: {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        entityName: 'Woolworths',
        tags: ['groceries'],
      },
    });

    expect(res.changeSet.ops[0]?.op).toBe('edit');
    expect(res.changeSet.ops[0]?.id).toBe(existing.id);
    expect(res.rationale).toContain(`Edit correction rule ${existing.id}`);
    expect(res.targetRules[existing.id]).toBeDefined();
  });

  it('adapts the signal from prior rejection feedback (AI interpret) and flags the follow-up', async () => {
    feedbackMap.set(
      feedbackKey({ matchType: 'contains', normalizedPattern: 'WOOLWORTHS' }),
      JSON.stringify({
        createdAt: '2026-01-01T00:00:00.000Z',
        userEmail: 'u',
        feedback: 'too broad — use exact',
        changeSet: {
          ops: [{ op: 'add', data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' } }],
        },
        impactSummary: null,
      })
    );
    __setClaudeCompleterForTests(
      completerReturning({
        'rejection-interpret': JSON.stringify({
          adaptedSignal: {
            descriptionPattern: 'WOOLWORTHS METRO',
            matchType: 'exact',
            entityName: 'Woolworths',
            tags: ['groceries'],
          },
        }),
      })
    );

    const res = await client().corrections.proposeChangeSet({
      signal: {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        entityName: 'Woolworths',
        tags: ['groceries'],
      },
    });

    expect(res.rationale).toContain('Follow-up after rejection feedback');
    // The adapted signal flipped matchType to exact + pattern to WOOLWORTHS METRO.
    const addOp = res.changeSet.ops[0];
    expect(addOp?.op).toBe('add');
  });
});

describe('corrections.reviseChangeSet', () => {
  const baseArgs = {
    signal: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' as const },
    currentChangeSet: {
      ops: [{ op: 'add', data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' } }],
    },
    instruction: 'make it exact',
    triggeringTransactions: [{ description: 'WOOLWORTHS METRO' }],
  };

  it('returns the AI-revised ChangeSet', async () => {
    __setClaudeCompleterForTests(
      completerReturning({
        'revise-changeset': JSON.stringify({
          changeSet: {
            ops: [
              { op: 'add', data: { descriptionPattern: 'WOOLWORTHS METRO', matchType: 'exact' } },
            ],
          },
          rationale: 'narrowed to exact',
        }),
      })
    );
    const res = await client().corrections.reviseChangeSet(baseArgs);
    expect(res.rationale).toBe('narrowed to exact');
    expect(res.changeSet.ops[0]?.op).toBe('add');
  });

  it('500s when the AI returns invalid JSON', async () => {
    __setClaudeCompleterForTests(completerReturning({ 'revise-changeset': 'not json' }));
    await expect(client().corrections.reviseChangeSet(baseArgs)).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('corrections.rejectChangeSet', () => {
  it('persists the feedback under the signal key', async () => {
    __setClaudeCompleterForTests(completerReturning({}));
    const res = await client().corrections.rejectChangeSet({
      signal: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' },
      changeSet: {
        ops: [{ op: 'add', data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' } }],
      },
      feedback: 'too broad',
    });
    expect(res.message).toBe('ChangeSet rejected');
    const stored = feedbackMap.get(
      feedbackKey({ matchType: 'contains', normalizedPattern: 'WOOLWORTHS' })
    );
    expect(stored).toBeDefined();
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ feedback: 'too broad' });
  });

  it('still succeeds (best-effort) when the feedback store throws', async () => {
    __setClaudeCompleterForTests(completerReturning({}));
    __setFeedbackStoreForTests({
      load: () => Promise.resolve(null),
      persist: () => Promise.reject(new Error('core unavailable')),
    });
    const res = await client().corrections.rejectChangeSet({
      signal: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' },
      changeSet: {
        ops: [{ op: 'add', data: { descriptionPattern: 'WOOLWORTHS', matchType: 'contains' } }],
      },
      feedback: 'too broad',
    });
    expect(res.message).toBe('ChangeSet rejected');
  });
});
