/**
 * What a signed Up webhook event does once it is trusted (POPS-2920).
 *
 * Up's event carries only the transaction's id, so the row is fetched back
 * through the same client the batch sync uses, mapped by the same mapper, and
 * deduped on the same checksum — a row the webhook wrote and the same row a
 * later sync fetches are one row, whichever came first. A created row lands
 * through the unattended commit path as a batch of one; a settled event for
 * a row already held settles it in place; a delivery for a row the ledger
 * already has in that state is a duplicate and writes nothing.
 *
 * Which token to fetch with is not in the event either. Every account fed by
 * Up names the secret its token lives under; an Up token is per customer, so
 * the distinct names are tried in turn and a 404 means "not this customer's",
 * not "gone". The transaction's own account id then picks the POPS account,
 * or reports the Up account nobody has mapped so the operator can.
 *
 * `TRANSACTION_DELETED` writes nothing on purpose: a deletion is reconciled
 * by the next batch sync, which sees the row missing from the range, rather
 * than by trusting a single event to remove ledger history.
 *
 * Deliveries for one transaction are serialised. Up sends CREATED and
 * SETTLED back to back for an instantly settled purchase, and redelivers on
 * a slow ack; the router acks and hands each event off without waiting, so
 * two of them can be in flight together. The checksum check and the write
 * are separated by the contacts and matcher calls, and nothing in the table
 * makes a checksum unique, so two concurrent ingests of one transaction
 * would each see no row and each write one. Chaining them per transaction id
 * makes the second one run after the first has committed, where it finds the
 * row and settles or skips it. The commit key is the transaction's own id,
 * so even a second process importing the same transaction hits the
 * `import_commits` primary key and gets the first commit's result back
 * instead of a second row.
 */
import {
  accountImportConfigService,
  accountsService,
  importDraftsService,
  importsService,
  type FinanceDb,
} from '../../../db/index.js';
import { requireNamedSecret } from '../../secrets.js';
import { dropStagedRow, settleStagedRow, stageMappedRows } from '../import-drafts/live-draft.js';
import { toParsedTransaction, upChecksum, type MappedUpTransaction } from './map-transaction.js';
import {
  createUpBankClient,
  UpBankApiError,
  type UpBankClient,
  type UpTransaction,
} from './up-api.js';
import { settleMappedRows } from './write-rows.js';

import type { ContactsClient } from '../../contacts/client.js';

export interface UpWebhookEvent {
  eventType: string | undefined;
  transactionId: string | undefined;
}

export type UpWebhookOutcome =
  /** The row now waits in the account's pending draft (finance ADR-005); `created` when this delivery opened it. */
  | { kind: 'staged'; accountId: string; draftId: string; created: boolean }
  /** A row the draft already held, settled in place inside it. */
  | { kind: 'staged-settled'; accountId: string; draftId: string }
  /** A row the draft already held; nothing to change, or the draft is open in a wizard and is not touched. */
  | { kind: 'already-staged'; accountId: string }
  | { kind: 'settled'; accountId: string; transactionId: string }
  /** The settled amount would have contradicted the row's type; it stays held (POPS-2685). */
  | { kind: 'settle-refused'; accountId: string; transactionId: string }
  | { kind: 'duplicate'; accountId: string }
  | { kind: 'unmapped'; upAccountId: string; transactionId: string }
  /** `staged: true` when the row was dropped from a pending draft; the ledger is left to the next sync. */
  | { kind: 'deleted'; transactionId: string; staged: boolean }
  | { kind: 'ignored'; reason: string };

export type UpWebhookIngest = (event: UpWebhookEvent) => Promise<UpWebhookOutcome>;

export interface UpWebhookIngestDeps {
  /** A client for the token under `secretRef`; tests inject one, production reads the secret. */
  clientFor?: (secretRef: string) => UpBankClient;
}

const INGESTED_EVENTS = new Set(['TRANSACTION_CREATED', 'TRANSACTION_SETTLED']);

/** One commit per Up transaction, whatever delivers it. */
function defaultClientFor(secretRef: string): UpBankClient {
  return createUpBankClient({ token: requireNamedSecret(secretRef) });
}

interface Fetched {
  txn: UpTransaction;
  client: UpBankClient;
}

async function fetchAcrossTokens(
  secretRefs: readonly string[],
  transactionId: string,
  clientFor: (secretRef: string) => UpBankClient
): Promise<Fetched | null> {
  for (const secretRef of secretRefs) {
    const client = clientFor(secretRef);
    try {
      return { txn: await client.getTransaction(transactionId), client };
    } catch (err) {
      if (err instanceof UpBankApiError && err.status === 404) continue;
      throw err;
    }
  }
  return null;
}

