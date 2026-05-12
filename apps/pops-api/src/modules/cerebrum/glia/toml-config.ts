/**
 * Glia threshold loader for `engrams/.config/glia.toml` (PRD-086 US-03 AC #7).
 *
 * Reads `[trust.graduation]` from the toml file and exposes a partial
 * {@link GraduationThresholds} object containing only the keys the user set.
 *
 * Hot-reload semantics: the parsed result is cached and re-validated against
 * the file's mtime on every call. Edits to `glia.toml` are picked up on the
 * next evaluation without restart. If the file is absent or unreadable the
 * loader returns an empty object so callers can fall back to other sources.
 */
import { statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';

import type { GraduationThresholds } from './types.js';

/** Subset of {@link GraduationThresholds} expressible in `glia.toml`. */
export type PartialGraduationThresholds = Partial<GraduationThresholds>;

const CONFIG_RELATIVE_PATH = join('.config', 'glia.toml');

interface CacheEntry {
  mtimeMs: number;
  thresholds: PartialGraduationThresholds;
}

const cache = new Map<string, CacheEntry>();

/** Resolve the absolute path to `<engramRoot>/.config/glia.toml`. */
export function gliaTomlPath(engramRoot: string): string {
  return join(engramRoot, CONFIG_RELATIVE_PATH);
}

const nonNegativeInt = z.number().int().nonnegative();
const rejectionRate = z.number().min(0).max(1);

// Zod v4 strips unknown keys from object schemas by default — no explicit
// `.strip()` is required (and `z.strictObject` would be too aggressive here
// since users may add commented-out keys or future fields the parser hasn't
// learned yet).
const graduationSchema = z.object({
  propose_to_act_report_min_approved: nonNegativeInt.optional(),
  propose_to_act_report_max_rejection_rate: rejectionRate.optional(),
  act_report_to_silent_min_days: nonNegativeInt.optional(),
  demotion_revert_threshold: nonNegativeInt.optional(),
  demotion_window_days: nonNegativeInt.optional(),
});

const gliaTomlSchema = z.object({
  trust: z
    .object({
      graduation: graduationSchema.optional(),
    })
    .optional(),
});

/** Parse the `[trust.graduation]` block into a partial thresholds object. */
export function parseGliaToml(content: string): PartialGraduationThresholds {
  let raw: unknown;
  try {
    raw = parseToml(content);
  } catch (err) {
    console.warn(`[cerebrum] glia.toml parse failed: ${(err as Error).message}`);
    return {};
  }

  const parsed = gliaTomlSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(
      `[cerebrum] glia.toml validation failed: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`
    );
    return {};
  }

  const section = parsed.data.trust?.graduation;
  if (!section) return {};

  const result: PartialGraduationThresholds = {};
  if (section.propose_to_act_report_min_approved !== undefined) {
    result.proposeToActReportMinApproved = section.propose_to_act_report_min_approved;
  }
  if (section.propose_to_act_report_max_rejection_rate !== undefined) {
    result.proposeToActReportMaxRejectionRate = section.propose_to_act_report_max_rejection_rate;
  }
  if (section.act_report_to_silent_min_days !== undefined) {
    result.actReportToSilentMinDays = section.act_report_to_silent_min_days;
  }
  if (section.demotion_revert_threshold !== undefined) {
    result.demotionRevertThreshold = section.demotion_revert_threshold;
  }
  if (section.demotion_window_days !== undefined) {
    result.demotionWindowDays = section.demotion_window_days;
  }
  return result;
}

/**
 * Load partial thresholds from `<engramRoot>/.config/glia.toml`.
 *
 * Returns an empty object when the file is missing or unreadable. Uses an
 * mtime-keyed cache so repeated calls within the same process do not re-read
 * the disk unless the file has changed.
 */
export function loadGliaToml(engramRoot: string): PartialGraduationThresholds {
  const path = gliaTomlPath(engramRoot);

  let mtimeMs: number;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`[cerebrum] glia.toml stat failed at ${path}: ${(err as Error).message}`);
    }
    cache.delete(path);
    return {};
  }

  const cached = cache.get(path);
  if (cached && cached.mtimeMs === mtimeMs) {
    // Defensive copy — never hand callers the cached reference, otherwise
    // a downstream mutation poisons every subsequent read until the file's
    // mtime changes.
    return { ...cached.thresholds };
  }

  let content: string;
  try {
    content = readFileSync(path, 'utf8');
  } catch (err) {
    // If the file was removed between statSync and readFileSync, ENOENT is
    // an expected race and should stay quiet — same policy as the stat path.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      console.warn(`[cerebrum] glia.toml read failed at ${path}: ${(err as Error).message}`);
    }
    cache.delete(path);
    return {};
  }

  const thresholds = parseGliaToml(content);
  cache.set(path, { mtimeMs, thresholds });
  // Return a copy so mutation by the caller can't corrupt the cache entry.
  return { ...thresholds };
}

/** Test hook — clear the mtime cache. */
export function resetGliaTomlCache(): void {
  cache.clear();
}
