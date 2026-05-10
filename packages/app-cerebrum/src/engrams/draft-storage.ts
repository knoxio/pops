/**
 * Edit-mode draft persistence for engrams (PRD-077 / PRD-078).
 *
 * Drafts live in `localStorage` so an in-flight edit survives a page
 * reload or accidental navigation. They are deliberately client-only —
 * server-side draft persistence is tracked as a follow-up against
 * PRD-085 (curation) once we have a concept of "review-pending"
 * engrams. For now, autosave to localStorage covers the practical case
 * (don't lose work on accidental reload).
 */
import type { EngramDraft } from './types';

const STORAGE_PREFIX = 'pops.cerebrum.engram-draft.';

/** Compute the localStorage key for a given engram id. */
export function draftStorageKey(engramId: string): string {
  return `${STORAGE_PREFIX}${engramId}`;
}

function isEngramDraft(value: unknown): value is EngramDraft {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.title === 'string' &&
    typeof v.body === 'string' &&
    Array.isArray(v.scopes) &&
    v.scopes.every((s) => typeof s === 'string') &&
    Array.isArray(v.tags) &&
    v.tags.every((s) => typeof s === 'string') &&
    typeof v.status === 'string' &&
    typeof v.updatedAt === 'string' &&
    typeof v.baseContentHash === 'string'
  );
}

/** Read a draft for the given engram id. Returns null if not found or invalid. */
export function readDraft(
  engramId: string,
  storage: Storage = window.localStorage
): EngramDraft | null {
  try {
    const raw = storage.getItem(draftStorageKey(engramId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEngramDraft(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Save a draft. Silently no-ops on quota errors — losing a draft is preferable to throwing. */
export function writeDraft(draft: EngramDraft, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(draftStorageKey(draft.id), JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable (private browsing, quota exceeded) —
    // silently ignore. The user's edit still lives in component state.
  }
}

/** Remove a draft, e.g. after a successful save or explicit discard. */
export function clearDraft(engramId: string, storage: Storage = window.localStorage): void {
  try {
    storage.removeItem(draftStorageKey(engramId));
  } catch {
    // No-op; see writeDraft.
  }
}
