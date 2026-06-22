/**
 * Integration tests for the `imports.*` REST surface against the real Express
 * app, with the contacts pillar provided by an injected fake (PRD-163 N3):
 * the matcher fetches the contact set live and matches in memory; commit
 * pre-creates pending contacts (create-or-fetch-by-name) BEFORE the finance tx;
 * createEntity goes to contacts. Covers the session-poll pattern, dedup,
 * executeImport writes, the re-evaluation endpoints (404/412 mapping), atomic
 * commit (temp-id resolution, changeset application, rollback, retroactive
 * reclassification), the OD-8 409 idempotency, and OD-3 contacts-down
 * degradation.
 *
 * The AI categorizer is stubbed off, so unmatched rows land in `uncertain` with
 * `'No entity match found'` and the AI counters stay zero.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { clearProgress } from '../modules/imports/index.js';
import { makeContactsFake, type ContactsFake, type SeedContact } from './contacts-fake.js';
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

function client(contacts: ContactsFake = makeContactsFake()) {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts,
    })
  );
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

function withContacts(seed: SeedContact[]): ContactsFake {
  return makeContactsFake({ seed });
}

describe('imports.processImport — session poll + live-fetch matching', () => {
  it('matches a contact from the live fetch and returns it via the polled result', async () => {
    const contacts = withContacts([{ id: 'woolworths-id', name: 'Woolworths' }]);
    const c = client(contacts);

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLWORTHS 1234', checksum: 'match-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.entity.entityName).toBe('Woolworths');
    expect(result.matched[0]?.entity.entityId).toBe('woolworths-id');
    expect(result.matched[0]?.entity.matchType).toBe('prefix');
  });

  it('matches via a contact alias from the live fetch', async () => {
    const contacts = withContacts([{ id: 'ww-id', name: 'Woolworths', aliases: ['WOOLIES'] }]);
    const c = client(contacts);

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLIES METRO', checksum: 'alias-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched[0]?.entity.entityName).toBe('Woolworths');
    expect(result.matched[0]?.entity.matchType).toBe('alias');
  });

  it('degrades to a no-match run when contacts is unavailable (OD-3) — never throws', async () => {
    const c = client(makeContactsFake({ unavailable: true }));

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLWORTHS 1234', checksum: 'down-1' })],
      account: 'Amex',
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.error).toBe('No entity match found');
  });

  it('with AI disabled, an unmatched row is uncertain with "No entity match found"', async () => {
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
    expect(result.aiUsage).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });

  it('skips checksums that already exist in the transactions table (dedup)', async () => {
    const c = client();
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
    const { sessionId } = await c.imports.executeImport({
      transactions: [
        confirmed({
          description: 'WRITTEN TXN',
          amount: -125.5,
          checksum: 'written-1',
          entityId: 'entity-co-id',
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
    // The contacts entity id is stored verbatim — no local FK enforces it.
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

describe('imports.createEntity — create-or-fetch against contacts', () => {
  it('creates a contact and returns its id + name', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const res = await c.imports.createEntity({ name: 'New Merchant' });
    expect(res.entityName).toBe('New Merchant');
    expect(contacts.created).toEqual([{ name: 'New Merchant', type: 'company' }]);
    expect(contacts.entities.find((e) => e.name === 'New Merchant')?.id).toBe(res.entityId);
  });

  it('fetches the existing contact by name on a 409 (idempotent re-create)', async () => {
    const contacts = withContacts([{ id: 'existing-id', name: 'Acme' }]);
    const c = client(contacts);
    const res = await c.imports.createEntity({ name: 'Acme' });
    expect(res.entityId).toBe('existing-id');
    expect(contacts.entities.filter((e) => e.name === 'Acme')).toHaveLength(1);
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
    const c = client(withContacts([{ id: 'woolworths-id', name: 'Woolworths' }]));
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

    const after = await c.imports.getImportProgress(sessionId);
    expect(processResultOf(after).matched.some((t) => t.checksum === 'acme-apply-1')).toBe(true);
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
    const c = client(withContacts([{ id: 'woolworths-id', name: 'Woolworths' }]));
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

describe('imports.commitImport — pre-create contacts then write the finance tx', () => {
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

  it('pre-creates pending contacts and resolves temp ids to the contact id', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
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

    const contact = contacts.entities.find((e) => e.name === 'Woolworths');
    expect(contact).toBeDefined();
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE description = ?')
      .get('WOOLWORTHS 1234') as { entity_id: string };
    expect(txn.entity_id).toBe(contact?.id);
    expect(txn.entity_id).not.toBe(tempId);
  });

  it('carries the non-default type to the contacts create (preserving the type override)', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000002';
    await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      transactions: [confirmed({ checksum: 'commit-gov' })],
    });
    expect(contacts.created).toContainEqual({ name: 'ATO', type: 'government' });
    expect(contacts.entities.find((e) => e.name === 'ATO')?.type).toBe('government');
  });

  it('is idempotent on a 409: a pre-existing contact name reuses the existing id (OD-8)', async () => {
    const contacts = withContacts([{ id: 'preexisting-ato', name: 'ATO', type: 'government' }]);
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000000a';
    await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      transactions: [confirmed({ checksum: 'commit-dup', entityId: tempId, entityName: 'ATO' })],
    });
    // No duplicate contact created; the transaction points at the existing id.
    expect(contacts.entities.filter((e) => e.name === 'ATO')).toHaveLength(1);
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE checksum = ?')
      .get('commit-dup') as { entity_id: string };
    expect(txn.entity_id).toBe('preexisting-ato');
  });

  it('resolves temp ids inside correction ChangeSet add ops', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
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

    const contact = contacts.entities.find((e) => e.name === 'TestCorp');
    const rule = financeDb.raw
      .prepare('SELECT entity_id FROM transaction_corrections WHERE description_pattern = ?')
      .get('TESTCORP') as { entity_id: string };
    expect(rule.entity_id).toBe(contact?.id);
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

  it('rolls back ALL finance writes if a ChangeSet op references an unknown rule id', async () => {
    const c = client();
    const tempId = 'temp:entity:00000000-0000-0000-0000-000000000007';
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

    const txnsAfter = financeDb.raw.prepare('SELECT count(*) as c FROM transactions').get() as {
      c: number;
    };
    // The finance tx rolled back; the pre-created contact (created before the
    // tx) is a harmless orphan, surfaced by the entity-usage orphanedOnly filter.
    expect(txnsAfter.c).toBe(txnsBefore.c);
  });

  it('handles multiple entities and transactions in one commit', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
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
    expect(contacts.entities.map((e) => e.name).toSorted()).toEqual(['Coles', 'Woolworths']);
  });
});

describe('imports.commitImport — retroactive reclassification', () => {
  it('reclassifies existing transactions a new rule now matches', async () => {
    const c = client();
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
                entityId: 'woolworths-id',
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
    expect(txn.entity_id).toBe('woolworths-id');
    expect(txn.entity_name).toBe('Woolworths');
  });

  it('excludes the current import batch from reclassification', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'COLES',
                matchType: 'contains',
                entityId: 'coles-id',
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
