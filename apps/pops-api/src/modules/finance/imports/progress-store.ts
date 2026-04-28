/**
 * In-memory progress tracking for import operations.
 *
 * Stores real-time progress updates that can be polled by the frontend.
 * Progress entries auto-expire after 5 minutes to prevent memory leaks.
 */
import { SETTINGS_KEYS } from '@pops/types';

import { resolveNumber } from '../../core/settings/index.js';

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

const DEFAULT_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Store progress for a session.
 * Auto-cleanup after configurable delay (default 5 minutes).
 */
export function setProgress(sessionId: string, progress: ImportProgress): void {
  progressStore.set(sessionId, progress);
  const delayMs = resolveNumber(
    SETTINGS_KEYS.FINANCE_IMPORT_CLEANUP_DELAY_MS,
    DEFAULT_CLEANUP_DELAY_MS
  );
  setTimeout(() => progressStore.delete(sessionId), delayMs);
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
