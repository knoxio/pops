/**
 * Tests for glia.toml threshold loading (#2247).
 */
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getTomlThresholds, loadGliaToml, resetTomlConfig } from '../toml-config.js';

describe('toml-config', () => {
  let tempDir: string;

  beforeEach(() => {
    resetTomlConfig();
    tempDir = mkdtempSync(join(tmpdir(), 'glia-toml-'));
  });

  afterEach(() => {
    resetTomlConfig();
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns defaults when file does not exist', () => {
    const result = loadGliaToml(join(tempDir, 'nonexistent.toml'));

    expect(result.proposeToActReportMinApproved).toBe(20);
    expect(result.proposeToActReportMaxRejectionRate).toBe(0.1);
    expect(result.actReportToSilentMinDays).toBe(60);
    expect(result.demotionRevertThreshold).toBe(2);
    expect(result.demotionWindowDays).toBe(7);
  });

  it('reads thresholds from a valid TOML file', () => {
    const tomlPath = join(tempDir, 'glia.toml');
    writeFileSync(
      tomlPath,
      `# Glia graduation thresholds
[graduation]
propose_min_approved = 30
propose_max_rejection_rate = 0.15
act_report_min_days = 90
demotion_revert_threshold = 3
demotion_window_days = 14
`
    );

    const result = loadGliaToml(tomlPath);

    expect(result.proposeToActReportMinApproved).toBe(30);
    expect(result.proposeToActReportMaxRejectionRate).toBe(0.15);
    expect(result.actReportToSilentMinDays).toBe(90);
    expect(result.demotionRevertThreshold).toBe(3);
    expect(result.demotionWindowDays).toBe(14);
  });

  it('uses defaults for missing keys in partial TOML', () => {
    const tomlPath = join(tempDir, 'glia.toml');
    writeFileSync(
      tomlPath,
      `[graduation]
propose_min_approved = 50
`
    );

    const result = loadGliaToml(tomlPath);

    expect(result.proposeToActReportMinApproved).toBe(50);
    // Others should still be defaults
    expect(result.proposeToActReportMaxRejectionRate).toBe(0.1);
    expect(result.actReportToSilentMinDays).toBe(60);
  });

  it('ignores comment lines and empty lines', () => {
    const tomlPath = join(tempDir, 'glia.toml');
    writeFileSync(
      tomlPath,
      `# This is a comment

[graduation]
# Another comment
propose_min_approved = 25

`
    );

    const result = loadGliaToml(tomlPath);
    expect(result.proposeToActReportMinApproved).toBe(25);
  });

  it('falls back to defaults on malformed content', () => {
    const tomlPath = join(tempDir, 'glia.toml');
    writeFileSync(tomlPath, 'not valid toml content at all @#$%');

    const result = loadGliaToml(tomlPath);
    // Should still return defaults since no valid keys were parsed
    expect(result.proposeToActReportMinApproved).toBe(20);
  });

  it('getTomlThresholds returns cached value', () => {
    const tomlPath = join(tempDir, 'glia.toml');
    writeFileSync(
      tomlPath,
      `[graduation]
propose_min_approved = 42
`
    );

    loadGliaToml(tomlPath);
    const cached = getTomlThresholds();
    expect(cached.proposeToActReportMinApproved).toBe(42);
  });

  it('resetTomlConfig restores defaults', () => {
    const tomlPath = join(tempDir, 'glia.toml');
    writeFileSync(
      tomlPath,
      `[graduation]
propose_min_approved = 99
`
    );

    loadGliaToml(tomlPath);
    expect(getTomlThresholds().proposeToActReportMinApproved).toBe(99);

    resetTomlConfig();
    expect(getTomlThresholds().proposeToActReportMinApproved).toBe(20);
  });
});
