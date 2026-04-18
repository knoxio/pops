import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TemplateRegistry } from './registry.js';
import { seedDefaultTemplates } from './seed.js';

describe('TemplateRegistry + default seed', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cerebrum-templates-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('seeds all seven default templates', () => {
    const written = seedDefaultTemplates(dir);
    const names = new Set(written);
    for (const name of ['journal', 'decision', 'research', 'meeting', 'idea', 'note', 'capture']) {
      expect(names.has(`${name}.md`)).toBe(true);
    }
  });

  it('seeds are idempotent — a second call writes nothing', () => {
    seedDefaultTemplates(dir);
    expect(seedDefaultTemplates(dir)).toEqual([]);
  });

  it('loads seeded templates into the registry', () => {
    seedDefaultTemplates(dir);
    const registry = new TemplateRegistry(dir);
    const names = registry.list().map((t) => t.name);
    expect(names).toEqual([
      'capture',
      'decision',
      'idea',
      'journal',
      'meeting',
      'note',
      'research',
    ]);
    expect(registry.get('decision')?.required_fields).toEqual(['decision', 'alternatives']);
  });

  it('returns an empty list when the directory does not exist', () => {
    const registry = new TemplateRegistry(join(dir, 'missing'));
    expect(registry.list()).toEqual([]);
    expect(registry.has('anything')).toBe(false);
  });
});
