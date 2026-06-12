import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { checkMigrationSection, hasMigrationSection } from '../changelog.js';

describe('hasMigrationSection', () => {
  it('detects a non-empty migration section', () => {
    const changelog = `
# Changelog

## 2.0.0

### Migration from 1.4 to 2.0
- removed FooSchema; use BarSchema instead.

## 1.4.0
`;
    expect(hasMigrationSection(changelog, '1.4.2', '2.0.0')).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(hasMigrationSection('# Changelog\n', '1.4.2', '2.0.0')).toBe(false);
  });

  it('rejects an empty section', () => {
    const changelog = `### Migration from 1.4 to 2.0\n\n#### something else`;
    expect(hasMigrationSection(changelog, '1.4.2', '2.0.0')).toBe(false);
  });
});

describe('checkMigrationSection', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'contract-changelog-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes when no major bump', () => {
    const r = checkMigrationSection({
      packageDir: dir,
      baselineVersion: '1.4.2',
      currentVersion: '1.5.0',
    });
    expect(r.ok).toBe(true);
  });

  it('fails when CHANGELOG.md missing on major bump', () => {
    const r = checkMigrationSection({
      packageDir: dir,
      baselineVersion: '1.4.2',
      currentVersion: '2.0.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/CHANGELOG\.md missing/);
  });

  it('fails when CHANGELOG lacks the migration section', () => {
    writeFileSync(resolve(dir, 'CHANGELOG.md'), '# Changelog\n## 2.0.0\nWhatever.\n');
    const r = checkMigrationSection({
      packageDir: dir,
      baselineVersion: '1.4.2',
      currentVersion: '2.0.0',
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/non-empty/);
  });

  it('passes with a populated migration section', () => {
    writeFileSync(
      resolve(dir, 'CHANGELOG.md'),
      '# Changelog\n## 2.0.0\n### Migration from 1.4 to 2.0\n- removed Foo.\n'
    );
    const r = checkMigrationSection({
      packageDir: dir,
      baselineVersion: '1.4.2',
      currentVersion: '2.0.0',
    });
    expect(r.ok).toBe(true);
  });
});
