/**
 * Import-time checkpoint minting (POPS-2882): the sign rule in isolation, and
 * the commit pipeline end to end — one checkpoint from a statement's closing
 * balance, a re-import that must not double it, and a mismatch that must warn
 * without failing the commit.
 */
import { describe, expect, it, vi } from 'vitest';

import { freshMigratedFinanceDb } from '../../../../db/__tests__/migrated-db.js';
import { accountCheckpoints } from '../../../../db/schema.js';
import { insertCheckpoint } from '../../../../db/services/account-checkpoints.js';
import { createAccount } from '../../../../db/services/accounts.js';
import { recordCommit } from '../../../../db/services/import-commits.js';
import { page, stubHandle } from '../../../contacts/__tests__/stub-handle.js';
import { createContactsClient } from '../../../contacts/client.js';
import { signStatementBalance } from '../commit-checkpoint.js';
import { commitImport } from '../commit.js';

import type { FinanceDb } from '../../../../db/services/internal.js';
import type { CommitPayload } from '../types.js';

function noContacts() {
  return createContactsClient(() => stubHandle({ list: vi.fn(async () => page([], false)) }));
}

describe('signStatementBalance', () => {
  it("signs a liability's unmarked printed balance negative (money owed)", () => {
    expect(signStatementBalance(64_080, undefined, 'liability')).toBe(-64_080);
  });

  it("signs a liability's CR-marked balance positive (in credit)", () => {
    expect(signStatementBalance(64_080, 'CR', 'liability')).toBe(64_080);
  });

  it("signs an asset's unmarked printed balance positive (money held)", () => {
    expect(signStatementBalance(64_080, undefined, 'asset')).toBe(64_080);
  });

  it("signs an asset's DR-marked balance negative (overdrawn)", () => {
    expect(signStatementBalance(64_080, 'DR', 'asset')).toBe(-64_080);
  });
});

function creditCardPayload(accountId: string): CommitPayload {
  return {
    entities: [],
    changeSets: [],
    tagRuleChangeSets: [],
    transactions: [
      {
        date: '2026-07-05',
        description: 'Coffee shop',
        amount: -4.5,
        dialectAccountLabel: 'Test Credit Card',
        accountId,
        rawRow: '{}',
        checksum: 'chk-coffee',
        transactionType: 'purchase',
        balanceCents: 45_000,
      },
      {
        date: '2026-07-10',
        description: 'Groceries',
        amount: -20,
        dialectAccountLabel: 'Test Credit Card',
        accountId,
        rawRow: '{}',
        checksum: 'chk-groceries',
        transactionType: 'purchase',
        balanceCents: 65_000,
      },
    ],
  };
}

function seedAccount(db: FinanceDb): string {
  const account = createAccount(db, {
    name: 'Test Credit Card',
    kind: 'credit-card',
    currency: 'AUD',
  });
  return account.id;
}

