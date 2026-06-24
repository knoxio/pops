/**
 * Degradation truth table: maps per-stage outcomes onto `partialReason`
 * (full table in pillars/food/docs/prds/instagram-stt-vision). The
 * vision-vs-text-fallback distinction matters for the inbox UX: a
 * `vision-failed` partial signals "rerun once the vision API recovers"
 * whereas `caption-only-fallback` signals "no recoverable signal beyond
 * the caption".
 */
import type { PartialReason } from '../../../contract/queue/index.js';

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
  // Vision failed. Two flavours of recovery: keyframes were available
  // (so we DID try the multimodal path and it failed → `vision-failed`)
  // vs keyframes never produced (so we never had a vision path at all
  // → `caption-only-fallback`). Both presume `textFallbackUsed=true`;
  // callers don't reach this branch when the fallback also failed.
  if (!inputs.textFallbackUsed) return 'vision-failed';
  return inputs.keyframesOk ? 'vision-failed' : 'caption-only-fallback';
}
