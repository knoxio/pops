/**
 * Graduation-threshold resolution for the glia trust machine.
 *
 * Precedence: `glia.toml` is the source of truth — it is re-read on every call
 * (mtime-cached) so operator edits take effect on the next evaluation without a
 * restart. Any key the toml file does not set falls back to the hardcoded
 * ADR-021 defaults.
 */
import { loadGliaToml } from './toml-config.js';

import type { GraduationThresholds } from './types.js';

/** Hardcoded graduation thresholds per ADR-021 — the last-resort defaults. */
export const FALLBACK_THRESHOLDS: GraduationThresholds = {
  proposeToActReportMinApproved: 20,
  proposeToActReportMaxRejectionRate: 0.1,
  actReportToSilentMinDays: 60,
  demotionRevertThreshold: 2,
  demotionWindowDays: 7,
};

/**
 * Build a `getThresholds` accessor bound to a glia config path. Each call
 * re-reads the toml (mtime-cached) and overlays it onto the ADR-021 defaults.
 */
export function makeGliaThresholdReader(configPath: string): () => GraduationThresholds {
  return () => {
    const toml = loadGliaToml(configPath);
    return {
      proposeToActReportMinApproved:
        toml.proposeToActReportMinApproved ?? FALLBACK_THRESHOLDS.proposeToActReportMinApproved,
      proposeToActReportMaxRejectionRate:
        toml.proposeToActReportMaxRejectionRate ??
        FALLBACK_THRESHOLDS.proposeToActReportMaxRejectionRate,
      actReportToSilentMinDays:
        toml.actReportToSilentMinDays ?? FALLBACK_THRESHOLDS.actReportToSilentMinDays,
      demotionRevertThreshold:
        toml.demotionRevertThreshold ?? FALLBACK_THRESHOLDS.demotionRevertThreshold,
      demotionWindowDays: toml.demotionWindowDays ?? FALLBACK_THRESHOLDS.demotionWindowDays,
    };
  };
}
