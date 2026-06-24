/**
 * Integration tests for `ego.*` over REST.
 *
 * Boots the app against a per-test temp `cerebrum.db` + a temp engram root, with
 * an injected offline {@link makeFakeEgoLlm} (no real Anthropic call is ever
 * made) and an empty peer-client set. Conversation CRUD + context run straight
 * against the DB; chat exercises persist-user-then-assistant; the SSE route is
 * driven through supertest and asserted on its `token`/`done` frames.
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
  makeFakeEgoLlm,
  makeReflexService,
  makeTemplateRegistry,
} from './test-utils.js';

import type { EgoLlm } from '../modules/ego/llm.js';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-test-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-api-ego-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

function client(llm: EgoLlm = makeFakeEgoLlm()) {
  return makeClient(
    createCerebrumApiApp({
      cerebrumDb,
      templateRegistry: makeTemplateRegistry(),
      engramRoot,
      reflexService: makeReflexService(cerebrumDb.db, join(tmpDir, 'reflexes.toml')),
      egoLlm: llm,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
      peerClients: makeEmptyPeerClients(),
    })
  );
}

describe('ego conversations CRUD', () => {
  it('creates a conversation and returns it', async () => {
    const { conversation } = await client().ego.createConversation({
      model: 'claude-sonnet-4-6',
      title: 'My session',
      scopes: ['personal.notes'],
    });
    expect(conversation.id).toMatch(/^conv_/);
    expect(conversation.title).toBe('My session');
    expect(conversation.activeScopes).toEqual(['personal.notes']);
  });

  it('lists conversations with total and title search', async () => {
    const c = client();
    await c.ego.createConversation({ model: 'm', title: 'alpha topic' });
    await c.ego.createConversation({ model: 'm', title: 'beta topic' });

    const all = await c.ego.listConversations();
    expect(all.total).toBe(2);

    const filtered = await c.ego.listConversations({ search: 'alpha' });
    expect(filtered.total).toBe(1);
    expect(filtered.conversations[0]?.title).toBe('alpha topic');
  });

  it('gets a conversation with its messages', async () => {
    const c = client();
    const { conversation } = await c.ego.createConversation({ model: 'm', title: 't' });
    const got = await c.ego.getConversation(conversation.id);
    expect(got.conversation.id).toBe(conversation.id);
    expect(got.messages).toEqual([]);
  });

  it('404s on a missing conversation', async () => {
    await expect(client().ego.getConversation('conv_missing')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('deletes a conversation', async () => {
    const c = client();
    const { conversation } = await c.ego.createConversation({ model: 'm', title: 't' });
    const res = await c.ego.deleteConversation(conversation.id);
    expect(res.success).toBe(true);
    await expect(c.ego.getConversation(conversation.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('ego context', () => {
  it('setScopes replaces the active scopes', async () => {
    const c = client();
    const { conversation } = await c.ego.createConversation({ model: 'm', scopes: ['a'] });
    const res = await c.ego.setScopes(conversation.id, ['work.x', 'work.y']);
    expect(res.scopes).toEqual(['work.x', 'work.y']);

    const active = await c.ego.getActiveContext(conversation.id);
    expect(active.scopes).toEqual(['work.x', 'work.y']);
  });

  it('setScopes 404s on a missing conversation', async () => {
    await expect(client().ego.setScopes('conv_missing', ['x'])).rejects.toMatchObject({
      status: 404,
    });
  });

  it('getActiveContext returns scopes, appContext, and engrams', async () => {
    const c = client();
    const { conversation } = await c.ego.createConversation({ model: 'm', scopes: ['s1'] });
    const active = await c.ego.getActiveContext(conversation.id);
    expect(active.scopes).toEqual(['s1']);
    expect(active.engrams).toEqual([]);
  });

  it('getActiveContext 404s on a missing conversation', async () => {
    await expect(client().ego.getActiveContext('conv_missing')).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe('ego chat', () => {
  it('persists the user + assistant turns and returns the canned reply', async () => {
    const c = client(makeFakeEgoLlm('Hello from the fake LLM.'));
    const result = await c.ego.chat({ message: 'hi there' });

    expect(result.conversationId).toMatch(/^conv_/);
    expect(result.response.role).toBe('assistant');
    expect(result.response.content).toBe('Hello from the fake LLM.');
    expect(result.scopeNegotiation).not.toBeNull();

    const conv = await c.ego.getConversation(result.conversationId);
    expect(conv.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conv.messages[0]?.content).toBe('hi there');
    // First user message auto-titles the conversation.
    expect(conv.conversation.title).toBe('hi there');
  });

  it('continues an existing conversation when conversationId is supplied', async () => {
    const c = client();
    const first = await c.ego.chat({ message: 'first turn' });
    const second = await c.ego.chat({
      conversationId: first.conversationId,
      message: 'second turn',
    });
    expect(second.conversationId).toBe(first.conversationId);

    const conv = await c.ego.getConversation(first.conversationId);
    expect(conv.messages.map((m) => m.content)).toEqual([
      'first turn',
      'Canned ego reply.',
      'second turn',
      'Canned ego reply.',
    ]);
  });
});

function parseSseFrames(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n\n')
    .map((block) => block.replace(/^data: /, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('ego SSE stream', () => {
  it('emits token frames then a done frame and persists the assistant turn', async () => {
    const c = client(makeFakeEgoLlm('streamed words here'));
    const res = await c.ego.stream({ message: 'stream please' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');

    const frames = parseSseFrames(res.text);
    const tokens = frames.filter((f) => f['type'] === 'token');
    const done = frames.find((f) => f['type'] === 'done');

    expect(tokens.length).toBeGreaterThan(1);
    expect(done).toBeDefined();
    expect(done?.['conversationId']).toMatch(/^conv_/);

    const conversationId = done?.['conversationId'] as string;
    const conv = await c.ego.getConversation(conversationId);
    expect(conv.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conv.messages[1]?.content).toBe('streamed words here');
  });

  it('rejects an invalid body with 400', async () => {
    const res = await client().ego.stream({ message: '' });
    expect(res.status).toBe(400);
  });
});
