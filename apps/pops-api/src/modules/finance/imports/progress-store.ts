/**
 * In-memory progress tracking for import operations.
 *
 * Stores real-time progress updates that can be polled by the frontend.
 * Progress entries auto-expire after 5 minutes to prevent memory leaks.
 */
import type { ProcessImportOutput, ExecuteImportOutput } from "./types.js";

export interface ImportProgress {
  sessionId: string;
  status: "processing" | "completed" | "failed";
  currentStep: "deduplicating" | "matching" | "writing";
  totalTransactions: number;
  processedCount: number;
  currentBatch: Array<{
    description: string;
    status: "processing" | "success" | "failed";
    error?: string;
  }>;
  errors: Array<{ description: string; error: string }>;
  startedAt: string;
  result?: ProcessImportOutput | ExecuteImportOutput;
}

const progressStore = new Map<string, ImportProgress>();

const CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Store progress for a session.
 * Auto-cleanup after 5 minutes.
 */
export function setProgress(sessionId: string, progress: ImportProgress): void {
  progressStore.set(sessionId, progress);
  setTimeout(() => progressStore.delete(sessionId), CLEANUP_DELAY_MS);
}

/**
 * Get progress for a session.
 * Returns null if session doesn't exist or has expired.
 */
export function getProgress(sessionId: string): ImportProgress | null {
  return progressStore.get(sessionId) ?? null;
}

/**
 * Update progress for an existing session.
 * No-op if session doesn't exist.
 */
export function updateProgress(sessionId: string, updates: Partial<ImportProgress>): void {
  const current = progressStore.get(sessionId);
  if (current) {
    progressStore.set(sessionId, { ...current, ...updates });
  }
}

/**
 * Clear all progress entries (for testing).
 */
export function clearProgress(): void {
  progressStore.clear();
}
