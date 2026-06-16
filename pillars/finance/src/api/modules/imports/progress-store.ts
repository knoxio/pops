/**
 * In-memory progress tracking for import sessions.
 *
 * Process-local state polled by the FE via `getImportProgress`. Entries
 * auto-expire after 5 minutes to bound memory. Ported verbatim from the
 * monolith `progress-store.ts` — the single pillar process makes the
 * process-local store correct (no cross-instance sharing needed).
 */
import type { ExecuteImportOutput, ProcessImportOutput } from './types.js';

export interface ImportProgress {
  sessionId: string;
  status: 'processing' | 'completed' | 'failed';
  currentStep: 'deduplicating' | 'matching' | 'writing';
  totalTransactions: number;
  processedCount: number;
  currentBatch: Array<{
    description: string;
    status: 'processing' | 'success' | 'failed';
    error?: string;
  }>;
  errors: Array<{ description: string; error: string }>;
  startedAt: string;
  result?: ProcessImportOutput | ExecuteImportOutput;
}

const progressStore = new Map<string, ImportProgress>();

const CLEANUP_DELAY_MS = 5 * 60 * 1000;

/** Store progress for a session; auto-cleans after 5 minutes. */
export function setProgress(sessionId: string, progress: ImportProgress): void {
  progressStore.set(sessionId, progress);
  setTimeout(() => progressStore.delete(sessionId), CLEANUP_DELAY_MS).unref?.();
}

/** Get progress for a session. Returns null if unknown or expired. */
export function getProgress(sessionId: string): ImportProgress | null {
  return progressStore.get(sessionId) ?? null;
}

/** Merge partial updates into an existing session. No-op if the session is gone. */
export function updateProgress(sessionId: string, updates: Partial<ImportProgress>): void {
  const current = progressStore.get(sessionId);
  if (current) progressStore.set(sessionId, { ...current, ...updates });
}

/** Clear all progress entries (used by tests). */
export function clearProgress(): void {
  progressStore.clear();
}
