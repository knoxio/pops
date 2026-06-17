/**
 * Integration tests for `cerebrum.query.*` + the `POST /query/stream` SSE route.
 *
 * Boots the app against a per-test temp cerebrum.db seeded with engram-index +
 * embeddings rows (the structured/BM25 leg returns sources without an embedding
 * provider). The one-shot LLM is an injected {@link makeFakeQueryLlm}; the SSE
 * route is driven with an injected {@link makeFakeQueryStreamLlm} yielding
 * canned tokens — no real Anthropic call is ever made.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import supertest from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import {
  makeClient,
  makeEmptyPeerClients,
  makeFakeQueryLlm,
  makeFakeQueryStreamLlm,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { Express } from 'express';

import type { QueryLlm, QueryStreamLlm } from '../modules/query/llm.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-query-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-query-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function seedEngram(db: OpenedCerebrumDb, id: string, title: string, scopes: string[]): void {
  const raw = db.raw;
  const at = '2026-01-01T00:00:00.000Z';
  raw
    .prepare(
      `INSERT INTO engram_index
        (id, file_path, type, source, status, template, created_at, modified_at, title, content_hash, word_count, custom_fields)
       VALUES (?, ?, 'note', 'manual', 'active', NULL, ?, ?, ?, ?, 10, NULL)`
    )
    .run(id, `${id}.md`, at, at, title, `hash-${id}`);
  for (const scope of scopes) {
    raw.prepare('INSERT INTO engram_scopes (engram_id, scope) VALUES (?, ?)').run(id, scope);
  }
  raw
    .prepare(
      `INSERT INTO embeddings
        (source_type, source_id, chunk_index, content_hash, content_preview, model, dimensions, created_at)
       VALUES ('engram', ?, 0, ?, ?, 'm', 1536, ?)`
    )
    .run(id, `hash-${id}`, `preview ${title}`, at);
}

interface AppDeps {
  llm?: QueryLlm;
  streamLlm?: QueryStreamLlm;
}

function buildApp(deps: AppDeps = {}): Express {
  return createCerebrumApiApp({
    cerebrumDb,
    templateRegistry: makeTemplateRegistry(),
    engramRoot,
    reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3007',
    peerClients: makeEmptyPeerClients(),
    queryLlm: deps.llm ?? makeFakeQueryLlm(),
    queryStreamLlm: deps.streamLlm ?? makeFakeQueryStreamLlm(),
  });
}

function client(deps: AppDeps = {}) {
  return makeClient(buildApp(deps));
}

describe('POST /query/ask', () => {
  it('answers from retrieved sources and parses valid citations', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_db', 'DB choice', ['work']);
    const llm = makeFakeQueryLlm(() => 'We picked SQLite [eng_20260101_0001_db].');

    const res = await client({ llm }).query.ask({
      question: 'which database?',
      scopes: ['work'],
    });

    expect(res.answer).toContain('SQLite');
    expect(res.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_db']);
    expect(res.scopes).toEqual(['work']);
  });

  it('strips hallucinated citations the LLM invents', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_real', 'Real', ['work']);
    const llm = makeFakeQueryLlm(
      () => 'Real [eng_20260101_0001_real] and fake [eng_20269999_9999_ghost].'
    );

    const res = await client({ llm }).query.ask({ question: 'what is real?' });

    expect(res.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_real']);
    expect(res.answer).not.toContain('ghost');
  });

  it('returns a low-confidence no-info answer when nothing is retrieved', async () => {
    const res = await client().query.ask({ question: 'absolutely nothing matches' });
    expect(res.confidence).toBe('low');
    expect(res.sources).toEqual([]);
  });
});

describe('POST /query/retrieve', () => {
  it('returns sources without calling the LLM', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_a', 'Alpha', ['work']);
    const res = await client().query.retrieve({ question: 'alpha' });
    expect(res.sources.map((s) => s.id)).toEqual(['eng_20260101_0001_a']);
  });
});

describe('POST /query/explain', () => {
  it('echoes scope inference + retrieval plan and flags secret mentions', async () => {
    const res = await client().query.explain('what is my secret password?');
    expect(res.scopeInference.source).toBe('default');
    expect(res.retrievalPlan.maxSources).toBeGreaterThan(0);
    expect(res.secretNotice).not.toBeNull();
  });
});

function parseSseFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)) as Record<string, unknown>);
}

describe('POST /query/stream (SSE)', () => {
  it('streams token frames followed by a terminal done frame', async () => {
    seedEngram(cerebrumDb, 'eng_20260101_0001_s', 'Streamed', ['work']);
    const streamLlm = makeFakeQueryStreamLlm(['SQLite ', '[eng_20260101_0001_s] ', 'wins.']);

    const res = await supertest
      .agent(buildApp({ streamLlm }))
      .post('/query/stream')
      .send({ question: 'which database?' });

    expect(res.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(res.text);
    const tokens = frames.filter((f) => f['type'] === 'token');
    const done = frames.find((f) => f['type'] === 'done');

    expect(tokens.length).toBe(3);
    expect(tokens.map((t) => t['text']).join('')).toContain('SQLite');
    if (done === undefined) throw new Error('expected a done frame');
    expect(done['answer']).toContain('SQLite');
    expect((done['sources'] as Array<{ id: string }>).map((s) => s.id)).toEqual([
      'eng_20260101_0001_s',
    ]);
  });

  it('emits a single-token no-info stream when nothing is retrieved', async () => {
    const res = await supertest
      .agent(buildApp())
      .post('/query/stream')
      .send({ question: 'nothing at all matches this' });

    const frames = parseSseFrames(res.text);
    const done = frames.find((f) => f['type'] === 'done');
    expect(done?.['confidence']).toBe('low');
    expect(done?.['sources']).toEqual([]);
  });

  it('rejects an invalid body with 400 before opening the stream', async () => {
    const res = await supertest.agent(buildApp()).post('/query/stream').send({ question: '' });
    expect(res.status).toBe(400);
  });
});
