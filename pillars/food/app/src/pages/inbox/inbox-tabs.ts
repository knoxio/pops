/**
 * PRD-134 — shared tab-key constants for the `/food/inbox` shell.
 *
 * Three keys: `drafts` (default), `rejected`, `failed`. The `InboxPage`
 * reads `?tab=` and falls back to `drafts` for any unrecognised value,
 * normalising the URL via `router.replace` so the address bar reflects
 * the actual rendered tab.
 */
export type InboxTabKey = 'drafts' | 'rejected' | 'failed';

export const INBOX_TABS: readonly InboxTabKey[] = ['drafts', 'rejected', 'failed'];
export const DEFAULT_INBOX_TAB: InboxTabKey = 'drafts';

export function parseTabKey(raw: string | null | undefined): InboxTabKey {
  if (raw === null || raw === undefined) return DEFAULT_INBOX_TAB;
  return (INBOX_TABS as readonly string[]).includes(raw) ? (raw as InboxTabKey) : DEFAULT_INBOX_TAB;
}
