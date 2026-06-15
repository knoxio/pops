/**
 * Internal barrel for the inbox quality-scoring helpers (PRDs 134/135/137).
 *
 * Pure logic — no drizzle. Operates on already-loaded inputs. The DB-
 * touching `inboxService` lives in `../db/services/inbox.js`; the
 * helpers in here are the scoring inputs and the heuristic itself.
 */
export {
  scoreDraft,
  SIGNAL_WEIGHTS,
  type CompileStatus,
  type IngestKind as QualityIngestKind,
  type IngestState as QualityIngestState,
  type QualityBand,
  type QualityInputs,
  type QualityResult,
  type QualitySignal,
  type QualitySignalCode,
} from './quality.js';
export { gatherQualityInputsForVersions } from './gather-quality-inputs.js';
