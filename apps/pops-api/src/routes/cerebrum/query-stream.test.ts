/**
 * Tests for the Cerebrum Query SSE streaming route (PRD-082, issue #2596).
 *
 * Mocks the QueryService so we can drive the stream from a fake async
 * generator and assert the wire-format emitted by the Express handler:
 *   data: {"type":"token","text":"..."}
 *   data: {"type":"done","answer":"...","sources":[...], ...}
 *   data: {"type":"error","message":"..."}
 */
import { type AddressInfo } from 'node:net';

import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Server } from 'node:http';

import type { QueryStreamEvent } from '../../modules/cerebrum/query/query-stream.js';

const mockPrepareStream = vi.fn();

vi.mock('../../modules/cerebrum/query/query-service.js', () => ({
  QueryService: class MockQueryService {
    prepareStream = mockPrepareStream;
  },
}));

vi.mock('../../lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import queryStreamRouter from './query-stream.js';

async function* makeStream(events: QueryStreamEvent[]): AsyncGenerator<QueryStreamEvent> {
  for (const event of events) {
    yield event;
  }
}

/** Parse the raw SSE payload into the list of decoded data objects. */
function parseSseBody(body: string): Array<Record<string, unknown>> {
  const lines = body.split('\n');
  const events: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
  }
  return events;
}

interface StreamResponse {
  status: number;
  contentType: string | null;
  body: string;
}

let server: Server | undefined;
let baseUrl = '';

function startServer(): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(queryStreamRouter);
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      const address = server?.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
}

async function stopServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((err) => (err ? reject(err) : resolve()));
  });
  server = undefined;
}

/** Make a streaming POST against the running server and buffer the body. */
async function postStream(body: unknown): Promise<StreamResponse> {
  const response = await fetch(`${baseUrl}/api/cerebrum/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    body: text,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await startServer();
});

afterEach(async () => {
  await stopServer();
});

describe('POST /api/cerebrum/query/stream', () => {
  it('rejects an empty body with 400', async () => {
    const res = await postStream({});
    expect(res.status).toBe(400);
    expect(mockPrepareStream).not.toHaveBeenCalled();
  });

  it('streams token events followed by a done event', async () => {
    mockPrepareStream.mockResolvedValue(
      makeStream([
        { type: 'token', text: 'Hello' },
        { type: 'token', text: ' world' },
        {
          type: 'done',
          answer: 'Hello world',
          sources: [
            {
              id: 'eng_20260417_0942_test',
              type: 'engram',
              title: 'Test engram',
              excerpt: 'Some excerpt',
              relevance: 0.9,
              scope: 'work.engineering',
            },
          ],
          scopes: ['work.engineering'],
          confidence: 'high',
          tokensIn: 100,
          tokensOut: 50,
        },
      ])
    );

    const res = await postStream({ question: 'what did i decide?' });

    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/event-stream');

    // eslint-disable-next-line no-console
    console.log('DEBUG status=', res.status, 'body length=', res.body.length, 'body=', res.body);
    const events = parseSseBody(res.body);
    expect(events).toHaveLength(3);
    expect(events[0]).toEqual({ type: 'token', text: 'Hello' });
    expect(events[1]).toEqual({ type: 'token', text: ' world' });
    expect(events[2]).toMatchObject({
      type: 'done',
      answer: 'Hello world',
      confidence: 'high',
      tokensIn: 100,
      tokensOut: 50,
    });
    const doneEvent = events[2];
    expect(doneEvent).toBeDefined();
    expect(Array.isArray(doneEvent?.['sources'])).toBe(true);
    const sources = doneEvent?.['sources'] as Array<{ id: string }>;
    expect(sources[0]?.id).toBe('eng_20260417_0942_test');
  });

  it('forwards optional filters (scopes, domains, includeSecret) to the service', async () => {
    mockPrepareStream.mockResolvedValue(
      makeStream([
        {
          type: 'done',
          answer: '',
          sources: [],
          scopes: ['work.*'],
          confidence: 'low',
          tokensIn: 0,
          tokensOut: 0,
        },
      ])
    );

    await postStream({
      question: 'what changed?',
      scopes: ['work.*'],
      domains: ['engrams'],
      includeSecret: true,
      maxSources: 5,
    });

    expect(mockPrepareStream).toHaveBeenCalledWith({
      question: 'what changed?',
      scopes: ['work.*'],
      domains: ['engrams'],
      includeSecret: true,
      maxSources: 5,
    });
  });

  it('emits an error event when the service throws after headers were sent', async () => {
    mockPrepareStream.mockRejectedValue(new Error('boom'));

    const res = await postStream({ question: 'will this fail?' });

    // SSE headers were already flushed, so the status is 200 and the error
    // event arrives in the body — same shape as the ego stream route.
    expect(res.status).toBe(200);
    const events = parseSseBody(res.body);
    const errorEvent = events.find((e) => e['type'] === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.['message']).toBe('boom');
  });

  it('emits an error event when the stream itself throws mid-iteration', async () => {
    async function* failingStream(): AsyncGenerator<QueryStreamEvent> {
      yield { type: 'token', text: 'partial' };
      throw new Error('stream blew up');
    }
    mockPrepareStream.mockResolvedValue(failingStream());

    const res = await postStream({ question: 'midstream failure?' });

    expect(res.status).toBe(200);
    const events = parseSseBody(res.body);
    expect(events[0]).toEqual({ type: 'token', text: 'partial' });
    const errorEvent = events.find((e) => e['type'] === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.['message']).toBe('stream blew up');
  });
});
