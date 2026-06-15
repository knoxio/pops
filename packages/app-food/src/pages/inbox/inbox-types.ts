/**
 * PRD-138 — shared types + tiny helpers for the Rejected / Failed tabs.
 *
 * The row + filter shapes live here so the tab page, row component, filter
 * component, and stories all import from one place — and so the public
 * surface stays stable when the underlying tRPC procedure types are
 * regenerated.
 */
import { type IngestSourceKind } from '@pops/app-food-db';

export type { FailedRow, RejectedRow, RejectionReason } from '@pops/app-food-db';
export type { IngestSourceKind } from '@pops/app-food-db';

export type SinceDays = 7 | 30 | 90 | null;

export const INGEST_KINDS: readonly IngestSourceKind[] = [
  'url-web',
  'url-instagram',
  'text',
  'screenshot',
] as const;

export const REJECTION_REASONS = [
  'wrong-recipe',
  'low-quality-extraction',
  'duplicate',
  'not-a-recipe',
  'other',
] as const;

export const SINCE_DAYS_OPTIONS: readonly { value: SinceDays; key: string }[] = [
  { value: 7, key: '7d' },
  { value: 30, key: '30d' },
  { value: 90, key: '90d' },
  { value: null, key: 'all' },
];

export const DEFAULT_SINCE_DAYS: SinceDays = 30;

export function truncate(s: string | null | undefined, max: number): string {
  if (s === null || s === undefined) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

export function relativeTimeFrom(iso: string, now: Date): string {
  // Clamp at 0 so client/server clock skew (or a future-dated timestamp)
  // never renders "-5s ago". Use floor on every unit boundary so 59s
  // doesn't round up to "1m ago" — the displayed unit always matches the
  // SI definition of "elapsed whole units".
  const rawMs = now.getTime() - new Date(iso).getTime();
  const ms = Math.max(0, rawMs);
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Decide which ViewSourceDialog tab is meaningful for a row. Screenshots
 * and text ingests don't have a URL (the source media IS the source), so
 * the row collapses the cell to a kind chip.
 */
export function hasOpenableSourceUrl(kind: IngestSourceKind, url: string | null): boolean {
  return (kind === 'url-web' || kind === 'url-instagram') && url !== null && url.length > 0;
}
