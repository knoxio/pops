import { describe, expect, it, vi } from 'vitest';

import { validManifest } from '../../__tests__/fixtures.js';
import {
  createHttpRegistryTransport,
  RegistryNetworkError,
  RegistryTransportError,
} from '../transport.js';

function mockFetch(
  responses: Array<{ status: number; body?: unknown; throwOnce?: boolean }>
): typeof fetch {
  let i = 0;
  const fn: typeof fetch = async (_input, _init) => {
    const r = responses[i];
    i += 1;
    if (!r) throw new Error('no more mock responses');
    if (r.throwOnce) throw new Error('network down');
    const body = r.body === undefined ? '' : JSON.stringify(r.body);
    return new Response(body, {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return vi.fn(fn);
}

function envelope(): {
  pillarId: string;
  baseUrl: string;
  manifest: ReturnType<typeof validManifest>;
} {
  const manifest = validManifest();
  return {
    pillarId: manifest.pillar,
    baseUrl: 'http://finance-api:3004',
    manifest,
  };
}

describe('createHttpRegistryTransport', () => {
  it('POSTs the envelope to /core.registry.register', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: { pillarId: 'finance' } }]);
    const transport = createHttpRegistryTransport({
      baseUrl: 'http://registry.test',
      fetchImpl,
    });

    const payload = envelope();
    const result = await transport.register(payload);
    expect(result.pillarId).toBe('finance');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://registry.test/core.registry.register');
    expect((init as RequestInit).method).toBe('POST');
    const bodyText = (init as RequestInit).body;
    expect(typeof bodyText).toBe('string');
    const sent = JSON.parse(bodyText as string) as {
      pillarId: string;
      baseUrl: string;
      manifest: { pillar: string };
    };
    expect(sent.pillarId).toBe('finance');
    expect(sent.baseUrl).toBe('http://finance-api:3004');
    expect(sent.manifest.pillar).toBe('finance');
    expect(Object.prototype.hasOwnProperty.call(sent, 'apiKey')).toBe(false);
  });

  it('throws RegistryNetworkError when fetch rejects', async () => {
    const fetchImpl = mockFetch([{ status: 0, throwOnce: true }]);
    const transport = createHttpRegistryTransport({
      baseUrl: 'http://registry.test',
      fetchImpl,
    });

    await expect(transport.register(envelope())).rejects.toBeInstanceOf(RegistryNetworkError);
  });

  it('throws non-retriable RegistryTransportError on 400 with parsed issues', async () => {
    const fetchImpl = mockFetch([
      {
        status: 400,
        body: {
          issues: [{ field: 'routes.queries', reason: 'dup' }],
        },
      },
    ]);
    const transport = createHttpRegistryTransport({
      baseUrl: 'http://registry.test',
      fetchImpl,
    });

    try {
      await transport.register(envelope());
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RegistryTransportError);
      if (err instanceof RegistryTransportError) {
        expect(err.status).toBe(400);
        expect(err.retriable).toBe(false);
        expect(err.issues).toHaveLength(1);
      }
    }
  });

  it('throws retriable RegistryTransportError on 503', async () => {
    const fetchImpl = mockFetch([{ status: 503, body: { error: 'down' } }]);
    const transport = createHttpRegistryTransport({
      baseUrl: 'http://registry.test',
      fetchImpl,
    });

    try {
      await transport.heartbeat('finance');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(RegistryTransportError);
      if (err instanceof RegistryTransportError) {
        expect(err.retriable).toBe(true);
      }
    }
  });

  it('unregister returns void on 200 with empty body', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: {} }]);
    const transport = createHttpRegistryTransport({
      baseUrl: 'http://registry.test/',
      fetchImpl,
    });

    await expect(transport.unregister('finance')).resolves.toBeUndefined();
  });
});
