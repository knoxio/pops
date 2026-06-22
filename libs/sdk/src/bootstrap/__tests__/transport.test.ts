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

type PathRoutedResponse = { status: number; body?: unknown };

/**
 * Path-aware mock fetch: maps the request path to a scripted response, so the
 * slash-first / legacy-fallback candidate order can be exercised. Records the
 * exact URL sequence the transport dialed.
 */
function pathRoutedFetch(routes: Record<string, PathRoutedResponse | undefined>): {
  fetchImpl: typeof fetch;
  paths: string[];
} {
  const paths: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url).pathname;
    paths.push(path);
    const route = routes[path];
    if (!route) throw new Error(`unrouted path ${path}`);
    const body = route.body === undefined ? '' : JSON.stringify(route.body);
    return new Response(body, {
      status: route.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl: vi.fn(fetchImpl), paths };
}

describe('createHttpRegistryTransport', () => {
  it('POSTs the envelope slash-first to /registry/register', async () => {
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
    expect(url).toBe('http://registry.test/registry/register');
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

  it('carries reported capabilities on the register envelope', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: { pillarId: 'finance' } }]);
    const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

    await transport.register({ ...envelope(), capabilities: { ledger: true } });
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string) as {
      capabilities?: Record<string, boolean>;
    };
    expect(sent.capabilities).toEqual({ ledger: true });
  });

  it('POSTs { pillarId } only when no capabilities are passed to heartbeat', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: { ok: true } }]);
    const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

    await transport.heartbeat('finance');
    const [url, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe('http://registry.test/registry/heartbeat');
    const sent = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(sent).toEqual({ pillarId: 'finance' });
    expect(Object.prototype.hasOwnProperty.call(sent, 'capabilities')).toBe(false);
  });

  it('carries reported capabilities on the heartbeat body when provided', async () => {
    const fetchImpl = mockFetch([{ status: 200, body: { ok: true } }]);
    const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

    await transport.heartbeat('cerebrum', { vectorSearch: false });
    const [, init] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const sent = JSON.parse((init as RequestInit).body as string) as {
      pillarId: string;
      capabilities?: Record<string, boolean>;
    };
    expect(sent).toEqual({ pillarId: 'cerebrum', capabilities: { vectorSearch: false } });
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

  describe('slash-first path resolution with legacy fallback', () => {
    it('falls back to the legacy path when the slash path 404s, then caches the winner', async () => {
      const { fetchImpl, paths } = pathRoutedFetch({
        '/registry/register': { status: 404 },
        '/core.registry.register': { status: 200, body: { pillarId: 'finance' } },
      });
      const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

      const first = await transport.register(envelope());
      expect(first.pillarId).toBe('finance');
      expect(paths).toEqual(['/registry/register', '/core.registry.register']);

      // Second call uses ONLY the cached legacy path — single request.
      await transport.register(envelope());
      expect(paths).toEqual([
        '/registry/register',
        '/core.registry.register',
        '/core.registry.register',
      ]);
    });

    it('uses the slash path with no fallback when it succeeds, caching the winner', async () => {
      const { fetchImpl, paths } = pathRoutedFetch({
        '/registry/heartbeat': { status: 200, body: { ok: true } },
      });
      const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

      await transport.heartbeat('finance');
      await transport.heartbeat('finance');
      expect(paths).toEqual(['/registry/heartbeat', '/registry/heartbeat']);
    });

    it('self-heals when a cached path later 404s (rollback then legacy-removal)', async () => {
      // Live path set, flipped to model a core rollback then a Phase-3 removal.
      let live = new Set(['/registry/heartbeat', '/core.registry.heartbeat']);
      const paths: string[] = [];
      const fetchImpl = vi.fn<typeof fetch>(async (input) => {
        const path = new URL(typeof input === 'string' ? input : input.toString()).pathname;
        paths.push(path);
        const ok = live.has(path);
        return new Response(ok ? JSON.stringify({ ok: true }) : '', {
          status: ok ? 200 : 404,
          headers: { 'content-type': 'application/json' },
        });
      });
      const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

      // Steady state: slash wins, single request, cached.
      await transport.heartbeat('finance');
      expect(paths).toEqual(['/registry/heartbeat']);

      // Core rolled back to a build that no longer serves the slash path. The
      // cached slash path 404s; the SAME call falls through to the legacy path
      // (no failed heartbeat) and the hint is invalidated.
      live = new Set(['/core.registry.heartbeat']);
      await transport.heartbeat('finance');
      expect(paths).toEqual([
        '/registry/heartbeat',
        '/registry/heartbeat',
        '/core.registry.heartbeat',
      ]);

      // Legacy is now the cached winner; while it keeps serving, calls stay a
      // single request and do NOT thrash back to slash just because slash exists.
      paths.length = 0;
      await transport.heartbeat('finance');
      expect(paths).toEqual(['/core.registry.heartbeat']);

      // Phase-3 roll-forward: legacy removed, only slash served. The cached
      // legacy path 404s, the call falls through to slash and re-caches it.
      live = new Set(['/registry/heartbeat']);
      paths.length = 0;
      await transport.heartbeat('finance');
      expect(paths).toEqual(['/core.registry.heartbeat', '/registry/heartbeat']);
    });

    it('throws retriable WITHOUT trying the legacy path on a 5xx', async () => {
      const { fetchImpl, paths } = pathRoutedFetch({
        '/registry/register': { status: 503, body: { error: 'down' } },
        '/core.registry.register': { status: 200, body: { pillarId: 'finance' } },
      });
      const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

      await expect(transport.register(envelope())).rejects.toBeInstanceOf(RegistryTransportError);
      expect(paths).toEqual(['/registry/register']);
    });

    it('throws non-retriable when BOTH candidates 404', async () => {
      const { fetchImpl, paths } = pathRoutedFetch({
        '/registry/register': { status: 404 },
        '/core.registry.register': { status: 404 },
      });
      const transport = createHttpRegistryTransport({ baseUrl: 'http://registry.test', fetchImpl });

      try {
        await transport.register(envelope());
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(RegistryTransportError);
        if (err instanceof RegistryTransportError) {
          expect(err.status).toBe(404);
          expect(err.retriable).toBe(false);
        }
      }
      expect(paths).toEqual(['/registry/register', '/core.registry.register']);
    });
  });
});
