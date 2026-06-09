/**
 * PRD-130 — degradation truth-table tests, one assertion per documented
 * row of the §Degradation table.
 */
import { describe, expect, it } from 'vitest';

import { derivePartialReason } from '../handlers/instagram/degradation.js';

describe('derivePartialReason', () => {
  it('row 1: caption structured, STT skipped, vision ok → no partialReason', () => {
    expect(
      derivePartialReason({
        captionStructured: true,
        transcriptOk: true,
        visionOk: true,
        keyframesOk: true,
        textFallbackUsed: false,
      })
    ).toBeUndefined();
  });

  it('row 2: caption unstructured, STT ok, vision ok → no partialReason', () => {
    expect(
      derivePartialReason({
        captionStructured: false,
        transcriptOk: true,
        visionOk: true,
        keyframesOk: true,
        textFallbackUsed: false,
      })
    ).toBeUndefined();
  });

  it('row 3: caption unstructured, STT failed, vision ok → stt-failed', () => {
    expect(
      derivePartialReason({
        captionStructured: false,
        transcriptOk: false,
        visionOk: true,
        keyframesOk: true,
        textFallbackUsed: false,
      })
    ).toBe('stt-failed');
  });

  it('row 4: vision failed (keyframes had been available), text-fallback used → vision-failed', () => {
    expect(
      derivePartialReason({
        captionStructured: false,
        transcriptOk: true,
        visionOk: false,
        keyframesOk: true,
        textFallbackUsed: true,
      })
    ).toBe('vision-failed');
  });

  it('row 5: keyframes failed (no vision path), text-fallback used → caption-only-fallback', () => {
    expect(
      derivePartialReason({
        captionStructured: false,
        transcriptOk: true,
        visionOk: false,
        keyframesOk: false,
        textFallbackUsed: true,
      })
    ).toBe('caption-only-fallback');
  });

  it('row 6 (sentinel): vision failed AND no fallback used → vision-failed sentinel', () => {
    expect(
      derivePartialReason({
        captionStructured: false,
        transcriptOk: true,
        visionOk: false,
        keyframesOk: true,
        textFallbackUsed: false,
      })
    ).toBe('vision-failed');
  });
});
