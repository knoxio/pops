import { describe, expect, it } from 'vitest';

import { consumeSse, type SseFrame } from './registry-sse-client.ts';

function makeStreamingResponse(chunks: readonly string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('consumeSse', () => {
  it('parses named events with single-line data payloads', async () => {
    const frames: SseFrame[] = [];
    await consumeSse({
      url: 'http://core-api/registry/subscribe',
      onFrame: (f) => frames.push(f),
      fetchImpl: async () =>
        makeStreamingResponse([
          'event: pillar.registered\n',
          'data: {"pillarId":"finance"}\n\n',
          'event: pillar.deregistered\n',
          'data: {"pillarId":"finance"}\n\n',
        ]),
    });
    expect(frames).toEqual([
      { event: 'pillar.registered', data: '{"pillarId":"finance"}' },
      { event: 'pillar.deregistered', data: '{"pillarId":"finance"}' },
    ]);
  });

  it('joins multi-line data fields with a newline', async () => {
    const frames: SseFrame[] = [];
    await consumeSse({
      url: 'http://core-api/registry/subscribe',
      onFrame: (f) => frames.push(f),
      fetchImpl: async () =>
        makeStreamingResponse(['event: pillar.snapshot\ndata: line1\ndata: line2\n\n']),
    });
    expect(frames).toEqual([{ event: 'pillar.snapshot', data: 'line1\nline2' }]);
  });

  it('reassembles frames split across chunk boundaries', async () => {
    const frames: SseFrame[] = [];
    await consumeSse({
      url: 'http://core-api/registry/subscribe',
      onFrame: (f) => frames.push(f),
      fetchImpl: async () =>
        makeStreamingResponse([
          'event: pillar.regis',
          'tered\ndata: {"pi',
          'llarId":"finance"}',
          '\n\nevent: pillar.deregistered\ndata: {"pillarId":"finance"}\n\n',
        ]),
    });
    expect(frames.map((f) => f.event)).toEqual(['pillar.registered', 'pillar.deregistered']);
    expect(frames[0]?.data).toBe('{"pillarId":"finance"}');
  });

  it('ignores comment lines and empty fields', async () => {
    const frames: SseFrame[] = [];
    await consumeSse({
      url: 'http://core-api/registry/subscribe',
      onFrame: (f) => frames.push(f),
      fetchImpl: async () =>
        makeStreamingResponse([': keep-alive\n\nevent: pillar.registered\ndata: ok\n\n']),
    });
    expect(frames).toEqual([{ event: 'pillar.registered', data: 'ok' }]);
  });

  it('throws when the upstream returns non-2xx', async () => {
    await expect(
      consumeSse({
        url: 'http://core-api/registry/subscribe',
        onFrame: () => undefined,
        fetchImpl: async () =>
          new Response('nope', { status: 503, statusText: 'Service Unavailable' }),
      })
    ).rejects.toThrow(/503/);
  });
});
