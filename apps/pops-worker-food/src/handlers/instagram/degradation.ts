/**
 * PRD-130 — degradation truth table.
 *
 * Maps the per-stage outcomes onto `partialReason` per the table in the
 * PRD's §Degradation section. Encapsulated here so the orchestrator
 * stays readable and the table is unit-testable in isolation.
 */
import type { PartialReason } from '@pops/food-contracts';

export interface DegradationInputs {
  captionStructured: boolean;
  transcriptOk: boolean;
  /** True when the vision call produced a parseable recipe. */
  visionOk: boolean;
  keyframesOk: boolean;
  /** True when the text-LLM fallback was used (vision failed but caption did). */
  textFallbackUsed: boolean;
}

export function derivePartialReason(inputs: DegradationInputs): PartialReason | undefined {
  if (inputs.visionOk) {
    if (!inputs.captionStructured && !inputs.transcriptOk) return 'stt-failed';
    return undefined;
  }
  if (inputs.textFallbackUsed) return 'caption-only-fallback';
  // Vision failed and no fallback used — caller treats this as failed; this
  // branch should not appear in a success-path result.
  return 'vision-failed';
}
