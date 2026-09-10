/**
 * Integration tests for the `imports.*` REST surface against the real Express
 * app, with the contacts pillar provided by an injected fake: the matcher
 * fetches the contact set live and matches in memory; commit pre-creates pending
 * contacts (create-or-fetch-by-name) BEFORE the finance tx; createEntity goes to
 * contacts. Covers the session-poll pattern, dedup, the re-evaluation endpoints
 * (404/412 mapping), atomic commit (temp-id resolution, changeset application,
 * rollback, retroactive reclassification), 409 idempotency on a pre-existing
 * contact name, and contacts-down degradation.
 *
 * Pre-existing rows (dedup / reclassification fixtures) are seeded directly via
 * `importsService.insertImportTransaction` — the REST surface has no write path
 * of its own outside `commitImport`.
 *
 * The AI categorizer is disabled by pinning `FINANCE_AI_CATEGORIZER_ENABLED`
 * off in `beforeEach`, so unmatched rows land in `uncertain` with
 * `'No entity match found (AI categorization disabled)'`, the run result
 * carries an `AI_CATEGORIZATION_UNAVAILABLE` warning, and the AI usage
 * counters stay zero.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CallResult } from '@pops/pillar-sdk/client';

import {
  importsService,
  openFinanceDb,
  transactionTagRulesService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createImportDraft, getImportDraft } from '../../db/services/import-drafts.js';
import { createFinanceApiApp } from '../app.js';
import { page, stubHandle } from '../contacts/__tests__/stub-handle.js';
import {
  createContactsClient,
  type ContactEntity,
  type ContactsClient,
} from '../contacts/client.js';
import { clearProgress } from '../modules/imports/index.js';
import { makeContactsFake, type ContactsFake, type SeedContact } from './contacts-fake.js';
import { makeClient, waitForImportCompletion } from './test-utils.js';

import type { ProcessImportOutput } from '../modules/imports/types.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  // The suite asserts the disabled-categorizer contract against the real app,
  // so the flag must be pinned off — an ambient FINANCE_AI_CATEGORIZER_ENABLED
  // from the shell would route unmatched rows down the live AI path.
  delete process.env['FINANCE_AI_CATEGORIZER_ENABLED'];
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-imports-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  clearProgress(financeDb.db);
});

afterEach(() => {
  clearProgress(financeDb.db);
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client(contacts: ContactsClient = makeContactsFake()) {
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
    dialectAccountLabel: 'Amex',
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
    dialectAccountLabel: 'Amex',
    rawRow: '{"line":"x"}',
    checksum: `chk-${Math.random().toString(36).slice(2, 12)}`,
    ...overrides,
  };
}

interface StoredTagRule {
  confidence: number;
  times_applied: number;
  last_used_at: string | null;
}

function tagRuleChangeSet(descriptionPattern: string, tags: string[]) {
  return {
    source: 'unit-test',
    ops: [
      { op: 'add' as const, data: { descriptionPattern, matchType: 'contains' as const, tags } },
    ],
  };
}

/** A tag rule as the wizard stages it: the ChangeSet plus the new tags the user accepted. */
function stagedTagRule(descriptionPattern: string, tags: string[], acceptedNewTags: string[]) {
  return { changeSet: tagRuleChangeSet(descriptionPattern, tags), acceptedNewTags };
}

function storedTagRules(descriptionPattern: string): StoredTagRule[] {
  return financeDb.raw
    .prepare(
      'SELECT confidence, times_applied, last_used_at FROM transaction_tag_rules WHERE description_pattern = ?'
    )
    .all(descriptionPattern) as StoredTagRule[];
}

function vocabularyTags(): string[] {
  const rows = financeDb.raw.prepare('SELECT tag FROM tag_vocabulary').all() as { tag: string }[];
  return rows.map((r) => r.tag);
}

function storedTags(): string[][] {
  const rows = financeDb.raw.prepare('SELECT tags FROM transactions').all() as { tags: string }[];
  return rows.map((r) => JSON.parse(r.tags) as string[]);
}

function tagRuleTags(): string[] {
  const rows = financeDb.raw.prepare('SELECT tags FROM transaction_tag_rules').all() as {
    tags: string;
  }[];
  return rows.flatMap((r) => JSON.parse(r.tags) as string[]);
}

/** Seed a pre-existing transaction directly (the REST surface has no write path outside `commitImport`). */
function seedTransaction(overrides: {
  description: string;
  checksum: string;
  entityId?: string | null;
  entityName?: string | null;
}) {
  importsService.insertImportTransaction(financeDb.db, {
    description: overrides.description,
    dialectAccountLabel: 'Amex',
    amountCents: -4250,
    date: '2026-02-13',
    type: 'purchase',
    tags: [],
    entityId: overrides.entityId ?? null,
    entityName: overrides.entityName ?? null,
    location: null,
    rawRow: '{"line":"x"}',
    checksum: overrides.checksum,
  });
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
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched[0]?.entity.entityName).toBe('Woolworths');
    expect(result.matched[0]?.entity.matchType).toBe('alias');
  });

  it('degrades to a no-match run when contacts is unavailable — never throws', async () => {
    const c = client(makeContactsFake({ unavailable: true }));

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'WOOLWORTHS 1234', checksum: 'down-1' })],
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
  });

  it('with AI disabled, an unmatched row is uncertain with the disabled reason and the run carries one AI_CATEGORIZATION_UNAVAILABLE warning', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ZZZ UNKNOWN VENDOR 9', checksum: 'nomatch-1' })],
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.aiUsage).toBeUndefined();
    expect(result.warnings).toEqual([
      {
        type: 'AI_CATEGORIZATION_UNAVAILABLE',
        message:
          'AI categorization is disabled on this server — unmatched transactions were not sent to AI',
        affectedCount: 1,
        details: 'FINANCE_AI_CATEGORIZER_ENABLED != true',
      },
    ]);
  });

  it('skips checksums that already exist in the transactions table (dedup)', async () => {
    const c = client();
    seedTransaction({ description: 'PRIOR ROW', checksum: 'dup-checksum' });

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'DUPLICATE', checksum: 'dup-checksum' }),
        parsed({ description: 'FRESH ROW', checksum: 'fresh-checksum' }),
      ],
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

  it('leaves a transfer-keyword row with no rule or entity match uncertain (keyword heuristic removed, #3607)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'TRANSFER TO SAVINGS', amount: -2300, checksum: 'xfer-1' }),
        parsed({ description: 'BPAY PAYMENT TO AGL', amount: -8900, checksum: 'xfer-2' }),
      ],
    });

    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(2);
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
  });

  it('types the closed set of inbound account payments without a rule or entity (POPS-2610)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({
          description: 'PayID Payment Received, Thank you',
          amount: -2300,
          checksum: 'inbound-1',
        }),
      ],
    });

    // #3607 removed the loose keyword heuristic that guessed a type from any
    // occurrence of "payment"/"transfer". This is the narrow replacement: a
    // closed list of account-payment descriptors, typed deterministically, so
    // money moving between the user's own accounts never reads as spend.
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.uncertain).toHaveLength(0);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.transactionType).toBe('transfer');
    expect(result.matched[0]?.entity.matchType).toBe('none');
  });

  it('returns an empty bucketed result for an empty batch', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({ transactions: [] });
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
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('imports.processImport — entity-less correction rules (#3598)', () => {
  it('routes an entity-less purchase rule to uncertain so a merchant is still required', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(created.data.id, { confidence: 0.9 });

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'bunnings-1' }),
      ],
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(result.matched).toHaveLength(0);
    expect(result.uncertain).toHaveLength(1);
    const row = result.uncertain[0];
    expect(row?.ruleProvenance?.source).toBe('correction');
    expect(row?.transactionType).toBe('purchase');
    expect(row?.entity.matchType).toBe('learned');
    expect(row?.entity.entityId).toBeUndefined();
  });

  it('keeps a high-confidence entity-less transfer rule matched (transfers carry no merchant)', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'LOAN OFFSET SWEEP',
      matchType: 'contains',
      transactionType: 'transfer',
    });
    await c.corrections.update(created.data.id, { confidence: 0.95 });

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'LOAN OFFSET SWEEP 8842', checksum: 'sweep-1' })],
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(result.uncertain).toHaveLength(0);
    expect(result.matched).toHaveLength(1);
    const row = result.matched[0];
    expect(row?.ruleProvenance?.source).toBe('correction');
    expect(row?.transactionType).toBe('transfer');
    expect(row?.entity.matchType).toBe('learned');
  });

  it('matches a low-confidence entity-less transfer rule too — confidence is not a gate (finance ADR-004)', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'ROUND UP TO SAVER',
      matchType: 'contains',
      transactionType: 'transfer',
    });
    // Applies (>= 0.7 minConfidence); provenance, not the confidence value,
    // decides the bucket for a rule naming a transfer.
    await c.corrections.update(created.data.id, { confidence: 0.8 });

    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'ROUND UP TO SAVER 22', checksum: 'roundup-1' })],
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    expect(result.uncertain).toHaveLength(0);
    expect(result.matched).toHaveLength(1);
    const row = result.matched[0];
    expect(row?.ruleProvenance?.source).toBe('correction');
    expect(row?.transactionType).toBe('transfer');
    expect(row?.entity.matchType).toBe('learned');
  });
});