describe('mintImportCheckpointsPhase, via commitImport', () => {
  it('mints one checkpoint from the last row in file order, ledger-signed negative for a credit card', async () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);

    const result = await commitImport(db, noContacts(), creditCardPayload(accountId));

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(2);
    expect(result.warnings).toBeUndefined();

    const checkpoints = db.select().from(accountCheckpoints).all();
    expect(checkpoints).toHaveLength(1);
    expect(checkpoints[0]).toMatchObject({
      accountId,
      asOf: '2026-07-10',
      balanceCents: -65_000,
      source: 'import',
    });
    expect(result.checkpoints).toEqual([
      {
        id: checkpoints[0]?.id,
        accountId,
        balanceCents: -65_000,
        currency: 'AUD',
        asOf: '2026-07-10',
        deltaCents: 0,
      },
    ]);
  });

  it('does not double the checkpoint on a re-import of the same statement', async () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);
    const payload = creditCardPayload(accountId);

    const first = await commitImport(db, noContacts(), payload);
    expect(first.checkpoints).toHaveLength(1);

    const second = await commitImport(db, noContacts(), creditCardPayload(accountId));

    expect(second.failedDetails).toEqual([]);
    expect(second.checkpoints).toEqual([]);
    expect(db.select().from(accountCheckpoints).all()).toHaveLength(1);
  });

  it('replays a result recorded before checkpoints existed instead of failing to parse it', async () => {
    // `import_commits.result` rows are opaque JSON kept forever with no
    // cleanup, and a repeated `commitKey` — a dropped response the tab
    // retries — is re-parsed against today's contract. A row written before
    // this field existed must still come back, or an already-successful
    // commit reports a failure on retry.
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);
    const legacyResult = {
      entitiesCreated: 0,
      rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
      tagRulesApplied: 0,
      transactionsImported: 2,
      transactionsFailed: 0,
      failedDetails: [],
      retroactiveReclassifications: 0,
    };
    recordCommit(db, 'legacy-key', legacyResult);

    const replayed = await commitImport(db, noContacts(), {
      ...creditCardPayload(accountId),
      commitKey: 'legacy-key',
    });

    expect(replayed).toEqual(legacyResult);
    expect(db.select().from(accountCheckpoints).all()).toEqual([]);
  });

  it('warns with the expected/actual/delta when the ledger disagrees, and still commits', async () => {
    const { db } = freshMigratedFinanceDb();
    const accountId = seedAccount(db);
    insertCheckpoint(db, {
      accountId,
      balanceCents: -1_000,
      asOf: '2026-06-01',
      source: 'manual',
    });

    const payload: CommitPayload = {
      entities: [],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        {
          date: '2026-07-05',
          description: 'Coffee shop',
          amount: -5,
          dialectAccountLabel: 'Test Credit Card',
          accountId,
          rawRow: '{}',
          checksum: 'chk-short-import',
          transactionType: 'purchase',
          // The statement says $40 owed; the one row imported only accounts
          // for $5 more debt on top of the $10 the prior checkpoint recorded
          // — a $25 gap the ledger is missing rows for.
          balanceCents: 4_000,
        },
      ],
    };

    const result = await commitImport(db, noContacts(), payload);

    expect(result.failedDetails).toEqual([]);
    expect(result.transactionsImported).toBe(1);
    expect(result.checkpoints?.[0]?.deltaCents).toBe(-2_500);
    expect(result.warnings).toEqual([
      {
        type: 'CHECKPOINT_MISMATCH',
        message: "Ledger disagrees with Test Credit Card's statement closing balance",
        affectedCount: 1,
        details: 'expected -1500c, statement says -4000c (Δ -2500c)',
      },
    ]);
  });

  it("keeps every account's checkpoint when one commit spans two accounts", async () => {
    // The final-review step lets a row be retargeted to a different account,
    // so one commit can mint for several. A singular result field would keep
    // only the last-processed account's, silently dropping the rest from the
    // response while writing them all to the database.
    const { db } = freshMigratedFinanceDb();
    const cardId = seedAccount(db);
    const savings = createAccount(db, { name: 'Test Savings', kind: 'savings', currency: 'AUD' });

    const payload: CommitPayload = {
      entities: [],
      changeSets: [],
      tagRuleChangeSets: [],
      transactions: [
        {
          date: '2026-07-05',
          description: 'Coffee shop',
          amount: -4.5,
          dialectAccountLabel: 'Test Credit Card',
          accountId: cardId,
          rawRow: '{}',
          checksum: 'chk-card',
          transactionType: 'purchase',
          balanceCents: 45_000,
        },
        {
          date: '2026-07-06',
          description: 'Salary',
          amount: 1_000,
          dialectAccountLabel: 'Test Savings',
          accountId: savings.id,
          rawRow: '{}',
          checksum: 'chk-savings',
          transactionType: 'income',
          balanceCents: 250_000,
        },
      ],
    };

    const result = await commitImport(db, noContacts(), payload);

    expect(result.checkpoints).toHaveLength(2);
    expect((result.checkpoints ?? []).map((c) => c.accountId).toSorted()).toEqual(
      [cardId, savings.id].toSorted()
    );
    expect(db.select().from(accountCheckpoints).all()).toHaveLength(2);
  });
});
