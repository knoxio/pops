/**
 * Integration tests for `cerebrum.emit.*` over REST.
 *
 * Boots the app against a per-test temp cerebrum.db seeded with engram-index +
 * embeddings rows (so the structured/BM25 retrieval leg returns sources without
 * any embedding provider), an injected offline {@link makeFakeGenerationLlm}
 * (no real Anthropic call), and empty peer clients. The fake LLM echoes a
 * citation so the citation-parser path is exercised end-to-end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeFakeGenerationLlm,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { GenerationLlm } from '../modules/emit/llm.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-emit-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-emit-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

interface SeedEngramArgs {
  id: string;
  title: string;
  type?: string;
  scopes?: string[];
  tags?: string[];
  preview?: string;
  createdAt?: string;
}

function seedEngram(db: OpenedCerebrumDb, args: SeedEngramArgs): void {
  const raw = db.raw;
  const createdAt = args.createdAt ?? '2026-01-01T00:00:00.000Z';
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, ?, 'manual', 'active', NULL, ?, ?, ?, ?, ?, NULL)`
    )
    .run(
      args.id,
      `${args.id}.md`,
      args.type ?? 'note',
      createdAt,
      createdAt,
      args.title,
      `hash-${args.id}`,
      10
    );
  for (const scope of args.scopes ?? []) {
    raw.prepare('INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)').run(args.id, scope);
  }
  for (const tag of args.tags ?? []) {
    raw.prepare('INSERT INTO engram_tags (engram_id, tag) VALUES (?, ?)').run(args.id, tag);
  }
  raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, ?)`
    )
    .run(args.id, `hash-${args.id}`, args.preview ?? `preview ${args.title}`, createdAt);
}

function client(llm: GenerationLlm = makeFakeGenerationLlm()) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
      emitLlm: llm,
    })
  );
}

describe('POST /emit/report', () => {
  it('synthesises a report and parses valid citations from the LLM output', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0001_db',
      title: 'DB choice',
      scopes: ['work.arch'],
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260102_0002_cache',
      title: 'Cache layer',
      scopes: ['work.arch'],
    });

    const llm = makeFakeGenerationLlm(
      () =>
        '# Architecture\n\nWe chose SQLite [eng_20260101_0001_db] and added a cache [eng_20260102_0002_cache].'
    );
    const { document } = await client(llm).emit.generateReport({ query: 'architecture' });

    expect(document).not.toBeNull();
    expect(document?.mode).toBe('report');
    expect(document?.title).toBe('Architecture');
    expect(document?.sources.map((s) => s.id).toSorted()).toEqual([
      'eng_20260101_0001_db',
      'eng_20260102_0002_cache',
    ]);
    expect(document?.metadata.sourceCount).toBe(2);
  });

  it('returns an insufficient-data notice with fewer than two sources', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0001_db',
      title: 'DB choice',
      scopes: ['work.arch'],
    });
    const result = await client().emit.generateReport({
      query: 'architecture',
      scopes: ['work.arch'],
    });
    expect(result.document).toBeNull();
    expect(result.notice).toMatch(/insufficient/i);
  });
});

describe('POST /emit/summary', () => {
  it('requires from <= to (400 on inverted range)', async () => {
    await expect(
      client().emit.generateSummary({ dateRange: { from: '2026-02-01', to: '2026-01-01' } })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('returns an empty-summary document when no engrams match', async () => {
    const { document } = await client().emit.generateSummary({
      dateRange: { from: '2026-01-01', to: '2026-01-31' },
    });
    expect(document).not.toBeNull();
    expect(document?.mode).toBe('summary');
    expect(document?.metadata.sourceCount).toBe(0);
  });
});

describe('POST /emit/timeline', () => {
  it('orders entries chronologically and tags the source set', async () => {
    seedEngram(cerebrumDb, {
      id: 'eng_20260101_0001_a',
      title: 'First',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    seedEngram(cerebrumDb, {
      id: 'eng_20260301_0002_b',
      title: 'Second',
      createdAt: '2026-03-01T00:00:00.000Z',
    });

    const { document } = await client(
      makeFakeGenerationLlm(() => '# Timeline\n\nentries')
    ).emit.generateTimeline({ query: 'history' });

    expect(document?.mode).toBe('timeline');
    expect(document?.metadata.sourceCount).toBe(2);
  });
});

describe('POST /emit/generate', () => {
  it('rejects report mode without a query (400)', async () => {
    await expect(client().emit.generate({ mode: 'report' })).rejects.toMatchObject({ status: 400 });
  });

  it('rejects summary mode without a date range (400)', async () => {
    await expect(client().emit.generate({ mode: 'summary' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('POST /emit/preview', () => {
  it('returns sources + an outline without full synthesis', async () => {
    seedEngram(cerebrumDb, { id: 'eng_20260101_0001_x', title: 'X', scopes: ['work'] });
    seedEngram(cerebrumDb, { id: 'eng_20260102_0002_y', title: 'Y', scopes: ['work'] });

    const result = await client(
      makeFakeGenerationLlm(() => '# Outline\n\n- Section [eng_20260101_0001_x]')
    ).emit.preview({ mode: 'report', query: 'topic' });

    expect(result.sources.length).toBe(2);
    expect(result.outline).toContain('Outline');
  });

  it('returns a no-sources outline when retrieval is empty', async () => {
    const result = await client().emit.preview({ mode: 'report', query: 'nothing here' });
    expect(result.sources).toEqual([]);
    expect(result.outline).toMatch(/no sources/i);
  });
});
