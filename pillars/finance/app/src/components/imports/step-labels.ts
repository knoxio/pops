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
