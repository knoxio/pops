/**
 * Local-only query history persistence (PRD-082).
 *
 * Past queries live in `localStorage` so the user can re-run them after
 * a reload. Server-side persistence is intentionally deferred — see the
 * follow-up issue referenced in the PR description. The mechanism
 * mirrors the engram draft storage pattern (silent no-op on quota
 * errors, defensive shape validation on read).
 */
import { QUERY_DOMAINS, type QueryDomain, type QueryHistoryEntry } from './types';

const STORAGE_KEY = 'pops.cerebrum.query-history';
const MAX_ENTRIES = 20;

function isQueryDomain(value: unknown): value is QueryDomain {
  return typeof value === 'string' && (QUERY_DOMAINS as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((s) => typeof s === 'string');
}

function isQueryDomainArray(value: unknown): value is QueryDomain[] {
  return Array.isArray(value) && value.every(isQueryDomain);
}

function isConfidenceField(value: unknown): boolean {
  return value === null || value === 'high' || value === 'medium' || value === 'low';
}

function isHistoryEntry(value: unknown): value is QueryHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.submittedAt === 'string' &&
    typeof v.question === 'string' &&
    isStringArray(v.scopes) &&
    isQueryDomainArray(v.domains) &&
    typeof v.includeSecret === 'boolean' &&
    isConfidenceField(v.lastConfidence) &&
    typeof v.lastSourceCount === 'number'
  );
}

/** Read the persisted history, oldest-first invalid entries silently filtered out. */
export function readQueryHistory(storage: Storage = window.localStorage): QueryHistoryEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry).slice(0, MAX_ENTRIES);
  } catch (err) {
    // Fallback is safe (empty history), but a parse/storage failure is
    // worth surfacing so real regressions don't go unnoticed.
    console.warn('[cerebrum.query] failed to read history', describeError(err));
    return [];
  }
}

/** Persist the history. No-ops on quota errors but logs a diagnostic. */
export function writeQueryHistory(
  entries: QueryHistoryEntry[],
  storage: Storage = window.localStorage
): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch (err) {
    // Out of quota / private browsing — losing history is acceptable,
    // but log so unexpected write failures stay diagnosable.
    console.warn('[cerebrum.query] failed to persist history', describeError(err));
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Prepend a new entry to the history, deduplicating against any prior
 * entry with the same question + filter set so the sidebar doesn't
 * fill with identical rows when the user re-runs a query.
 */
export function appendHistoryEntry(
  entries: QueryHistoryEntry[],
  next: QueryHistoryEntry
): QueryHistoryEntry[] {
  const filtered = entries.filter((entry) => !isSameQuery(entry, next));
  return [next, ...filtered].slice(0, MAX_ENTRIES);
}

/** Remove an entry by id. */
export function removeHistoryEntry(entries: QueryHistoryEntry[], id: string): QueryHistoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

function isSameQuery(a: QueryHistoryEntry, b: QueryHistoryEntry): boolean {
  return (
    a.question === b.question &&
    a.includeSecret === b.includeSecret &&
    sameSet(a.scopes, b.scopes) &&
    sameSet(a.domains, b.domains)
  );
}

// Scope/domain filter order isn't semantically meaningful — compare
// sorted copies so ['work.*','personal.*'] and ['personal.*','work.*']
// dedupe to the same row.
function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].toSorted();
  const sortedB = [...b].toSorted();
  for (let i = 0; i < sortedA.length; i += 1) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

export const QUERY_HISTORY_STORAGE_KEY = STORAGE_KEY;
export const QUERY_HISTORY_MAX_ENTRIES = MAX_ENTRIES;
