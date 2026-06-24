/**
 * Shared tab-key constants for the `/food/inbox` shell. `InboxPage` reads
 * `?tab=` and falls back to `drafts` for any unrecognised value, then
 * normalises the URL so the address bar reflects the rendered tab.
 */
export type InboxTabKey = 'drafts' | 'rejected' | 'failed';

export const INBOX_TABS: readonly InboxTabKey[] = ['drafts', 'rejected', 'failed'];
export const DEFAULT_INBOX_TAB: InboxTabKey = 'drafts';

export function parseTabKey(raw: string | null | undefined): InboxTabKey {
  if (raw === null || raw === undefined) return DEFAULT_INBOX_TAB;
  return (INBOX_TABS as readonly string[]).includes(raw) ? (raw as InboxTabKey) : DEFAULT_INBOX_TAB;
}