describe('imports.processImport — correction rule usage telemetry (#3626)', () => {
  it('bumps timesApplied + lastUsedAt on the winning rule when a live import matches it', async () => {
    const c = client();
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(created.data.id, { confidence: 0.9 });
    expect(created.data.timesApplied).toBe(0);

    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'bunnings-usage-1' }),
      ],
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    const after = await c.corrections.get(created.data.id);
    expect(after.data.timesApplied).toBe(1);
    expect(after.data.lastUsedAt).not.toBeNull();
  });

  it('does not bump usage from a pending-rules preview (reevaluateWithPendingRules)', async () => {
    const c = client();

    // No rule exists yet at process time — the transaction lands uncertain.
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'preview-usage-1' }),
      ],
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    // The rule is created (persisted) AFTER processing, so a live re-evaluation
    // of the still-uncertain transaction would now match it in-memory.
    const created = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(created.data.id, { confidence: 0.9 });

    // `reevaluateWithPendingRules` always merges DB rules with (possibly empty)
    // pending ChangeSets in-memory — a preview, never a real application.
    await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });

    const after = await c.corrections.get(created.data.id);
    expect(after.data.timesApplied).toBe(0);
    expect(after.data.lastUsedAt).toBeNull();
  });
});

describe('tag-rule usage telemetry — read-only lookups never count as usage', () => {
  it('does not bump a tag rule from the read-only GET /transactions/suggest-tags endpoint', async () => {
    const c = client();
    const rule = transactionTagRulesService.createTransactionTagRule(financeDb.db, {
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      tags: ['Hardware'],
    });
    expect(rule.timesApplied).toBe(0);

    const result = await c.transactions.suggestTags({
      description: 'BUNNINGS WAREHOUSE KINGSGROVE',
    });
    expect(result.tags).toEqual([{ tag: 'Hardware', source: 'rule', pattern: 'BUNNINGS' }]);

    const after = transactionTagRulesService.getTransactionTagRule(financeDb.db, rule.id);
    expect(after.timesApplied).toBe(0);
    expect(after.lastUsedAt).toBeNull();
  });

  it('does not bump a tag rule from a pending-rules preview (reevaluateWithPendingRules)', async () => {
    const c = client();

    // No rule exists yet at process time — the transaction lands uncertain.
    const { sessionId } = await c.imports.processImport({
      transactions: [
        parsed({ description: 'BUNNINGS WAREHOUSE KINGSGROVE', checksum: 'tag-preview-usage-1' }),
      ],
    });
    await waitForImportCompletion<ProcessImportOutput>(c, sessionId);

    // Both rules are created (persisted) AFTER processing, so a live
    // re-evaluation of the still-uncertain transaction would now match them
    // in-memory.
    const correction = await c.corrections.createOrUpdate({
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      transactionType: 'purchase',
    });
    await c.corrections.update(correction.data.id, { confidence: 0.9 });
    const tagRule = transactionTagRulesService.createTransactionTagRule(financeDb.db, {
      descriptionPattern: 'BUNNINGS',
      matchType: 'contains',
      tags: ['Hardware'],
    });

    // `reevaluateWithPendingRules` always merges DB rules with (possibly empty)
    // pending ChangeSets in-memory — a preview, never a real application.
    await c.imports.reevaluateWithPendingRules({
      sessionId,
      minConfidence: 0.7,
      pendingChangeSets: [],
    });

    const after = transactionTagRulesService.getTransactionTagRule(financeDb.db, tagRule.id);
    expect(after.timesApplied).toBe(0);
    expect(after.lastUsedAt).toBeNull();
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

  it('commits against the picked accountId end-to-end, not an account that name-matches the dialect label (POPS-2852)', async () => {
    const c = client();
    const pickedAccount = await c.accounts.create({
      name: 'Amex Business',
      kind: 'credit-card',
      currency: 'AUD',
    });

    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'COMMIT WITH REAL ACCOUNT',
          checksum: 'commit-accountid',
          dialectAccountLabel: 'Amex',
          accountId: pickedAccount.data.id,
        }),
      ],
    });

    const row = financeDb.raw
      .prepare('SELECT account_id FROM transactions WHERE checksum = ?')
      .get('commit-accountid') as { account_id: string };
    expect(row.account_id).toBe(pickedAccount.data.id);

    const nameMatched = await c.accounts.list({ search: 'Amex' });
    const nameMatchedAmex = nameMatched.data.find((a) => a.name === 'Amex');
    expect(nameMatchedAmex).toBeDefined();
    expect(row.account_id).not.toBe(nameMatchedAmex?.id);
  });

  it('commits a gift-card purchase as a transfer, keeping the descriptor tag (POPS-2610)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'WOOLWORTHS GIFT CARDS',
          checksum: 'commit-gift-card',
          transactionType: 'purchase',
          tags: ['contains:gift-card', 'contains:groceries'],
        }),
      ],
    });

    const row = financeDb.raw
      .prepare('SELECT type, tags FROM transactions WHERE checksum = ?')
      .get('commit-gift-card') as { type: string; tags: string };
    expect(row.type).toBe('transfer');
    expect(JSON.parse(row.tags)).toEqual(['contains:gift-card', 'contains:groceries']);
  });

  it('leaves a non-purchase gift-card row as the review authored it (POPS-2610)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'GIFT CARD REFUND',
          amount: 50,
          checksum: 'commit-gift-card-refund',
          transactionType: 'refund',
          entityId: 'ent-woolworths',
          entityName: 'Woolworths',
          tags: ['contains:gift-card'],
        }),
      ],
    });

    const row = financeDb.raw
      .prepare('SELECT type FROM transactions WHERE checksum = ?')
      .get('commit-gift-card-refund') as { type: string };
    expect(row.type).toBe('refund');
  });

  it('persists match provenance from the confirmed transaction (CF057/#3658)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'SPOTIFY AB',
          checksum: 'commit-provenance-learned',
          entityId: 'ent-spotify',
          entityName: 'Spotify',
          matchType: 'learned',
          matchRuleId: 'rule-42',
          matchConfidence: 0.91,
        }),
      ],
    });

    const row = financeDb.raw
      .prepare(
        'SELECT match_type, match_rule_id, match_confidence FROM transactions WHERE checksum = ?'
      )
      .get('commit-provenance-learned') as {
      match_type: string | null;
      match_rule_id: string | null;
      match_confidence: number | null;
    };
    expect(row).toEqual({
      match_type: 'learned',
      match_rule_id: 'rule-42',
      match_confidence: 0.91,
    });
  });

  it('persists no provenance when the confirmed transaction carries none (backward compatible)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({ description: 'COLES SUPERMARKET', checksum: 'commit-no-provenance' }),
      ],
    });

    const row = financeDb.raw
      .prepare(
        'SELECT match_type, match_rule_id, match_confidence FROM transactions WHERE checksum = ?'
      )
      .get('commit-no-provenance') as {
      match_type: string | null;
      match_rule_id: string | null;
      match_confidence: number | null;
    };
    expect(row).toEqual({ match_type: null, match_rule_id: null, match_confidence: null });
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

  it('is idempotent on a 409: a pre-existing contact name reuses the existing id', async () => {
    const contacts = withContacts([{ id: 'preexisting-ato', name: 'ATO', type: 'government' }]);
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000000a';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      transactions: [confirmed({ checksum: 'commit-dup', entityId: tempId, entityName: 'ATO' })],
    });
    // No duplicate contact created; the transaction points at the existing id.
    expect(contacts.entities.filter((e) => e.name === 'ATO')).toHaveLength(1);
    // Reusing an existing contact must NOT inflate the created count.
    expect(res.data.entitiesCreated).toBe(0);
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE checksum = ?')
      .get('commit-dup') as { entity_id: string };
    expect(txn.entity_id).toBe('preexisting-ato');
  });

  it('counts only real creates when a commit mixes a new and a reused contact', async () => {
    const contacts = withContacts([{ id: 'preexisting-ato', name: 'ATO', type: 'government' }]);
    const c = client(contacts);
    const tempNew = 'temp:entity:00000000-0000-0000-0000-00000000000b';
    const tempReused = 'temp:entity:00000000-0000-0000-0000-00000000000c';
    const res = await c.imports.commitImport({
      entities: [
        { tempId: tempNew, name: 'BrandNewCo', type: 'company' },
        { tempId: tempReused, name: 'ATO', type: 'government' },
      ],
      transactions: [
        confirmed({ checksum: 'mixed-new', entityId: tempNew, entityName: 'BrandNewCo' }),
        confirmed({ checksum: 'mixed-reused', entityId: tempReused, entityName: 'ATO' }),
      ],
    });
    expect(res.data.entitiesCreated).toBe(1);
    expect(contacts.entities.filter((e) => e.name === 'ATO')).toHaveLength(1);
    expect(contacts.entities.filter((e) => e.name === 'BrandNewCo')).toHaveLength(1);
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

  it('resolves an edit/disable/remove targeting a still-pending rule by its preview temp:<n> id (POPS-3158)', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      changeSets: [
        // Preview-numbered temp:1: an add later edited by a separate pending ChangeSet.
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'MAXXIA_EV',
                matchType: 'contains',
                transactionType: 'transfer',
              },
            },
          ],
        },
        {
          ops: [
            { op: 'edit', id: 'temp:1', data: { descriptionPattern: 'MAXXIA', tags: ['lease'] } },
          ],
        },
        // Preview-numbered temp:2: an add later removed outright before ever committing.
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'THROWAWAY',
                matchType: 'contains',
                transactionType: 'transfer',
              },
            },
          ],
        },
        { ops: [{ op: 'remove', id: 'temp:2' }] },
      ],
      transactions: [confirmed({ checksum: 'commit-pending-temp-chain' })],
    });
    expect(res.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });

    const rows = financeDb.raw
      .prepare('SELECT description_pattern, tags FROM transaction_corrections')
      .all() as { description_pattern: string; tags: string }[];
    expect(rows.map((r) => r.description_pattern)).toEqual(['MAXXIA']);
    expect(JSON.parse(rows[0]!.tags)).toEqual(['lease']);
  });

  it('still 404s on a temp:<n> id with no matching pending add (a genuine dangling reference)', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        changeSets: [{ ops: [{ op: 'edit', id: 'temp:1', data: { tags: ['x'] } }] }],
        transactions: [confirmed({ checksum: 'commit-dangling-temp-n' })],
      })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('degrades a bundled tags-only add op instead of rolling back the whole commit (CF061/#3650)', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000000d';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'DegradeCorp' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'GOOD RULE',
                matchType: 'contains',
                transactionType: 'purchase',
              },
            },
            {
              op: 'add',
              data: { descriptionPattern: 'BAD RULE', matchType: 'contains', tags: ['X'] },
            },
          ],
        },
      ],
      transactions: [
        confirmed({
          checksum: 'commit-degrade',
          entityId: tempId,
          entityName: 'DegradeCorp',
        }),
      ],
    });

    // The good rule, the entity creation, and the transaction insert all land —
    // only the tags-only op is dropped.
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.entitiesCreated).toBe(1);
    expect(res.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });

    const rules = financeDb.raw
      .prepare('SELECT description_pattern FROM transaction_corrections')
      .all() as { description_pattern: string }[];
    expect(rules.map((r) => r.description_pattern)).toEqual(['GOOD RULE']);

    const contact = contacts.entities.find((e) => e.name === 'DegradeCorp');
    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE checksum = ?')
      .get('commit-degrade') as { entity_id: string };
    expect(txn.entity_id).toBe(contact?.id);
  });

  it('degrades a bundled uncompilable regex add op instead of rolling back the whole commit (POPS-2600)', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000000e';
    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'RegexCorp' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'GOOD RULE',
                matchType: 'contains',
                transactionType: 'purchase',
              },
            },
            {
              // The detail editor pairs a free-text pattern with a `regex`
              // option and validates nothing client-side, so this is a typo a
              // user can actually commit — not a malformed payload.
              op: 'add',
              data: {
                descriptionPattern: '[unclosed',
                matchType: 'regex',
                transactionType: 'purchase',
              },
            },
          ],
        },
      ],
      transactions: [
        confirmed({ checksum: 'commit-regex', entityId: tempId, entityName: 'RegexCorp' }),
      ],
    });

    // The import survives: only the op that could never have fired is dropped.
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.entitiesCreated).toBe(1);
    expect(res.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });

    const rules = financeDb.raw
      .prepare('SELECT description_pattern FROM transaction_corrections')
      .all() as { description_pattern: string }[];
    expect(rules.map((r) => r.description_pattern)).toEqual(['GOOD RULE']);
  });

  it('counts a correction rule it created apart from one it merged into, and never blanks the merged tags (POPS-2954)', async () => {
    const c = client();

    const first = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'SPLIT_CORRECTION',
                matchType: 'contains',
                transactionType: 'purchase',
                tags: ['venue:cafe'],
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ checksum: 'commit-correction-split-a' })],
    });
    expect(first.data.rulesApplied).toEqual({ add: 1, edit: 0, disable: 0, remove: 0 });
    expect(first.data.correctionRuleWrites).toEqual({ inserted: 1, reinforced: 0 });

    const second = await c.imports.commitImport({
      changeSets: [
        {
          ops: [
            // Merges into the rule the first commit created — no tags of its
            // own, so the merge must leave `venue:cafe` alone rather than
            // blanking it (the defect this ticket fixes).
            {
              op: 'add',
              data: {
                descriptionPattern: 'SPLIT_CORRECTION',
                matchType: 'contains',
                transactionType: 'purchase',
              },
            },
            {
              op: 'add',
              data: {
                descriptionPattern: 'SPLIT_CORRECTION_NEW',
                matchType: 'contains',
                transactionType: 'purchase',
                tags: ['occasion:birthday'],
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ checksum: 'commit-correction-split-b' })],
    });

    // Two add ops, but only one of them created a rule.
    expect(second.data.rulesApplied).toEqual({ add: 2, edit: 0, disable: 0, remove: 0 });
    expect(second.data.correctionRuleWrites).toEqual({ inserted: 1, reinforced: 1 });

    const merged = financeDb.raw
      .prepare('SELECT tags FROM transaction_corrections WHERE description_pattern = ?')
      .get('SPLIT_CORRECTION') as { tags: string };
    expect(JSON.parse(merged.tags)).toEqual(['venue:cafe']);
  });

  it('applies pending tag-rule ChangeSets during commit', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          changeSet: {
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

  it('counts a rule it created apart from one it merged into (POPS-2755)', async () => {
    const c = client();
    const curated = () =>
      c.imports.commitImport({
        tagRuleChangeSets: [stagedTagRule('SPLIT_COUNT', ['FirstTag'], ['FirstTag'])],
        transactions: [confirmed({ description: 'SPLIT_COUNT 1', checksum: 'commit-split-a' })],
      });

    const first = await curated();
    expect(first.data.tagRuleWrites).toEqual({ inserted: 1, reinforced: 0 });

    const second = await c.imports.commitImport({
      tagRuleChangeSets: [
        stagedTagRule('SPLIT_COUNT', ['SecondTag'], ['SecondTag']),
        stagedTagRule('SPLIT_COUNT_NEW', ['ThirdTag'], ['ThirdTag']),
      ],
      transactions: [confirmed({ description: 'SPLIT_COUNT 2', checksum: 'commit-split-b' })],
    });

    // Two add ops, but only one of them created a rule.
    expect(second.data.tagRulesApplied).toBe(2);
    expect(second.data.tagRuleWrites).toEqual({ inserted: 1, reinforced: 1 });
  });

  it('an add op merges into a rule the batch did not create, never replacing its tags (POPS-2755)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [
        stagedTagRule('HUNGRY JACKS', ['Fast Food', 'Dining'], ['Fast Food', 'Dining']),
      ],
      transactions: [confirmed({ description: 'HUNGRY JACKS 1', checksum: 'commit-hj-a' })],
    });

    await c.imports.commitImport({
      tagRuleChangeSets: [stagedTagRule('HUNGRY JACKS', ['Cairns 2026'], ['Cairns 2026'])],
      transactions: [confirmed({ description: 'HUNGRY JACKS 2', checksum: 'commit-hj-b' })],
    });

    expect(tagRuleTags()).toEqual(['Fast Food', 'Dining', 'Cairns 2026']);
  });

  it('stages a wizard tag rule as one unused row — confidence 0.95, no usage counters (POPS-2597)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [stagedTagRule('STAGED_ONCE', ['StagedTag'], ['StagedTag'])],
      transactions: [confirmed({ description: 'STAGED_ONCE 1', checksum: 'commit-staged-once' })],
    });

    expect(storedTagRules('STAGED_ONCE')).toEqual([
      { confidence: 0.95, times_applied: 0, last_used_at: null },
    ]);
  });

  it('re-committing the same rule bumps confidence only, never the usage counters (POPS-2597)', async () => {
    const c = client();
    for (const checksum of ['commit-restage-a', 'commit-restage-b']) {
      await c.imports.commitImport({
        tagRuleChangeSets: [stagedTagRule('RESTAGED', ['StagedTag'], ['StagedTag'])],
        transactions: [confirmed({ description: 'RESTAGED 1', checksum })],
      });
    }

    expect(storedTagRules('RESTAGED')).toEqual([
      { confidence: 1.0, times_applied: 0, last_used_at: null },
    ]);
  });

  it('keeps only the accepted tag on the rule and in the vocabulary, never a declined one (POPS-2597, POPS-2643)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [stagedTagRule('ACCEPT_DECLINE', ['KeptTag', 'DeclinedTag'], ['KeptTag'])],
      transactions: [confirmed({ description: 'ACCEPT_DECLINE 1', checksum: 'commit-accepted' })],
    });

    expect(tagRuleTags()).toEqual(['KeptTag']);
    expect(vocabularyTags()).toContain('KeptTag');
    expect(vocabularyTags()).not.toContain('DeclinedTag');
  });

  it('drops an add op down to nothing rather than writing an empty tags array, and still succeeds (POPS-2643)', async () => {
    const c = client();
    const res = await c.imports.commitImport({
      tagRuleChangeSets: [stagedTagRule('ALL_DECLINED', ['DeclinedOne', 'DeclinedTwo'], [])],
      transactions: [confirmed({ description: 'ALL_DECLINED 1', checksum: 'commit-all-declined' })],
    });

    expect(res.data.tagRulesApplied).toBe(0);
    expect(storedTagRules('ALL_DECLINED')).toEqual([]);
    expect(vocabularyTags()).not.toContain('DeclinedOne');
    expect(vocabularyTags()).not.toContain('DeclinedTwo');
  });

  it('filters a declined tag out of an edit op the same way as an add op (POPS-2643)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [{ changeSet: tagRuleChangeSet('EDIT_ACCEPT_DECLINE', ['SeedTag']) }],
      transactions: [
        confirmed({ description: 'EDIT_ACCEPT_DECLINE 1', checksum: 'commit-edit-seed' }),
      ],
    });
    const ruleId = (
      financeDb.raw
        .prepare('SELECT id FROM transaction_tag_rules WHERE description_pattern = ?')
        .get('EDIT_ACCEPT_DECLINE') as { id: string }
    ).id;

    await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          changeSet: {
            source: 'unit-test',
            ops: [{ op: 'edit', id: ruleId, data: { tags: ['EditKeptTag', 'EditDeclinedTag'] } }],
          },
          acceptedNewTags: ['EditKeptTag'],
        },
      ],
      transactions: [
        confirmed({ description: 'EDIT_ACCEPT_DECLINE 2', checksum: 'commit-edit-decline' }),
      ],
    });

    expect(tagRuleTags()).toEqual(['EditKeptTag']);
    expect(vocabularyTags()).toContain('EditKeptTag');
    expect(vocabularyTags()).not.toContain('EditDeclinedTag');
  });

  it('leaves an edit op declined down to nothing off the applied ChangeSet, and still succeeds (POPS-2643)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [{ changeSet: tagRuleChangeSet('EDIT_ALL_DECLINED', ['SeedTag']) }],
      transactions: [
        confirmed({ description: 'EDIT_ALL_DECLINED 1', checksum: 'commit-edit-all-seed' }),
      ],
    });
    const ruleId = (
      financeDb.raw
        .prepare('SELECT id FROM transaction_tag_rules WHERE description_pattern = ?')
        .get('EDIT_ALL_DECLINED') as { id: string }
    ).id;

    const res = await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          changeSet: {
            source: 'unit-test',
            ops: [{ op: 'edit', id: ruleId, data: { tags: ['EditDeclinedOnly'] } }],
          },
          acceptedNewTags: [],
        },
      ],
      transactions: [
        confirmed({ description: 'EDIT_ALL_DECLINED 2', checksum: 'commit-edit-all-declined' }),
      ],
    });

    expect(res.data.tagRulesApplied).toBe(0);
    expect(tagRuleTags()).toEqual(['SeedTag']);
    expect(vocabularyTags()).not.toContain('EditDeclinedOnly');
  });

  it('applies an edit op other-field change even when its tags all decline (POPS-2643)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [
        { changeSet: tagRuleChangeSet('EDIT_DECLINE_KEEPS_FIELDS', ['SeedTag']) },
      ],
      transactions: [
        confirmed({
          description: 'EDIT_DECLINE_KEEPS_FIELDS 1',
          checksum: 'commit-edit-fields-seed',
        }),
      ],
    });
    const ruleId = (
      financeDb.raw
        .prepare('SELECT id FROM transaction_tag_rules WHERE description_pattern = ?')
        .get('EDIT_DECLINE_KEEPS_FIELDS') as { id: string }
    ).id;

    await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          changeSet: {
            source: 'unit-test',
            ops: [
              {
                op: 'edit',
                id: ruleId,
                data: { tags: ['EditDeclinedOnly'], isActive: false, priority: 7 },
              },
            ],
          },
          acceptedNewTags: [],
        },
      ],
      transactions: [
        confirmed({ description: 'EDIT_DECLINE_KEEPS_FIELDS 2', checksum: 'commit-edit-fields' }),
      ],
    });

    const row = financeDb.raw
      .prepare('SELECT is_active, priority, tags FROM transaction_tag_rules WHERE id = ?')
      .get(ruleId) as { is_active: number; priority: number; tags: string };
    expect(row.is_active).toBe(0);
    expect(row.priority).toBe(7);
    expect(JSON.parse(row.tags)).toEqual(['SeedTag']);
    expect(vocabularyTags()).not.toContain('EditDeclinedOnly');
  });

  it('drops a declined marker from the rule exactly like a declined open tag (POPS-2643)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [
        stagedTagRule('MARKER_DECLINE', ['KeptTag', 'person:declined-source'], ['KeptTag']),
      ],
      transactions: [
        confirmed({ description: 'MARKER_DECLINE 1', checksum: 'commit-marker-decline' }),
      ],
    });

    expect(tagRuleTags()).toEqual(['KeptTag']);
    expect(vocabularyTags()).not.toContain('person:declined-source');
  });

  it('upserts every ChangeSet tag onto the rule and the vocabulary when no accept/decline set is supplied (POPS-2643 boundary)', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          changeSet: tagRuleChangeSet('NO_ACCEPT_SET', ['BatchTagOne', 'BatchTagTwo']),
        },
      ],
      transactions: [confirmed({ description: 'NO_ACCEPT_SET 1', checksum: 'commit-batch-tags' })],
    });

    expect(tagRuleTags()).toEqual(expect.arrayContaining(['BatchTagOne', 'BatchTagTwo']));
    expect(vocabularyTags()).toEqual(expect.arrayContaining(['BatchTagOne', 'BatchTagTwo']));
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

  it('rejects a transaction entity id with a stray temp: prefix and persists no placeholder (CF016)', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        transactions: [
          confirmed({
            checksum: 'commit-stray-temp',
            entityId: 'temp:contact:00000000-0000-0000-0000-000000000abc',
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    const placeholderRows = financeDb.raw
      .prepare("SELECT count(*) as c FROM transactions WHERE entity_id LIKE 'temp:%'")
      .get() as { c: number };
    expect(placeholderRows.c).toBe(0);
  });

  it('rejects a correction ChangeSet op carrying a stray temp: entity id and writes no rule (CF016)', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        changeSets: [
          {
            ops: [
              {
                op: 'add',
                data: {
                  descriptionPattern: 'STRAYTEMP',
                  matchType: 'exact',
                  entityId: 'temp:contact:00000000-0000-0000-0000-000000000def',
                  entityName: 'Stray',
                },
              },
            ],
          },
        ],
        transactions: [confirmed({ checksum: 'commit-stray-cs' })],
      })
    ).rejects.toMatchObject({ status: 400 });

    const ruleRows = financeDb.raw
      .prepare("SELECT count(*) as c FROM transaction_corrections WHERE entity_id LIKE 'temp:%'")
      .get() as { c: number };
    expect(ruleRows.c).toBe(0);
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

