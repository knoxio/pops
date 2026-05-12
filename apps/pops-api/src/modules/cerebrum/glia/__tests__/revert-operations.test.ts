/**
 * Tests for revert operations (PRD-086 US-04, #2576).
 *
 * Each path uses a real `EngramService` over a `mkdtemp` filesystem and an
 * in-memory SQLite DB. Idempotency is exercised per action type.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDb, makeClock } from '../../../../shared/test-utils.js';
import { EngramService } from '../../engrams/service.js';
import { TemplateRegistry } from '../../templates/registry.js';
import { seedDefaultTemplates } from '../../templates/seed.js';
import { executeRevert } from '../revert-operations.js';

import type { Database } from 'better-sqlite3';

import type { ConsolidatePayload, LinkPayload } from '../../workers/types.js';
import type { GliaAction } from '../types.js';

vi.mock('../../../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeAction(overrides: Partial<GliaAction> = {}): GliaAction {
  return {
    id: 'glia_prune_20260512_aaaaaaaa',
    actionType: 'prune',
    affectedIds: [],
    rationale: 'test',
    payload: null,
    phase: 'act_report',
    status: 'executed',
    userDecision: null,
    userNote: null,
    executedAt: '2026-05-12T10:00:00Z',
    decidedAt: null,
    revertedAt: null,
    createdAt: '2026-05-12T09:00:00Z',
    ...overrides,
  };
}

describe('executeRevert (filesystem)', () => {
  let db: Database;
  let root: string;
  let service: EngramService;

  beforeEach(() => {
    db = createTestDb();
    root = mkdtempSync(join(tmpdir(), 'glia-revert-'));
    const templatesDir = join(root, '.templates');
    seedDefaultTemplates(templatesDir);
    service = new EngramService({
      root,
      db: drizzle(db),
      templates: new TemplateRegistry(templatesDir),
      now: makeClock(),
    });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    db.close();
  });

  describe('prune revert', () => {
    it('moves archived engrams back to their original type folder', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      const b = service.create({ type: 'note', title: 'B', body: '# B', scopes: ['x'] });
      const aPath = a.filePath;
      const bPath = b.filePath;

      service.archive(a.id);
      service.archive(b.id);
      expect(existsSync(join(root, aPath))).toBe(false);
      expect(existsSync(join(root, bPath))).toBe(false);

      const action = makeAction({ actionType: 'prune', affectedIds: [a.id, b.id] });
      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(result.restoredIds.toSorted()).toEqual([a.id, b.id].toSorted());
      expect(existsSync(join(root, aPath))).toBe(true);
      expect(existsSync(join(root, bPath))).toBe(true);
      expect(service.read(a.id).engram.status).toBe('active');
      expect(service.read(b.id).engram.status).toBe('active');
    });

    it('is idempotent — re-reverting a restored prune succeeds with no-op', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      service.archive(a.id);

      const action = makeAction({ actionType: 'prune', affectedIds: [a.id] });
      executeRevert(action, service);
      const second = executeRevert(action, service);

      // The second pass found the engram already active — restore is a no-op
      // but does not throw.
      expect(second.success).toBe(true);
      expect(service.read(a.id).engram.status).toBe('active');
    });

    it('skips missing ids and restores existing archived engrams', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      service.archive(a.id);

      const action = makeAction({
        actionType: 'prune',
        affectedIds: [a.id, 'eng_20260101_0000_missing'],
      });
      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(result.restoredIds).toEqual([a.id]);
    });
  });

  describe('consolidate revert', () => {
    function setupConsolidatedScenario(): {
      sources: { id: string; path: string }[];
      mergedId: string;
      externalLinkTarget: string;
    } {
      const s1 = service.create({ type: 'note', title: 'S1', body: '# S1', scopes: ['x'] });
      const s2 = service.create({ type: 'note', title: 'S2', body: '# S2', scopes: ['x'] });
      const s3 = service.create({ type: 'note', title: 'S3', body: '# S3', scopes: ['x'] });
      // An external engram outside the cluster — the merged engram will link
      // to it, and revert must scrub the inbound reference.
      const external = service.create({
        type: 'note',
        title: 'Ext',
        body: '# Ext',
        scopes: ['x'],
      });
      const sources = [s1, s2, s3].map((e) => ({ id: e.id, path: e.filePath }));

      const merged = service.create({
        type: 'note',
        title: 'Consolidated: S1',
        body: '# Consolidated\n\n...',
        scopes: ['x'],
        source: 'agent',
      });
      service.link(merged.id, external.id);
      for (const s of [s1, s2, s3]) service.archive(s.id);

      return { sources, mergedId: merged.id, externalLinkTarget: external.id };
    }

    it('deletes the merged engram and restores all source engrams', () => {
      const { sources, mergedId, externalLinkTarget } = setupConsolidatedScenario();
      const mergedPath = service.read(mergedId).engram.filePath;

      const payload: ConsolidatePayload = {
        type: 'merge',
        clusterIds: sources.map((s) => s.id),
        mergedTitle: 'Consolidated: S1',
        mergedTags: [],
        mergedLinks: [externalLinkTarget],
        mergedBody: '# Consolidated',
        scope: 'x',
        mergedEngramId: mergedId,
      };
      const action = makeAction({
        actionType: 'consolidate',
        affectedIds: sources.map((s) => s.id),
        payload,
      });

      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(result.restoredIds.toSorted()).toEqual(sources.map((s) => s.id).toSorted());
      expect(existsSync(join(root, mergedPath))).toBe(false);
      expect(service.exists(mergedId)).toBe(false);
      for (const s of sources) {
        expect(existsSync(join(root, s.path))).toBe(true);
        expect(service.read(s.id).engram.status).toBe('active');
      }
      // The external target's frontmatter must no longer reference the deleted
      // merged engram (re-pointing of rewritten links).
      expect(service.read(externalLinkTarget).engram.links).not.toContain(mergedId);
    });

    it('is idempotent — re-reverting an already-reverted consolidate is a no-op', () => {
      const { sources, mergedId, externalLinkTarget } = setupConsolidatedScenario();
      const payload: ConsolidatePayload = {
        type: 'merge',
        clusterIds: sources.map((s) => s.id),
        mergedTitle: 'Consolidated: S1',
        mergedTags: [],
        mergedLinks: [externalLinkTarget],
        mergedBody: '# Consolidated',
        scope: 'x',
        mergedEngramId: mergedId,
      };
      const action = makeAction({
        actionType: 'consolidate',
        affectedIds: sources.map((s) => s.id),
        payload,
      });

      const first = executeRevert(action, service);
      const second = executeRevert(action, service);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      // Second pass restores nothing (sources already active, merged already
      // gone) — but does not throw.
      expect(second.restoredIds).toEqual([]);
      expect(service.exists(mergedId)).toBe(false);
      for (const s of sources) expect(service.read(s.id).engram.status).toBe('active');
    });

    it('still restores sources when the merged engram is missing from the payload', () => {
      const { sources } = setupConsolidatedScenario();

      // Payload without mergedEngramId — simulates an older action created
      // before the metadata was being recorded.
      const action = makeAction({
        actionType: 'consolidate',
        affectedIds: sources.map((s) => s.id),
        payload: null,
      });
      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(result.restoredIds.toSorted()).toEqual(sources.map((s) => s.id).toSorted());
    });
  });

  describe('link revert', () => {
    it('unlinks using payload sourceId/targetId in both directions', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      const b = service.create({ type: 'note', title: 'B', body: '# B', scopes: ['x'] });
      service.link(a.id, b.id);

      const payload: LinkPayload = {
        type: 'link',
        sourceId: a.id,
        targetId: b.id,
        reason: 'similar',
        similarityScore: 0.9,
      };
      const action = makeAction({
        actionType: 'link',
        affectedIds: [a.id, b.id],
        payload,
      });
      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(service.read(a.id).engram.links).not.toContain(b.id);
      expect(service.read(b.id).engram.links).not.toContain(a.id);
    });

    it('falls back to first two affectedIds when payload is null', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      const b = service.create({ type: 'note', title: 'B', body: '# B', scopes: ['x'] });
      service.link(a.id, b.id);

      const action = makeAction({
        actionType: 'link',
        affectedIds: [a.id, b.id],
        payload: null,
      });
      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(service.read(a.id).engram.links ?? []).not.toContain(b.id);
      expect(service.read(b.id).engram.links ?? []).not.toContain(a.id);
    });

    it('is idempotent when the target engram has been deleted', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      const b = service.create({ type: 'note', title: 'B', body: '# B', scopes: ['x'] });
      service.link(a.id, b.id);

      // Target engram vanishes (hard-delete out-of-band). The unlink path
      // would read b's frontmatter and throw — revert must skip cleanly.
      service.hardDelete(b.id);
      expect(service.exists(b.id)).toBe(false);
      expect(service.exists(a.id)).toBe(true);

      const action = makeAction({
        actionType: 'link',
        affectedIds: [a.id, b.id],
        payload: { type: 'link', sourceId: a.id, targetId: b.id, reason: 'r', similarityScore: 1 },
      });
      const result = executeRevert(action, service);

      expect(result.success).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('is idempotent — re-reverting an already-unlinked pair succeeds', () => {
      const a = service.create({ type: 'note', title: 'A', body: '# A', scopes: ['x'] });
      const b = service.create({ type: 'note', title: 'B', body: '# B', scopes: ['x'] });
      service.link(a.id, b.id);

      const action = makeAction({
        actionType: 'link',
        affectedIds: [a.id, b.id],
        payload: { type: 'link', sourceId: a.id, targetId: b.id, reason: 'r', similarityScore: 1 },
      });
      const first = executeRevert(action, service);
      const second = executeRevert(action, service);

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(service.read(a.id).engram.links ?? []).not.toContain(b.id);
    });

    it('returns failure when no pair can be resolved', () => {
      const action = makeAction({
        actionType: 'link',
        affectedIds: ['eng_20260101_0000_only'],
        payload: null,
      });
      const result = executeRevert(action, service);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toMatch(/sourceId\/targetId or two affectedIds/);
    });
  });

  describe('audit revert', () => {
    it('returns success without touching engrams', () => {
      const action = makeAction({ actionType: 'audit', affectedIds: ['e1'] });
      const result = executeRevert(action, service);
      expect(result.success).toBe(true);
      expect(result.restoredIds).toEqual([]);
    });
  });
});
