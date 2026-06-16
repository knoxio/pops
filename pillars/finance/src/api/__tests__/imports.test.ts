/**
 * Integration tests for the `imports.*` REST surface against the real Express
 * app: the async session-poll pattern (processImport → poll → assert), dedup,
 * executeImport writes, createEntity, the synchronous re-evaluation endpoints
 * (applyChangeSetAndReevaluate / reevaluateWithPendingRules) with their 404/412
 * error mapping, and the atomic commitImport (temp-id resolution, changeset +
 * tag-rule changeset application, rollback, retroactive reclassification).
 *
 * The AI categorizer is stubbed off in F1, so unmatched rows land in `uncertain`
 * with the reason `'No entity match found'` and the AI counters stay zero —
 * asserted explicitly. Entities are seeded through the drizzle handle (the REST
 * createEntity only sets a name); writes are verified through the transactions
 * REST surface and the raw handle.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { entities, openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { clearProgress } from '../modules/imports/index.js';
import { makeClient, waitForImportCompletion } from './test-utils.js';

import type { ExecuteImportOutput, ProcessImportOutput } from '../modules/imports/types.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-imports-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  clearProgress();
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

function seedEntity(input: {
  name: string;
  id?: string;
  aliases?: string;
  defaultTags?: string;
}): string {
  const id = input.id ?? crypto.randomUUID();
  financeDb.db
    .insert(entities)
    .values({
      id,
      name: input.name,
      aliases: input.aliases ?? null,
      defaultTags: input.defaultTags ?? null,
      lastEditedTime: new Date().toISOString(),
    })
    .run();
  return id;
}

function processResultOf(progress: { result?: unknown } | null): ProcessImportOutput {
  if (!progress?.result) throw new Error('Expected a completed process-import session result');
  return progress.result as ProcessImportOutput;
}

function parsed(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-02-13',
    description: 'TEST MERCHANT',
    amount: -100,
    account: 'Amex',
    rawRow: '{}',
    checksum: `chk-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

function confirmed(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-02-13',
    description: 'CONFIRMED MERCHANT',
    amount: -42.5,
    account: 'Amex',
    rawRow: '{"line":"x"}',
    checksum: `chk-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

describe('imports.processImport — session poll + matching', () => {
  it('matches a seeded entity and returns it via the polled result', async () => {
    const c = client();
    seedEntity({ name: 'Woolworths', id: 'woolworths-id' });

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLWORTHS 1234', checksum: 'match-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.entity.entityName).toBe('Woolworths');
    // "WOOLWORTHS 1234" starts with the entity name → prefix stage (3) wins.
    expect(result.matched[0]?.entity.matchType).toBe('prefix');
  });

  it('with AI disabled, an unmatched row is uncertain with reason "No entity match found" and zero AI counters', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ZZZ UNKNOWN VENDOR 9', checksum: 'nomatch-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.error).toBe('No entity match found');
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    // AI off → no usage stats, no AI warnings.
    expect(result.aiUsage).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });

  it('skips checksums that already exist in the transactions table (dedup)', async () => {
    const c = client();
    // Seed an existing transaction with a known checksum via executeImport.
    const { sessionId: execSession } = await c.imports.executeImport({
      transactions: [confirmed({ description: 'PRIOR ROW', checksum: 'dup-checksum' })],
    });
    await waitForImportCompletion<ExecuteImportOutput>(c, execSession);

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'DUPLICATE', checksum: 'dup-checksum' }),
        parsed({ description: 'FRESH ROW', checksum: 'fresh-checksum' }),
      ],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.checksum).toBe('dup-checksum');
    expect(result.skipped[0]?.skipReason).toContain('Duplicate');
    // The fresh row is still processed.
    const total =
      result.matched.length +
      result.uncertain.length +
      result.failed.length +
      result.skipped.length;
    expect(total).toBe(2);
  });

  it('auto-classifies a negative transfer-keyword row as a transfer (no entity)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'PayID Payment Received', amount: -2300, checksum: 'xfer-1' }),
      ],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.transactionType).toBe('transfer');
    expect(result.matched[0]?.entity.matchType).toBe('none');
  });

  it('returns an empty bucketed result for an empty batch', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({ transactions: [], account: 'Amex' });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toEqual([]);
    expect(result.uncertain).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('rejects a malformed payload (bad date format) with 400', async () => {
    const c = client();
    await expect(
      c.imports.processImport({
        transactions: [parsed({ date: '13/02/2026' })],
        account: 'Amex',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('imports.executeImport — writes', () => {
  it('writes confirmed transactions verifiable through the transactions REST surface', async () => {
    const c = client();
    const entityId = seedEntity({ name: 'Entity Co', id: 'entity-co-id' });

    const { sessionId } = await c.imports.executeImport({
      transactions: [
        confirmed({
          description: 'WRITTEN TXN',
          amount: -125.5,
          checksum: 'written-1',
          entityId,
          entityName: 'Entity Co',
        }),
      ],
    });

    const result = await waitForImportCompletion<ExecuteImportOutput>(c, sessionId);
    expect(result.imported).toBe(1);
    expect(result.failed).toEqual([]);

    const list = await c.transactions.list({ search: 'WRITTEN TXN' });
    expect(list.data).toHaveLength(1);
    expect(list.data[0]?.amount).toBe(-125.5);
    expect(list.data[0]?.entityName).toBe('Entity Co');
    expect(list.data[0]?.type).toBe('Expense');
  });

  it('maps transactionType to the stored type column', async () => {
    const c = client();
    const { sessionId } = await c.imports.executeImport({
      transactions: [
        confirmed({ description: 'A TRANSFER', checksum: 'xfer-w', transactionType: 'transfer' }),
        confirmed({ description: 'SOME INCOME', checksum: 'income-w', transactionType: 'income' }),
      ],
    });
    const result = await waitForImportCompletion<ExecuteImportOutput>(c, sessionId);
    expect(result.imported).toBe(2);

    const transfer = await c.transactions.list({ search: 'A TRANSFER' });
    expect(transfer.data[0]?.type).toBe('Transfer');
    const income = await c.transactions.list({ search: 'SOME INCOME' });
    expect(income.data[0]?.type).toBe('Income');
  });
});

describe('imports.getImportProgress', () => {
  it('returns null for an unknown session', async () => {
    const c = client();
    const progress = await c.imports.getImportProgress('00000000-0000-0000-0000-000000000000');
    expect(progress).toBeNull();
  });
});

describe('imports.createEntity', () => {
  it('creates an entity and returns its id + name', async () => {
    const c = client();
    const res = await c.imports.createEntity({ name: 'New Merchant' });
    expect(res.entityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.entityName).toBe('New Merchant');

    const row = financeDb.raw
      .prepare('SELECT name FROM entities WHERE id = ?')
      .get(res.entityId) as { name: string } | undefined;
    expect(row?.name).toBe('New Merchant');
  });

  it('preserves special characters in the entity name', async () => {
    const c = client();
    const res = await c.imports.createEntity({ name: "McDonald's Cafe & Grill" });
    expect(res.entityName).toBe("McDonald's Cafe & Grill");
  });

  it('rejects an empty name with 400', async () => {
    const c = client();
    await expect(c.imports.createEntity({ name: '' })).rejects.toMatchObject({ status: 400 });
  });
});

describe('imports.applyChangeSetAndReevaluate', () => {
  async function uncertainSession(c: ReturnType<typeof client>, checksum: string) {
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ACME SUPPLIES 1234', checksum })],
      account: 'Amex',
    });
    const before = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(before.uncertain).toHaveLength(1);
    return sessionId;
  }

  it('applies a ChangeSet and re-buckets the matching transaction, mutating the session', async () => {
    const c = client();
    seedEntity({ name: 'Woolworths', id: 'woolworths-id' });
    const sessionId = await uncertainSession(c, 'acme-apply-1');

    const res = await c.imports.applyChangeSetAndReevaluate({
      sessionId,
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'ACME SUPPLIES',
              matchType: 'contains',
              entityId: 'woolworths-id',
              entityName: 'Woolworths',
              tags: [],
              confidence: 0.95,
            },
          },
        ],
      },
      minConfidence: 0.7,
    });

    expect(res.affectedCount).toBeGreaterThan(0);
    expect(res.result.matched.some((t) => t.checksum === 'acme-apply-1')).toBe(true);
    expect(res.result.uncertain.some((t) => t.checksum === 'acme-apply-1')).toBe(false);

    // Session result was persisted with the new buckets.
    const after = await c.imports.getImportProgress(sessionId);
    expect(processResultOf(after).matched.some((t) => t.checksum === 'acme-apply-1')).toBe(true);
  });

  it('returns affectedCount=0 when the applied rule matches nothing remaining', async () => {
    const c = client();
    seedEntity({ name: 'Woolworths', id: 'woolworths-id' });
    const sessionId = await uncertainSession(c, 'acme-apply-0');

    const res = await c.imports.applyChangeSetAndReevaluate({
      sessionId,
      changeSet: {
        ops: [
          {
            op: 'add',
            data: {
              descriptionPattern: 'DOES NOT MATCH',
              matchType: 'contains',
              entityId: 'woolworths-id',
              entityName: 'Woolworths',
              tags: [],
              confidence: 0.95,
            },
          },
        ],
      },
      minConfidence: 0.7,
    });
    expect(res.affectedCount).toBe(0);
    expect(res.result.uncertain.some((t) => t.checksum === 'acme-apply-0')).toBe(true);
  });

  it('404s an unknown session', async () => {
    const c = client();
    await expect(
      c.imports.applyChangeSetAndReevaluate({
        sessionId: '00000000-0000-0000-0000-000000000000',
        changeSet: {
          ops: [
            {
              op: 'add',
              data: { descriptionPattern: 'X', matchType: 'exact', tags: [], confidence: 0.9 },
            },
          ],
        },
        minConfidence: 0.7,
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('does NOT mutate the session when the ChangeSet apply fails (unknown rule id → 404)', async () => {
    const c = client();
    const sessionId = await uncertainSession(c, 'acme-apply-fail');

    await expect(
      c.imports.applyChangeSetAndReevaluate({
        sessionId,
        changeSet: { ops: [{ op: 'edit', id: 'does-not-exist', data: { confidence: 0.9 } }] },
        minConfidence: 0.7,
      })
    ).rejects.toMatchObject({ status: 404 });

    const after = await c.imports.getImportProgress(sessionId);
    expect(after?.status).toBe('completed');
    expect(processResultOf(after).uncertain.some((t) => t.checksum === 'acme-apply-fail')).toBe(
      true
    );
  });
});

describe('imports.reevaluateWithPendingRules', () => {
  async function uncertainSession(c: ReturnType<typeof client>, checksum: string) {
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ACME SUPPLIES 1234', checksum })],
      account: 'Amex',
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    return sessionId;
  }

  it('re-evaluates using merged (DB + pending) rules without writing the rule to the DB', async () => {
    const c = client();
    seedEntity({ name: 'Woolworths', id: 'woolworths-id' });
    const sessionId = await uncertainSession(c, 'reeval-merged');

    const res = await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [
        {
          changeSet: {
            ops: [
              {
                op: 'add',
                data: {
                  descriptionPattern: 'ACME SUPPLIES',
                  matchType: 'contains',
                  entityId: 'woolworths-id',
                  entityName: 'Woolworths',
                  tags: [],
                  confidence: 0.95,
                },
              },
            ],
          },
        },
      ],
    });

    expect(res.affectedCount).toBeGreaterThan(0);
    expect(res.result.matched.some((t) => t.checksum === 'reeval-merged')).toBe(true);

    // The pending rule was NOT persisted: a fresh process of the same description stays uncertain.
    const probe = await c.imports.processImport({
      transactions: [parsed({ description: 'ACME SUPPLIES 9999', checksum: 'reeval-probe' })],
      account: 'Amex',
    });
    const probeResult = await waitForImportCompletion<ProcessImportOutput>(c, probe.sessionId);
    expect(probeResult.uncertain.some((t) => t.checksum === 'reeval-probe')).toBe(true);
  });

  it('accepts an empty pendingChangeSets array (re-evaluates against DB rules only)', async () => {
    const c = client();
    const sessionId = await uncertainSession(c, 'reeval-empty');
    const res = await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });
    expect(res.result).toBeDefined();
    expect(res.affectedCount).toBe(0);
  });

  it('404s an unknown session', async () => {
    const c = client();
    await expect(
      c.imports.reevaluateWithPendingRules({
        sessionId: '00000000-0000-0000-0000-000000000000',
        minConfidence: 0.7,
        pendingChangeSets: [],
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('imports.commitImport', () => {
  it('commits transactions only', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      transactions: [confirmed({ description: 'COLES SUPERMARKET', checksum: 'commit-1' })],
    });
    expect(res.data.entitiesCreated).toBe(0);
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.rulesApplied).toEqual({ add: 0, edit: 0, disable: 0, remove: 0 });
    expect(res.data.tagRulesApplied).toBe(0);
    expect(res.message).toBe('Import committed');

    const list = await c.transactions.list({ search: 'COLES SUPERMARKET' });
    expect(list.data).toHaveLength(1);
  });

  it('creates pending entities and resolves temp ids in transactions', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000001';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'Woolworths', type: 'company' }],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS 1234',
          checksum: 'commit-temp',
          entityId: tempId,
          entityName: 'Woolworths',
        }),
      ],
    });
    expect(res.data.entitiesCreated).toBe(1);

    const entity = financeDb.raw
      .prepare('SELECT id FROM entities WHERE name = ?')
      .get('Woolworths') as { id: string };
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE description = ?')
      .get('WOOLWORTHS 1234') as { entity_id: string };
    expect(txn.entity_id).toBe(entity.id);
    expect(txn.entity_id).not.toBe(tempId);
  });

  it('creates an entity with a non-default type', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000002';
    await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      transactions: [confirmed({ checksum: 'commit-gov' })],
    });
    const entity = financeDb.raw.prepare('SELECT type FROM entities WHERE name = ?').get('ATO') as {
      type: string;
    };
    expect(entity.type).toBe('government');
  });

  it('resolves temp ids inside correction ChangeSet add ops', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000003';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'TestCorp' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'TESTCORP',
                matchType: 'exact',
                entityId: tempId,
                entityName: 'TestCorp',
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ checksum: 'commit-cs' })],
    });
    expect(res.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });

    const entity = financeDb.raw
      .prepare('SELECT id FROM entities WHERE name = ?')
      .get('TestCorp') as { id: string };
    const rule = financeDb.raw
      .prepare('SELECT entity_id FROM transaction_corrections WHERE description_pattern = ?')
      .get('TESTCORP') as { entity_id: string };
    expect(rule.entity_id).toBe(entity.id);
  });

  it('applies pending tag-rule ChangeSets during commit', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          source: 'unit-test',
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'TAG_RULE_TEST',
                matchType: 'contains',
                tags: ['UnitTestTag'],
              },
            },
          ],
        },
      ],
      transactions: [
        confirmed({
          description: 'TAG_RULE_TEST 1',
          checksum: 'commit-tagrule',
          tags: ['UnitTestTag'],
        }),
      ],
    });
    expect(res.data.tagRulesApplied).toBe(1);

    const rule = financeDb.raw
      .prepare(
        'SELECT description_pattern FROM transaction_tag_rules WHERE description_pattern = ?'
      )
      .get('TAG_RULE_TEST') as { description_pattern: string } | undefined;
    expect(rule?.description_pattern).toBe('TAG_RULE_TEST');
  });

  it('rejects an unknown temp id with 400', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        transactions: [
          confirmed({
            checksum: 'commit-bad-temp',
            entityId: 'temp:entity:00000000-0000-0000-0000-999999999999',
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects duplicate temp ids with 400', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000004';
    await expect(
      c.imports.commitImport({
        entities: [
          { tempId, name: 'Entity A' },
          { tempId, name: 'Entity B' },
        ],
        transactions: [confirmed({ checksum: 'dup-temp' })],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects a malformed temp id format with 400', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        entities: [{ tempId: 'bad-format', name: 'Test' }],
        transactions: [confirmed({ checksum: 'bad-format-temp' })],
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rolls back ALL writes if a ChangeSet op references an unknown rule id', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000007';
    const entitiesBefore = financeDb.raw.prepare('SELECT count(*) as c FROM entities').get() as {
      c: number;
    };
    const txnsBefore = financeDb.raw.prepare('SELECT count(*) as c FROM transactions').get() as {
      c: number;
    };

    await expect(
      c.imports.commitImport({
        entities: [{ tempId, name: 'RollbackTest' }],
        changeSets: [
          { ops: [{ op: 'edit', id: 'non-existent-rule-id', data: { confidence: 0.9 } }] },
        ],
        transactions: [
          confirmed({ checksum: 'rollback-1', entityId: tempId, entityName: 'RollbackTest' }),
        ],
      })
    ).rejects.toMatchObject({ status: 404 });

    const entitiesAfter = financeDb.raw.prepare('SELECT count(*) as c FROM entities').get() as {
      c: number;
    };
    const txnsAfter = financeDb.raw.prepare('SELECT count(*) as c FROM transactions').get() as {
      c: number;
    };
    expect(entitiesAfter.c).toBe(entitiesBefore.c);
    expect(txnsAfter.c).toBe(txnsBefore.c);
  });

  it('handles multiple entities and transactions in one commit', async () => {
    const c = client();
    const tempId1 = 'temp:entity:00000000-0000-0000-0000-000000000008';
    const tempId2 = 'temp:entity:00000000-0000-0000-0000-000000000009';
    const res = await c.imports.commitImport({
      entities: [
        { tempId: tempId1, name: 'Woolworths' },
        { tempId: tempId2, name: 'Coles', type: 'company' },
      ],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS 1',
          checksum: 'multi-1',
          entityId: tempId1,
          entityName: 'Woolworths',
        }),
        confirmed({
          description: 'COLES 1',
          checksum: 'multi-2',
          entityId: tempId2,
          entityName: 'Coles',
        }),
        confirmed({ description: 'TRANSFER', checksum: 'multi-3', transactionType: 'transfer' }),
      ],
    });
    expect(res.data.entitiesCreated).toBe(2);
    expect(res.data.transactionsImported).toBe(3);
  });
});

describe('imports.commitImport — retroactive reclassification', () => {
  it('reclassifies existing transactions a new rule now matches', async () => {
    const c = client();
    const entityId = seedEntity({ name: 'Woolworths' });
    // Seed a pre-existing transaction with no entity link.
    await c.imports
      .executeImport({
        transactions: [
          confirmed({ description: 'WOOLWORTHS 9999', checksum: 'pre-existing-chk-1' }),
        ],
      })
      .then((r) => waitForImportCompletion<ExecuteImportOutput>(c, r.sessionId));

    const res = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'WOOLWORTHS',
                matchType: 'contains',
                entityId,
                entityName: 'Woolworths',
                confidence: 0.95,
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ description: 'NEW IMPORT TXN', checksum: 'reclass-new' })],
    });

    expect(res.data.retroactiveReclassifications).toBe(1);
    const txn = financeDb.raw
      .prepare('SELECT entity_id, entity_name FROM transactions WHERE checksum = ?')
      .get('pre-existing-chk-1') as { entity_id: string | null; entity_name: string | null };
    expect(txn.entity_id).toBe(entityId);
    expect(txn.entity_name).toBe('Woolworths');
  });

  it('excludes the current import batch from reclassification', async () => {
    const c = client();
    const entityId = seedEntity({ name: 'Coles' });
    const res = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'COLES',
                matchType: 'contains',
                entityId,
                entityName: 'Coles',
                confidence: 0.95,
              },
            },
          ],
        },
      ],
      transactions: [
        confirmed({ description: 'COLES SUPERMARKET', checksum: 'import-batch-chk-1' }),
      ],
    });
    expect(res.data.retroactiveReclassifications).toBe(0);
  });

  it('reclassifies type and location when the rule specifies them', async () => {
    const c = client();
    const entityId = seedEntity({ name: 'Rent Corp' });
    await c.imports
      .executeImport({
        transactions: [
          confirmed({
            description: 'RENT CORP PAYMENT',
            checksum: 'type-loc-chk',
            entityId,
            entityName: 'Rent Corp',
          }),
        ],
      })
      .then((r) => waitForImportCompletion<ExecuteImportOutput>(c, r.sessionId));

    const res = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'RENT CORP',
                matchType: 'contains',
                entityId,
                entityName: 'Rent Corp',
                transactionType: 'transfer',
                location: 'Melbourne',
                confidence: 0.95,
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ description: 'UNRELATED', checksum: 'reclass-tl' })],
    });
    expect(res.data.retroactiveReclassifications).toBe(1);

    const txn = financeDb.raw
      .prepare('SELECT type, location FROM transactions WHERE checksum = ?')
      .get('type-loc-chk') as { type: string; location: string | null };
    expect(txn.type).toBe('Transfer');
    expect(txn.location).toBe('Melbourne');
  });
});

describe('imports — AI seam', () => {
  it('keeps the categorizer disabled by default (no entity suggestion, zero counters)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'COMPLETELY UNSEEN VENDOR', checksum: 'ai-seam-1' })],
      account: 'Amex',
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.uncertain[0]?.error).toBe('No entity match found');
    expect(result.aiUsage).toBeUndefined();
  });
});
