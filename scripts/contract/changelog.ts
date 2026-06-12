/**
 * CHANGELOG migration-section guard: when a contract bumps to a new
 * major, its `CHANGELOG.md` must include a non-empty
 * `### Migration from X.Y to N.0` section. PRD-154 enforces this in CI
 * (US-06) to keep the audit log honest.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { parseSemver } from './semver.js';

export interface MigrationCheckInput {
  readonly packageDir: string;
  readonly baselineVersion: string;
  readonly currentVersion: string;
}

export interface MigrationCheckResult {
  readonly ok: boolean;
  readonly reason: string;
}

function readChangelog(packageDir: string): string | null {
  try {
    return readFileSync(resolve(packageDir, 'CHANGELOG.md'), 'utf8');
  } catch {
    return null;
  }
}

export function hasMigrationSection(
  changelog: string,
  baselineVersion: string,
  currentVersion: string
): boolean {
  const baseline = parseSemver(baselineVersion);
  const current = parseSemver(currentVersion);
  const header = `### Migration from ${baseline.major}.${baseline.minor} to ${current.major}.0`;
  const idx = changelog.indexOf(header);
  if (idx === -1) return false;
  const after = changelog.slice(idx + header.length);
  const nextHeader = after.search(/\n#{1,4} /);
  const body = nextHeader === -1 ? after : after.slice(0, nextHeader);
  return body.replace(/\s+/g, '').length > 0;
}

export function checkMigrationSection(input: MigrationCheckInput): MigrationCheckResult {
  const baseline = parseSemver(input.baselineVersion);
  const current = parseSemver(input.currentVersion);
  if (current.major === baseline.major) {
    return { ok: true, reason: 'no major bump; migration section not required.' };
  }
  const changelog = readChangelog(input.packageDir);
  if (changelog === null) {
    return {
      ok: false,
      reason: `major bump to ${input.currentVersion}: CHANGELOG.md missing in ${input.packageDir}.`,
    };
  }
  if (!hasMigrationSection(changelog, input.baselineVersion, input.currentVersion)) {
    const expected = `### Migration from ${baseline.major}.${baseline.minor} to ${current.major}.0`;
    return {
      ok: false,
      reason: `major bump to ${input.currentVersion} requires a non-empty "${expected}" section in CHANGELOG.md.`,
    };
  }
  return { ok: true, reason: 'migration section present and non-empty.' };
}
