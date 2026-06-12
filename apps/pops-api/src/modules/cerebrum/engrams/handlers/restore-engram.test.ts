/**
 * Tests for the engram restore handler (PRD-086 US-04, #2576).
 *
 * Covers the idempotency guard for the edge case where the index row still
 * points to `.archive/{type}/{id}.md` but the underlying file has been
 * removed out-of-band (interrupted revert, manual cleanup, etc.). The handler
 * must return `{ moved: false }` rather than throwing on `readFileSync`.
 */
import { existsSync, mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb, makeClock } from '../../../../shared/test-utils.js';
import { TemplateRegistry } from '../../templates/registry.js';
import { seedDefaultTemplates } from '../../templates/seed.js';
import { EngramService } from '../service.js';
import { getIndexRow } from './upsert-index.js';

import type { Database } from 'better-sqlite3';

describe('restoreEngram idempotency', () => {
  let db: Database;
  let service: EngramService;
  let root: string;

  beforeEach(() => {
    db = createTestDb();
    root = mkdtempSync(join(tmpdir(), 'cerebrum-restore-'));
    const templatesDir = join(root, '.templates');
    seedDefaultTemplates(templatesDir);
    service = new EngramService({
      root,
      db: drizzle<Record<string, unknown>>(db),
      templates: new TemplateRegistry(templatesDir),
      now: makeClock(),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('returns moved: false when the archived file is missing on disk', () => {
    const engram = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
    service.archive(engram.id);

    // Index still points to .archive/..., but delete the file out-of-band.
    const archivedRel = service.read(engram.id).engram.filePath;
    expect(archivedRel.startsWith('.archive/')).toBe(true);
    const archivedAbs = join(root, archivedRel);
    expect(existsSync(archivedAbs)).toBe(true);
    unlinkSync(archivedAbs);
    expect(existsSync(archivedAbs)).toBe(false);

    const { result } = service.restore(engram.id);

    expect(result.moved).toBe(false);
    expect(result.filePath).toBe(archivedRel);
    expect(getIndexRow(drizzle<Record<string, unknown>>(db), engram.id).status).toBe('archived');
  });
});
