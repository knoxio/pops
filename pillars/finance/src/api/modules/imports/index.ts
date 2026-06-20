/**
 * Statement-import pipeline for the finance pillar (db-injected).
 *
 * The CSV/PDF transformers are out of scope (the wire receives already-parsed
 * transactions). The AI categorizer (`ai-categorizer.ts`) is env-gated behind
 * `FINANCE_AI_CATEGORIZER_ENABLED`. Everything else — dedup, the deterministic matching stages,
 * learned-correction application, session re-evaluation, atomic commit, and the
 * in-memory progress store — is here.
 */
export {
  createEntity,
  commitImport,
  executeImportWithProgress,
  processImportWithProgress,
  reevaluateImportSessionResult,
  reevaluateImportSessionWithRules,
} from './service.js';

export {
  clearProgress,
  getProgress,
  setProgress,
  updateProgress,
  type ImportProgress,
} from './progress-store.js';
