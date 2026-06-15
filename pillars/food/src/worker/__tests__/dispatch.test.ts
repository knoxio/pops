import { describe, expect, it, vi } from 'vitest';

import { runIngestJob } from '../dispatch.js';
import { defaultHandlers } from '../handlers/index.js';
import { NOT_IMPLEMENTED_EXTRACTOR_VERSION } from '../handlers/not-implemented.js';

import type { IngestJobData, IngestJobResult } from '../../contract/queue/index.js';
import type { IngestHandlerRegistry } from '../handlers/index.js';
import type { HandlerContext } from '../handlers/types.js';

const ctx: HandlerContext = { isCancelled: () => false };

function okResult(tag: string): IngestJobResult {
  return {
    ok: true,
    dsl: `@recipe(${tag})`,
    meta: { extractor_version: 'mock@test', stages: {} },
  };
}

function mockRegistry(): {
  handlers: IngestHandlerRegistry;
  calls: { kind: keyof IngestHandlerRegistry; data: IngestJobData; cancelled: boolean }[];
} {
  const calls: {
    kind: keyof IngestHandlerRegistry;
    data: IngestJobData;
    cancelled: boolean;
  }[] = [];
  const handlers: IngestHandlerRegistry = {
    'url-web': vi.fn(async (data, c) => {
      calls.push({ kind: 'url-web', data, cancelled: await c.isCancelled() });
      return okResult('web');
    }),
    'url-instagram': vi.fn(async (data, c) => {
      calls.push({ kind: 'url-instagram', data, cancelled: await c.isCancelled() });
      return okResult('ig');
    }),
    screenshot: vi.fn(async (data, c) => {
      calls.push({ kind: 'screenshot', data, cancelled: await c.isCancelled() });
      return okResult('screenshot');
    }),
    text: vi.fn(async (data, c) => {
      calls.push({ kind: 'text', data, cancelled: await c.isCancelled() });
      return okResult('text');
    }),
  };
  return { handlers, calls };
}

describe('runIngestJob', () => {
  it('dispatches url-web jobs to the web handler', async () => {
    const { handlers, calls } = mockRegistry();
    const result = await runIngestJob(
      { kind: 'url-web', sourceId: 1, url: 'https://example.com' },
      ctx,
      handlers
    );
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      { kind: 'url-web', data: expect.objectContaining({ kind: 'url-web' }), cancelled: false },
    ]);
  });

  it('dispatches url-instagram jobs to the instagram handler', async () => {
    const { handlers, calls } = mockRegistry();
    await runIngestJob(
      { kind: 'url-instagram', sourceId: 2, url: 'https://instagram.com/r/abc' },
      ctx,
      handlers
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.kind).toBe('url-instagram');
  });

  it('dispatches screenshot jobs to the screenshot handler', async () => {
    const { handlers, calls } = mockRegistry();
    await runIngestJob(
      {
        kind: 'screenshot',
        sourceId: 3,
        mimeType: 'image/png',
        contentPath: '/tmp/x.png',
      },
      ctx,
      handlers
    );
    expect(calls[0]?.kind).toBe('screenshot');
  });

  it('dispatches text jobs to the text handler', async () => {
    const { handlers, calls } = mockRegistry();
    await runIngestJob({ kind: 'text', sourceId: 4, body: 'pasta' }, ctx, handlers);
    expect(calls[0]?.kind).toBe('text');
  });

  it('does not invoke handlers for other kinds', async () => {
    const { handlers } = mockRegistry();
    await runIngestJob({ kind: 'text', sourceId: 5, body: 'x' }, ctx, handlers);
    expect(handlers['url-web']).not.toHaveBeenCalled();
    expect(handlers['url-instagram']).not.toHaveBeenCalled();
    expect(handlers.screenshot).not.toHaveBeenCalled();
  });

  it('threads the cancellation context into the handler', async () => {
    const { handlers, calls } = mockRegistry();
    await runIngestJob(
      { kind: 'text', sourceId: 6, body: 'x' },
      { isCancelled: () => true },
      handlers
    );
    expect(calls[0]?.cancelled).toBe(true);
  });

  it('returns the handler result verbatim', async () => {
    const handlers: IngestHandlerRegistry = {
      ...mockRegistry().handlers,
      text: async () => ({
        ok: false,
        errorCode: 'TestFailure',
        errorMessage: 'forced',
        meta: { extractor_version: 'mock@test', stages: {} },
      }),
    };
    const result = await runIngestJob({ kind: 'text', sourceId: 7, body: 'x' }, ctx, handlers);
    expect(result).toEqual({
      ok: false,
      errorCode: 'TestFailure',
      errorMessage: 'forced',
      meta: { extractor_version: 'mock@test', stages: {} },
    });
  });
});

describe('default handler stubs', () => {
  it('no kinds are still routed to the NotImplemented stub', async () => {
    // PRDs 127 (`url-web`), 130 (`url-instagram`), 131 (`screenshot`), and
    // 132 (`text`) have all replaced their stubs with real pipelines.
    // The PRD-126 `NotImplemented` extractor-version should never surface
    // from a default-handler dispatch anymore. The stub utility is
    // preserved in `not-implemented.ts` so the next per-kind PRD can
    // bootstrap a follow-up handler.
    const kinds: IngestJobData[] = [
      { kind: 'url-web', sourceId: 1, url: 'https://example.test/recipe' },
      { kind: 'url-instagram', sourceId: 2, url: 'https://instagram.com/r/abc' },
      { kind: 'screenshot', sourceId: 3, mimeType: 'image/png', contentPath: '/tmp/x.png' },
      { kind: 'text', sourceId: 4, body: 'hi' },
    ];
    for (const data of kinds) {
      const result = await runIngestJob(data, ctx, defaultHandlers);
      if (result.ok) continue;
      expect(result.meta.extractor_version).not.toBe(NOT_IMPLEMENTED_EXTRACTOR_VERSION);
    }
  });
});