async function writeRow(
  { db, contacts }: IngestContext,
  target: { accountId: string; accountName: string },
  mapped: MappedUpTransaction,
  balanceCents: number | null
): Promise<UpWebhookOutcome> {
  const { accountId } = target;
  const existing = importsService
    .findTransactionsByChecksums(db, [mapped.parsed.checksum])
    .get(mapped.parsed.checksum);
  if (existing !== undefined) {
    if (existing.pending && !mapped.parsed.pending) {
      const { refused } = settleMappedRows(db, [{ transactionId: existing.id, mapped }]);
      if (refused.length > 0) {
        return { kind: 'settle-refused', accountId, transactionId: existing.id };
      }
      return { kind: 'settled', accountId, transactionId: existing.id };
    }
    return { kind: 'duplicate', accountId };
  }
  if (!mapped.parsed.pending) {
    const settledInDraft = settleStagedRow(db, accountId, mapped);
    if (settledInDraft !== 'absent') {
      return settledInDraft === 'changed'
        ? { kind: 'staged-settled', accountId, draftId: stagedDraftId(db, accountId, mapped) }
        : { kind: 'already-staged', accountId };
    }
  }
  const staged = await stageMappedRows({ db, contacts, target, rows: [mapped], balanceCents });
  if (staged.staged === 0) return { kind: 'already-staged', accountId };
  return { kind: 'staged', accountId, draftId: staged.draftId, created: staged.created };
}

function stagedDraftId(db: FinanceDb, accountId: string, mapped: MappedUpTransaction): string {
  const holder = importDraftsService
    .listImportDrafts(db, { accountId })
    .find((draft) => draft.payload.includes(mapped.parsed.checksum));
  return holder?.id ?? '';
}

function dropEverywhere(db: FinanceDb, transactionId: string): boolean {
  return accountImportConfigService
    .listImportConfigsByProvider(db, 'up')
    .some(
      (config) =>
        dropStagedRow(db, config.accountId, upChecksum(config.accountId, transactionId)) ===
        'changed'
    );
}

function serialisedBy(): <T>(key: string, run: () => Promise<T>) => Promise<T> {
  const inFlight = new Map<string, Promise<void>>();
  return (key, run) => {
    const previous = inFlight.get(key) ?? Promise.resolve();
    const next = previous.then(run);
    const settled = next.then(
      () => undefined,
      () => undefined
    );
    inFlight.set(key, settled);
    void settled.then(() => {
      if (inFlight.get(key) === settled) inFlight.delete(key);
    });
    return next;
  };
}

interface IngestContext {
  db: FinanceDb;
  contacts: ContactsClient;
  clientFor: (secretRef: string) => UpBankClient;
}

/** Build the ingest for one pillar process; each event resolves to what it did. */
export function makeUpWebhookIngest(
  db: FinanceDb,
  contacts: ContactsClient,
  deps: UpWebhookIngestDeps = {}
): UpWebhookIngest {
  const ctx: IngestContext = { db, contacts, clientFor: deps.clientFor ?? defaultClientFor };
  const serialised = serialisedBy();
  return (event) => {
    if (event.transactionId === undefined) {
      return Promise.resolve({ kind: 'ignored', reason: 'no transaction id' });
    }
    const transactionId = event.transactionId;
    return serialised(transactionId, () => ingestTransaction(ctx, event.eventType, transactionId));
  };
}

async function ingestTransaction(
  ctx: IngestContext,
  eventType: string | undefined,
  transactionId: string
): Promise<UpWebhookOutcome> {
  const { db, clientFor } = ctx;
  if (eventType === 'TRANSACTION_DELETED') {
    return { kind: 'deleted', transactionId, staged: dropEverywhere(db, transactionId) };
  }
  if (eventType === undefined || !INGESTED_EVENTS.has(eventType)) {
    return { kind: 'ignored', reason: `event ${eventType ?? 'unknown'} is not ingested` };
  }

  const configs = accountImportConfigService.listImportConfigsByProvider(db, 'up');
  const secretRefs = [...new Set(configs.flatMap((c) => (c.secretRef ? [c.secretRef] : [])))];
  if (secretRefs.length === 0) {
    return { kind: 'ignored', reason: 'no account fed by Up names a secret' };
  }

  const fetched = await fetchAcrossTokens(secretRefs, transactionId, clientFor);
  if (fetched === null) {
    return { kind: 'ignored', reason: `transaction ${transactionId} not found under any token` };
  }

  const { txn, client } = fetched;
  const upAccountId = txn.relationships.account.data.id;
  const config = configs.find((c) => c.externalAccountRef === upAccountId);
  if (config === undefined) return { kind: 'unmapped', upAccountId, transactionId: txn.id };

  const account = accountsService.getAccount(db, config.accountId);
  const mapped = toParsedTransaction(txn, { accountId: account.id, accountLabel: account.name });
  // The balance Up reports with the newest row rides on the draft and becomes
  // the checkpoint when it is committed (POPS-3335); one extra read per delivery.
  const balanceCents = (await client.getAccount(upAccountId)).attributes.balance.valueInBaseUnits;
  return writeRow(ctx, { accountId: account.id, accountName: account.name }, mapped, balanceCents);
}
