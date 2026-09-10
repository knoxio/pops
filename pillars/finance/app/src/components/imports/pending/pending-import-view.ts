/**
 * The pure half of a pending-import card (POPS-3332): what a draft is called,
 * the order cards are dealt with in, and the age of an open lease. The
 * wording lives in the components with `t`; nothing here needs a locale.
 */
import type { AccountOption } from '@pops/ui';

import type { ImportDraftsListResponses } from '../../../finance-api/types.gen.js';

export type PendingImport = ImportDraftsListResponses[200]['data'][number];

/** A draft joined with the account it belongs to, as every card wants it. */
export interface PendingImportItem {
  draft: PendingImport;
  account: AccountOption;
}

/** Unusable first, then open, live, saved; newest saved first inside a state. */
const ORDER: Record<PendingImport['state'], number> = {
  unusable: 0,
  'left-open': 1,
  open: 1,
  live: 2,
  saved: 3,
};

export function sortPending<T extends { draft: PendingImport }>(items: T[]): T[] {
  return items.toSorted(
    (a, b) =>
      ORDER[a.draft.state] - ORDER[b.draft.state] || b.draft.savedAt.localeCompare(a.draft.savedAt)
  );
}

/** Join drafts with their accounts; a draft whose account the list does not know is dropped. */
export function joinPendingAccounts(
  drafts: PendingImport[],
  accounts: AccountOption[]
): PendingImportItem[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  return drafts.flatMap((draft) => {
    const account = byId.get(draft.accountId);
    return account === undefined ? [] : [{ draft, account }];
  });
}

/** The first file name, with a count of the rest; the provider for a live draft. */
export function sourceLabel(
  source: PendingImport['source'],
  more: (first: string, rest: number) => string,
  live: (provider: string) => string
): string {
  if (source.kind === 'live') return live(source.provider === 'up' ? 'Up' : source.provider);
  const [first, ...rest] = source.fileNames;
  if (first === undefined) return source.dialectId ?? '';
  return rest.length === 0 ? first : more(first, rest.length);
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS));
}

export const whenLabel = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

export const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
