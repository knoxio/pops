/**
 * glia.toml threshold loading (#2247).
 *
 * Reads graduation thresholds from a `glia.toml` config file.
 * Falls back to hardcoded defaults if the file doesn't exist.
 * Watches for file changes and hot-reloads automatically.
 */
import { existsSync, readFileSync, watch } from 'node:fs';
import { resolve } from 'node:path';

import { logger } from '../../../lib/logger.js';

import type { GraduationThresholds } from './types.js';

/** Default thresholds (same as types.ts fallback). */
const DEFAULTS: GraduationThresholds = {
  proposeToActReportMinApproved: 20,
  proposeToActReportMaxRejectionRate: 0.1,
  actReportToSilentMinDays: 60,
  demotionRevertThreshold: 2,
  demotionWindowDays: 7,
};

/** TOML file structure — mirrors GraduationThresholds with optional fields. */
interface GliaTomlContent {
  graduation?: Record<string, number>;
}

/** Module-level cache for the loaded thresholds. */
let cachedThresholds: GraduationThresholds = { ...DEFAULTS };
let watcherActive = false;

/**
 * Parse a minimal TOML subset sufficient for glia.toml.
 * Only supports [section] headers and key = value (number/float).
 */
function parseSimpleToml(content: string): GliaTomlContent {
  const result: GliaTomlContent = {};
  let currentSection = '';

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const sectionMatch = /^\[(.+)]$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1] ?? '';
      continue;
    }

    const kvMatch = /^(\w+)\s*=\s*(.+)$/.exec(line);
    if (!kvMatch) continue;
    const key = kvMatch[1] ?? '';
    const rawValue = kvMatch[2] ?? '';
    const value = parseFloat(rawValue);
    if (isNaN(value)) continue;

    if (currentSection === 'graduation') {
      if (!result.graduation) result.graduation = {};
      result.graduation[key] = value;
    }
  }

  return result;
}

/** Map parsed TOML to GraduationThresholds, falling back to defaults. */
function mapToThresholds(parsed: GliaTomlContent): GraduationThresholds {
  const g = parsed.graduation;
  return {
    proposeToActReportMinApproved:
      g?.propose_min_approved ?? DEFAULTS.proposeToActReportMinApproved,
    proposeToActReportMaxRejectionRate:
      g?.propose_max_rejection_rate ?? DEFAULTS.proposeToActReportMaxRejectionRate,
    actReportToSilentMinDays: g?.act_report_min_days ?? DEFAULTS.actReportToSilentMinDays,
    demotionRevertThreshold: g?.demotion_revert_threshold ?? DEFAULTS.demotionRevertThreshold,
    demotionWindowDays: g?.demotion_window_days ?? DEFAULTS.demotionWindowDays,
  };
}

/** Resolve the glia.toml path relative to the API root. */
function resolveTomlPath(): string {
  return resolve(process.cwd(), 'glia.toml');
}

/** Load thresholds from glia.toml or fall back to defaults. */
export function loadGliaToml(filePath?: string): GraduationThresholds {
  const path = filePath ?? resolveTomlPath();

  if (!existsSync(path)) {
    cachedThresholds = { ...DEFAULTS };
    return cachedThresholds;
  }

  try {
    const content = readFileSync(path, 'utf8');
    const parsed = parseSimpleToml(content);
    cachedThresholds = mapToThresholds(parsed);
    logger.info({ path }, '[GliaToml] Loaded thresholds from glia.toml');
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      '[GliaToml] Failed to parse glia.toml, using defaults'
    );
    cachedThresholds = { ...DEFAULTS };
  }

  return cachedThresholds;
}

/** Get cached thresholds (call loadGliaToml first or use startWatcher). */
export function getTomlThresholds(): GraduationThresholds {
  return cachedThresholds;
}

/** Start watching glia.toml for changes. Hot-reloads on modification. */
export function startGliaTomlWatcher(filePath?: string): void {
  if (watcherActive) return;
  const path = filePath ?? resolveTomlPath();

  if (!existsSync(path)) {
    logger.debug('[GliaToml] File not found, watcher not started');
    return;
  }

  try {
    const watcher = watch(path, (eventType) => {
      if (eventType === 'change') {
        logger.info('[GliaToml] File changed, reloading thresholds');
        loadGliaToml(path);
      }
    });
    watcher.on('error', () => {
      watcherActive = false;
    });
    watcherActive = true;
  } catch {
    logger.warn('[GliaToml] Failed to start file watcher');
  }
}

/** Stop the watcher (for testing). */
export function stopGliaTomlWatcher(): void {
  watcherActive = false;
}

/** Reset to defaults (for testing). */
export function resetTomlConfig(): void {
  cachedThresholds = { ...DEFAULTS };
  watcherActive = false;
}
