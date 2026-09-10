import type { ImportDraftSource } from '../../store/import-store-types';

/** The wizard's steps by number, shared by the step indicator and the pending-import cards. */
export const IMPORT_STEP_LABELS = [
  'Upload',
  'Map',
  'Process',
  'Review',
  'Tags',
  'Rules',
  'Commit',
  'Summary',
] as const;

export function importStepLabel(step: number | null): string | null {
  return step === null ? null : (IMPORT_STEP_LABELS[step - 1] ?? null);
}

/** The step numbers a run of this source has: a live draft has nothing to upload or map. */
export function importStepsFor(source: ImportDraftSource | null): number[] {
  const first = firstImportStep(source);
  return IMPORT_STEP_LABELS.map((_, index) => index + 1).filter((step) => step >= first);
}

/** Where Back stops: Process for a live draft, Upload otherwise. */
export function firstImportStep(source: ImportDraftSource | null): number {
  return source?.kind === 'live' ? 3 : 1;
}