describe('imports.commitImport — commit idempotency (#3640/#3642)', () => {
  it('a resubmit under the same commitKey is a no-op: identical result, no duplicate writes', async () => {
    const contacts = makeContactsFake();
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-0000000000c1';
    const payload = {
      commitKey: '11111111-1111-4111-8111-111111111111',
      entities: [{ tempId, name: 'IdempotentCo', type: 'company' as const }],
      changeSets: [
        {
          ops: [
            {
              op: 'add' as const,
              data: { descriptionPattern: 'IDEMPOTENTCO', matchType: 'exact' as const },
            },
          ],
        },
      ],
      transactions: [
        confirmed({
          description: 'IDEMPOTENTCO 1',
          checksum: 'idempotent-1',
          entityId: tempId,
          entityName: 'IdempotentCo',
        }),
      ],
    };

    const first = await c.imports.commitImport(payload);
    const second = await c.imports.commitImport(payload);

    expect(second.data).toEqual(first.data);
    expect(contacts.created).toHaveLength(1);

    const txnCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('idempotent-1') as { c: number };
    expect(txnCount.c).toBe(1);

    const ruleCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transaction_corrections WHERE description_pattern = ?')
      .get('IDEMPOTENTCO') as { c: number };
    expect(ruleCount.c).toBe(1);
  });

  it('two concurrent commits sharing a commitKey resolve to one applied write and one echoed result', async () => {
    const c = client();
    const payload = {
      commitKey: '22222222-2222-4222-8222-222222222222',
      transactions: [confirmed({ description: 'RACE MERCHANT', checksum: 'race-1' })],
    };

    const [a, b] = await Promise.all([
      c.imports.commitImport(payload),
      c.imports.commitImport(payload),
    ]);

    expect(a.data).toEqual(b.data);
    const txnCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('race-1') as { c: number };
    expect(txnCount.c).toBe(1);
  });

  it('a commit carrying draftId deletes the draft with the rows; a rejected one leaves it (finance ADR-005)', async () => {
    const c = client();
    const accountId = (
      await c.accounts.create({ name: 'Draft Owner', kind: 'checking', currency: 'AUD' })
    ).data.id;
    const draft = createImportDraft(financeDb.db, {
      accountId,
      sourceKind: 'file',
      state: 'saved',
      payload: '{}',
      rowCount: 1,
      unresolvedCount: 0,
      dateFrom: null,
      dateTo: null,
    });

    await expect(
      c.imports.commitImport({
        draftId: draft.id,
        transactions: [
          confirmed({ description: 'BAD', checksum: 'draft-bad', date: 'not-a-date' }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(getImportDraft(financeDb.db, draft.id)).toBeDefined();

    await c.imports.commitImport({
      draftId: draft.id,
      transactions: [confirmed({ description: 'DRAFT MERCHANT', checksum: 'draft-1' })],
    });
    expect(getImportDraft(financeDb.db, draft.id)).toBeUndefined();

    await expect(
      c.imports.commitImport({
        draftId: 'already-gone',
        transactions: [confirmed({ description: 'DRAFT MERCHANT 2', checksum: 'draft-2' })],
      })
    ).resolves.toBeDefined();
  });

  it('committing a live draft writes an api batch, mints the reported balance as a checkpoint dated to the newest row, and deletes the draft, all in one transaction (POPS-3335)', async () => {
    const c = client();
    const accountId = (
      await c.accounts.create({ name: 'Up Spending', kind: 'savings', currency: 'AUD' })
    ).data.id;
    const draft = createImportDraft(financeDb.db, {
      accountId,
      sourceKind: 'live',
      state: 'saved',
      provider: 'up',
      payload: '{}',
      rowCount: 2,
      unresolvedCount: 0,
      dateFrom: '2026-09-02',
      dateTo: '2026-09-04',
      balanceReportedCents: 61_215,
    });

    const result = await c.imports.commitImport({
      draftId: draft.id,
      commitKey: draft.id,
      transactions: [
        confirmed({
          description: 'COLES',
          checksum: 'live-1',
          accountId,
          amount: -12,
          date: '2026-09-02',
        }),
        confirmed({
          description: 'SALARY',
          checksum: 'live-2',
          accountId,
          amount: 500,
          date: '2026-09-04',
          transactionType: 'income',
        }),
      ],
    });

    expect(result.data.transactionsImported).toBe(2);
    expect(result.data.batches).toMatchObject([
      { accountId, sourceKind: 'api', rowCount: 2, dateFrom: '2026-09-02', dateTo: '2026-09-04' },
    ]);
    expect(
      financeDb.raw
        .prepare(
          'SELECT source_ref AS sourceRef, parser_version AS parserVersion FROM import_batches'
        )
        .all()
    ).toEqual([{ sourceRef: 'up', parserVersion: '1' }]);
    expect(result.data.checkpoints).toMatchObject([
      { accountId, balanceCents: 61_215, currency: 'AUD', asOf: '2026-09-04' },
    ]);
    const checkpoint = financeDb.raw
      .prepare(
        'SELECT balance_cents AS balanceCents, as_of AS asOf, source, source_ref AS sourceRef FROM account_checkpoints WHERE account_id = ?'
      )
      .all(accountId);
    expect(checkpoint).toEqual([
      { balanceCents: 61_215, asOf: '2026-09-04', source: 'import', sourceRef: draft.id },
    ]);
    expect(result.data.batches?.[0]?.checkpointId).toBe(result.data.checkpoints?.[0]?.id);
    expect(getImportDraft(financeDb.db, draft.id)).toBeUndefined();

    const replay = await c.imports.commitImport({
      draftId: draft.id,
      commitKey: draft.id,
      transactions: [
        confirmed({
          description: 'COLES',
          checksum: 'live-1',
          accountId,
          amount: -12,
          date: '2026-09-02',
        }),
      ],
    });
    expect(replay.data).toEqual(result.data);
    expect(financeDb.raw.prepare('SELECT count(*) AS c FROM account_checkpoints').get()).toEqual({
      c: 1,
    });
  });

  it('a live commit that is rejected leaves rows, checkpoint and draft untouched', async () => {
    const c = client();
    const accountId = (
      await c.accounts.create({ name: 'Up Saver', kind: 'savings', currency: 'AUD' })
    ).data.id;
    const draft = createImportDraft(financeDb.db, {
      accountId,
      sourceKind: 'live',
      state: 'saved',
      provider: 'up',
      payload: '{}',
      rowCount: 1,
      unresolvedCount: 0,
      dateFrom: '2026-09-02',
      dateTo: '2026-09-02',
      balanceReportedCents: 1_000,
    });

    await expect(
      c.imports.commitImport({
        draftId: draft.id,
        transactions: [
          confirmed({ description: 'BAD', checksum: 'live-bad', accountId, date: 'nope' }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(getImportDraft(financeDb.db, draft.id)).toBeDefined();
    expect(financeDb.raw.prepare('SELECT count(*) AS c FROM account_checkpoints').get()).toEqual({
      c: 0,
    });
    expect(financeDb.raw.prepare('SELECT count(*) AS c FROM import_batches').get()).toEqual({
      c: 0,
    });
  });

  it('omitting commitKey preserves the old best-effort behaviour (no dedup, documents the opt-in nature)', async () => {
    const c = client();
    const payload = {
      transactions: [confirmed({ description: 'NO KEY MERCHANT', checksum: 'no-key-1' })],
    };

    await c.imports.commitImport(payload);
    await c.imports.commitImport(payload);

    const txnCount = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('no-key-1') as { c: number };
    expect(txnCount.c).toBe(2);
  });
});

describe('imports.commitImport — contacts pre-create outbox during an outage (#3683)', () => {
  it('commits with a pending placeholder instead of aborting, and queues one outbox row', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab01';

    const res = await c.imports.commitImport({
      entities: [{ tempId, name: 'Woolworths', type: 'company' }],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS OUTAGE',
          checksum: 'outbox-commit-1',
          entityId: tempId,
          entityName: 'Woolworths',
        }),
      ],
    });

    // The commit succeeds — no 5xx, no throw — even though contacts never
    // resolved the pending entity.
    expect(res.data.transactionsImported).toBe(1);
    expect(res.data.transactionsFailed).toBe(0);
    expect(res.data.entitiesCreated).toBe(0);

    const txn = financeDb.raw
      .prepare('SELECT entity_id FROM transactions WHERE description = ?')
      .get('WOOLWORTHS OUTAGE') as { entity_id: string };
    expect(txn.entity_id).toMatch(/^pending:contact:/);

    const outboxRow = financeDb.raw
      .prepare(
        'SELECT id, name, type, status, attempts FROM entity_precreate_outbox WHERE name = ?'
      )
      .get('Woolworths') as {
      id: string;
      name: string;
      type: string;
      status: string;
      attempts: number;
    };
    expect(outboxRow.id).toBe(txn.entity_id);
    expect(outboxRow.type).toBe('company');
    expect(outboxRow.status).toBe('pending');
    expect(outboxRow.attempts).toBe(0);
  });

  it('threads the placeholder through a correction ChangeSet add op too', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab02';

    await c.imports.commitImport({
      entities: [{ tempId, name: 'ATO', type: 'government' }],
      changeSets: [
        {
          ops: [
            {
              op: 'add',
              data: {
                descriptionPattern: 'AUSTRALIAN TAX OFFICE',
                matchType: 'exact',
                entityId: tempId,
                entityName: 'ATO',
              },
            },
          ],
        },
      ],
      transactions: [confirmed({ checksum: 'outbox-commit-2' })],
    });

    const rule = financeDb.raw
      .prepare('SELECT entity_id FROM transaction_corrections WHERE description_pattern = ?')
      .get('AUSTRALIAN TAX OFFICE') as { entity_id: string };
    expect(rule.entity_id).toMatch(/^pending:contact:/);

    const outboxRow = financeDb.raw
      .prepare('SELECT id FROM entity_precreate_outbox WHERE name = ?')
      .get('ATO') as { id: string };
    expect(outboxRow.id).toBe(rule.entity_id);
  });

  it('queues an independent outbox row per pending entity in the same commit', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId1 = 'temp:entity:00000000-0000-0000-0000-00000000ab03';
    const tempId2 = 'temp:entity:00000000-0000-0000-0000-00000000ab04';

    await c.imports.commitImport({
      entities: [
        { tempId: tempId1, name: 'Woolworths', type: 'company' },
        { tempId: tempId2, name: 'Coles', type: 'company' },
      ],
      transactions: [
        confirmed({
          description: 'WOOLWORTHS A',
          checksum: 'outbox-commit-3a',
          entityId: tempId1,
          entityName: 'Woolworths',
        }),
        confirmed({
          description: 'COLES A',
          checksum: 'outbox-commit-3b',
          entityId: tempId2,
          entityName: 'Coles',
        }),
      ],
    });

    const rows = financeDb.raw
      .prepare('SELECT name, status FROM entity_precreate_outbox ORDER BY name')
      .all() as { name: string; status: string }[];
    expect(rows).toEqual([
      { name: 'Coles', status: 'pending' },
      { name: 'Woolworths', status: 'pending' },
    ]);
  });

  it('a rollback later in the same commit rolls back the outbox row too', async () => {
    const contacts = makeContactsFake({ unavailable: true });
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab05';

    await expect(
      c.imports.commitImport({
        entities: [{ tempId, name: 'RollbackOutboxTest', type: 'company' }],
        changeSets: [
          { ops: [{ op: 'edit', id: 'non-existent-rule-id', data: { confidence: 0.9 } }] },
        ],
        transactions: [
          confirmed({
            checksum: 'outbox-rollback-1',
            entityId: tempId,
            entityName: 'RollbackOutboxTest',
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 404 });

    const outboxRows = financeDb.raw
      .prepare('SELECT count(*) as c FROM entity_precreate_outbox WHERE name = ?')
      .get('RollbackOutboxTest') as { c: number };
    expect(outboxRows.c).toBe(0);
  });

  it('a PERMANENT contacts failure (bad-request) still aborts the commit before the tx opens', async () => {
    const list = () => Promise.resolve(page([], false));
    const create = () =>
      Promise.resolve<CallResult<{ data: ContactEntity; message: string }>>({
        kind: 'bad-request',
        pillar: 'contacts',
        message: 'entity type is not recognised',
      });
    const contacts = createContactsClient(() => stubHandle({ list, create }));
    const c = client(contacts);
    const tempId = 'temp:entity:00000000-0000-0000-0000-00000000ab06';

    await expect(
      c.imports.commitImport({
        entities: [{ tempId, name: 'GenuineBug', type: 'company' }],
        transactions: [confirmed({ checksum: 'outbox-genuine-error' })],
      })
    ).rejects.toMatchObject({ status: 500 });

    const txnRows = financeDb.raw
      .prepare('SELECT count(*) as c FROM transactions WHERE checksum = ?')
      .get('outbox-genuine-error') as { c: number };
    expect(txnRows.c).toBe(0);
    const outboxRows = financeDb.raw
      .prepare('SELECT count(*) as c FROM entity_precreate_outbox')
      .get() as { c: number };
    expect(outboxRows.c).toBe(0);
  });
});

describe('imports.commitImport — retroactive reclassification', () => {
  it('reclassifies existing transactions a new rule now matches', async () => {
    const c = client();
    seedTransaction({ description: 'WOOLWORTHS 9999', checksum: 'pre-existing-chk-1' });

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

describe('imports.commitImport — who may add to tag_vocabulary (POPS-2602)', () => {
  it('refuses a closed value an edit op would write onto an existing rule', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [{ changeSet: tagRuleChangeSet('EDIT TARGET', ['venue:cafe']) }],
      transactions: [confirmed({ description: 'EDIT TARGET 1', checksum: 'vocab-edit-seed' })],
    });
    const ruleId = (
      financeDb.raw
        .prepare('SELECT id FROM transaction_tag_rules WHERE description_pattern = ?')
        .get('EDIT TARGET') as { id: string }
    ).id;

    await expect(
      c.imports.commitImport({
        tagRuleChangeSets: [
          {
            changeSet: {
              source: 'unit-test',
              ops: [{ op: 'edit', id: ruleId, data: { tags: ['venue:speakeasy'] } }],
            },
          },
        ],
        transactions: [confirmed({ description: 'EDIT TARGET 2', checksum: 'vocab-edit' })],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(tagRuleTags()).toEqual(['venue:cafe']);
    expect(vocabularyTags()).not.toContain('venue:speakeasy');
  });

  it('admits an open value an edit op writes onto an existing rule', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [{ changeSet: tagRuleChangeSet('EDIT OPEN', ['venue:cafe']) }],
      transactions: [confirmed({ description: 'EDIT OPEN 1', checksum: 'vocab-edit-open-seed' })],
    });
    const ruleId = (
      financeDb.raw
        .prepare('SELECT id FROM transaction_tag_rules WHERE description_pattern = ?')
        .get('EDIT OPEN') as { id: string }
    ).id;

    await c.imports.commitImport({
      tagRuleChangeSets: [
        {
          changeSet: {
            source: 'unit-test',
            ops: [{ op: 'edit', id: ruleId, data: { tags: ['trip:hunter-valley'] } }],
          },
        },
      ],
      transactions: [confirmed({ description: 'EDIT OPEN 2', checksum: 'vocab-edit-open' })],
    });

    expect(vocabularyTags()).toContain('trip:hunter-valley');
  });

  it('admits a contains value the user names during review, which used to be rejected as closed', async () => {
    const c = client();

    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'CHEMIST WAREHOUSE',
          checksum: 'vocab-contains-open',
          tags: ['contains:sunscreen'],
        }),
      ],
    });

    expect(vocabularyTags()).toContain('contains:sunscreen');
  });

  it('still refuses a venue value the user names during review', async () => {
    const c = client();

    await expect(
      c.imports.commitImport({
        transactions: [
          confirmed({
            description: 'THE HIDDEN DOOR',
            checksum: 'vocab-venue-closed',
            tags: ['venue:speakeasy'],
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(vocabularyTags()).not.toContain('venue:speakeasy');
  });

  it('replays a recorded commit without re-judging it against a vocabulary that moved on', async () => {
    const c = client();
    const payload = {
      commitKey: '22222222-2222-4222-8222-222222222222',
      transactions: [
        confirmed({ description: 'THE LOCAL', checksum: 'vocab-replay', tags: ['venue:pub'] }),
      ],
    };
    const first = await c.imports.commitImport(payload);

    // The vocabulary moves on between the commit and its resubmit.
    financeDb.raw.prepare("UPDATE tag_vocabulary SET is_active = 0 WHERE tag = 'venue:pub'").run();

    const second = await c.imports.commitImport(payload);
    expect(second.data).toEqual(first.data);
  });

  it('admits an open-namespace value typed inline on a transaction', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({ description: 'FLIGHTS', checksum: 'vocab-open', tags: ['trip:tokyo-2026'] }),
      ],
    });

    expect(vocabularyTags()).toContain('trip:tokyo-2026');
  });

  it('reports an inline open value as known on the next tag-rule preview', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({ description: 'FLIGHTS', checksum: 'vocab-open-2', tags: ['trip:tokyo-2026'] }),
      ],
    });

    const preview = await c.tagRules.preview({
      changeSet: tagRuleChangeSet('FLIGHTS', ['trip:tokyo-2026']),
      transactions: [{ transactionId: 't1', description: 'FLIGHTS TO NRT', entityId: null }],
    });

    expect(preview.affected[0]?.after.suggestedTags[0]).toMatchObject({
      tag: 'trip:tokyo-2026',
      isNew: false,
    });
  });

  it('rejects a value a closed namespace does not hold, writing nothing at all', async () => {
    const c = client();
    await expect(
      c.imports.commitImport({
        tagRuleChangeSets: [stagedTagRule('SPEAKEASY', ['venue:speakeasy'], ['venue:speakeasy'])],
        transactions: [
          confirmed({
            description: 'SPEAKEASY',
            checksum: 'vocab-closed',
            tags: ['venue:speakeasy'],
          }),
        ],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(vocabularyTags()).not.toContain('venue:speakeasy');
    expect(storedTags()).toEqual([]);
    expect(tagRuleTags()).not.toContain('venue:speakeasy');
  });

  it('accepts a closed value the namespace does hold without re-adding it', async () => {
    const before = vocabularyTags().filter((t) => t === 'venue:pub').length;
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({ description: 'THE LOCAL', checksum: 'vocab-closed-ok', tags: ['venue:pub'] }),
      ],
    });

    expect(before).toBe(1);
    expect(vocabularyTags().filter((t) => t === 'venue:pub')).toHaveLength(1);
  });

  it('carries a marker tag onto the transaction but never into the vocabulary', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'NEW CONTACT LINK',
          checksum: 'vocab-marker',
          tags: ['person:new-contact'],
        }),
      ],
    });

    expect(storedTags()).toEqual([['person:new-contact']]);
    expect(vocabularyTags()).not.toContain('person:new-contact');
  });

  it('upserts a new enrich value the way it upserts any other open tag (0103)', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({
          description: 'NEW MARKETPLACE',
          checksum: 'vocab-enrich-open',
          tags: ['enrich:new-marketplace'],
        }),
      ],
    });

    expect(storedTags()).toEqual([['enrich:new-marketplace']]);
    expect(vocabularyTags()).toContain('enrich:new-marketplace');
  });

  it('treats a value differing only in case as the one already in the vocabulary', async () => {
    const c = client();
    await c.imports.commitImport({
      transactions: [
        confirmed({ description: 'THE LOCAL', checksum: 'vocab-case', tags: ['Venue:Pub'] }),
      ],
    });

    expect(vocabularyTags()).not.toContain('Venue:Pub');
  });

  it('adds nothing when a later phase of the commit throws', async () => {
    const c = client();
    const before = vocabularyTags();
    await expect(
      c.imports.commitImport({
        // The vocabulary phase runs first and admits `trip:rolled-back`; this
        // remove op then throws inside the same SQLite transaction.
        changeSets: [{ ops: [{ op: 'remove', id: 'no-such-correction' }] }],
        transactions: [confirmed({ checksum: 'vocab-rollback', tags: ['trip:rolled-back'] })],
      })
    ).rejects.toMatchObject({ status: 404 });

    expect(vocabularyTags()).toEqual(before);
    expect(storedTags()).toEqual([]);
  });

  // POPS-2643 made a declined tag never reach `transaction_tag_rules` at all,
  // so this assertion needs no carve-out for one: the superset holds over
  // every tag actually written, including a rule staged with a decline.
  it('keeps the vocabulary a superset of every committed transaction and tag-rule tag, with no exception for a decline', async () => {
    const c = client();
    await c.imports.commitImport({
      tagRuleChangeSets: [
        { changeSet: tagRuleChangeSet('SUPERSET RULE', ['asset:ute', 'venue:cafe']) },
        stagedTagRule('SUPERSET DECLINE', ['SupersetKept', 'SupersetDeclined'], ['SupersetKept']),
      ],
      transactions: [
        confirmed({
          description: 'SUPERSET RULE 1',
          checksum: 'vocab-superset',
          tags: ['asset:ute', 'venue:cafe', 'hobby:diving'],
        }),
      ],
    });

    const known = new Set(vocabularyTags().map((t) => t.toLowerCase()));
    const written = [...storedTags().flat(), ...tagRuleTags()];
    expect(written.length).toBeGreaterThan(0);
    expect(written.filter((t) => !known.has(t.toLowerCase()))).toEqual([]);
    expect(tagRuleTags()).not.toContain('SupersetDeclined');
  });
});

describe('imports — AI seam', () => {
  it('keeps the categorizer disabled by default (no entity suggestion, zero counters)', async () => {
    const c = client();
    const { sessionId } = await c.imports.processImport({
      transactions: [parsed({ description: 'COMPLETELY UNSEEN VENDOR', checksum: 'ai-seam-1' })],
    });
    const result = await waitForImportCompletion<ProcessImportOutput>(c, sessionId);
    expect(result.uncertain[0]?.entity.matchType).toBe('none');
    expect(result.uncertain[0]?.error).toBe('No entity match found (AI categorization disabled)');
    expect(result.aiUsage).toBeUndefined();
  });
});
