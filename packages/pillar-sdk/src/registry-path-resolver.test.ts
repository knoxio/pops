import { describe, expect, it } from 'vitest';

import {
  createPathResolver,
  createResolverLeg,
  resolveWithFallback,
  type RegistryPathResolver,
} from './registry-path-resolver.js';

const NEW = '/registry/register';
const OLD = '/core.registry.register';

type WinTracker = { hadHint: boolean };

/**
 * A faithful miniature of the Phase-2a transport loop, exercising the resolver
 * against an injected fetch: try each candidate in order, fall through on 404,
 * cache the winner, and invalidate the hint on a 404 against the path that was
 * the cached winner from a prior call. No mocks of real logic — the resolver is
 * the real thing under test. `tracker` carries the "is a winner cached?" flag
 * across calls exactly as a long-lived transport would.
 */
async function resolveOnce(
  resolver: RegistryPathResolver,
  status: (path: string) => number,
  tracker: WinTracker
): Promise<{ winner: string; attempts: string[] }> {
  const attempts: string[] = [];
  const candidates = resolver.candidates();
  for (let i = 0; i < candidates.length; i += 1) {
    const path = candidates[i]!;
    attempts.push(path);
    if (status(path) === 404) {
      if (i === 0 && tracker.hadHint) {
        resolver.invalidate();
        tracker.hadHint = false;
      }
      continue;
    }
    resolver.remember(path);
    tracker.hadHint = true;
    return { winner: path, attempts };
  }
  throw new Error(`all candidates 404'd: ${attempts.join(', ')}`);
}

const serves =
  (...live: string[]) =>
  (path: string): number =>
    live.includes(path) ? 200 : 404;

const freshTracker = (): WinTracker => ({ hadHint: false });

describe('createPathResolver', () => {
  it('offers both candidates, primary first, before anything is resolved', () => {
    const resolver = createPathResolver(NEW, OLD);
    expect(resolver.candidates()).toEqual([NEW, OLD]);
  });

  it('keeps the fallback reachable after remembering the primary', () => {
    const resolver = createPathResolver(NEW, OLD);
    resolver.remember(NEW);
    expect(resolver.candidates()).toEqual([NEW, OLD]);
  });

  it('orders the legacy winner first but keeps the primary reachable', () => {
    const resolver = createPathResolver(NEW, OLD);
    resolver.remember(OLD);
    expect(resolver.candidates()).toEqual([OLD, NEW]);
  });

  it('re-expands to both candidates after invalidate', () => {
    const resolver = createPathResolver(NEW, OLD);
    resolver.remember(OLD);
    resolver.invalidate();
    expect(resolver.candidates()).toEqual([NEW, OLD]);
  });

  it('orders the primary winner first after remembering the primary', () => {
    const resolver = createPathResolver(NEW, OLD);
    resolver.remember(NEW);
    expect(resolver.candidates()).toEqual([NEW, OLD]);
  });

  it('orders the fallback winner first but keeps the primary a candidate', () => {
    const resolver = createPathResolver(NEW, OLD);
    resolver.remember(OLD);
    const ordered = resolver.candidates();
    expect(ordered).toEqual([OLD, NEW]);
    expect(ordered).toContain(NEW);
  });

  it('ignores remembering a path that is neither the primary nor the fallback', () => {
    const resolver = createPathResolver(NEW, OLD);
    const before = resolver.candidates();

    resolver.remember('/registry/not-a-real-route');

    expect(resolver.candidates()).toEqual(before);
    expect(resolver.candidates()).toEqual([NEW, OLD]);
  });

  it('does not let an unknown path clobber a previously remembered winner', () => {
    const resolver = createPathResolver(NEW, OLD);
    resolver.remember(OLD);

    resolver.remember('/core.registry.bogus');

    expect(resolver.candidates()).toEqual([OLD, NEW]);
  });

  it('resolves to the new path when core serves it (single request)', async () => {
    const resolver = createPathResolver(NEW, OLD);
    const result = await resolveOnce(resolver, serves(NEW), freshTracker());
    expect(result.winner).toBe(NEW);
    expect(result.attempts).toEqual([NEW]);
  });

  it('falls back to the legacy path on a 404 against the new path', async () => {
    const resolver = createPathResolver(NEW, OLD);
    const result = await resolveOnce(resolver, serves(OLD), freshTracker());
    expect(result.winner).toBe(OLD);
    expect(result.attempts).toEqual([NEW, OLD]);
  });

  it('hits only the cached path once the winner is known (steady state)', async () => {
    const resolver = createPathResolver(NEW, OLD);
    const tracker = freshTracker();
    await resolveOnce(resolver, serves(NEW), tracker);
    const second = await resolveOnce(resolver, serves(NEW), tracker);
    expect(second.attempts).toEqual([NEW]);
    expect(second.winner).toBe(NEW);
  });

  it('self-heals when a cached new path later 404s (the rollback regression)', async () => {
    const resolver = createPathResolver(NEW, OLD);
    const tracker = freshTracker();

    const first = await resolveOnce(resolver, serves(NEW), tracker);
    expect(first.winner).toBe(NEW);

    // Core rolled back: the cached new path now 404s. The call must fall
    // through to the legacy path WITHOUT failing the heartbeat.
    const rolledBack = await resolveOnce(resolver, serves(OLD), tracker);
    expect(rolledBack.winner).toBe(OLD);
    expect(rolledBack.attempts).toEqual([NEW, OLD]);

    // The legacy path is now the live winner, but the new path stays reachable
    // as a candidate — no permanent eviction onto one shape.
    expect(resolver.candidates()).toEqual([OLD, NEW]);

    // Roll forward again (new live, legacy gone, e.g. Phase 3): the cached
    // legacy path 404s, the call falls through to the new path and re-caches it.
    const rolledForward = await resolveOnce(resolver, serves(NEW), tracker);
    expect(rolledForward.winner).toBe(NEW);
    expect(rolledForward.attempts).toEqual([OLD, NEW]);
    expect(resolver.candidates()).toEqual([NEW, OLD]);
  });

  it('throws when no candidate is served', async () => {
    const resolver = createPathResolver(NEW, OLD);
    await expect(resolveOnce(resolver, serves(), freshTracker())).rejects.toThrow(
      /all candidates 404/
    );
  });
});

class NotFound extends Error {}
const isNotFound = (err: unknown): boolean => err instanceof NotFound;

describe('resolveWithFallback', () => {
  it('never sends a request to an empty or undefined path', async () => {
    const leg = createResolverLeg(NEW, OLD);
    const seen: string[] = [];
    const send = (path: string): Promise<string> => {
      seen.push(path);
      return path === OLD ? Promise.resolve('ok') : Promise.reject(new NotFound());
    };

    const result = await resolveWithFallback(leg, isNotFound, send);

    expect(result).toBe('ok');
    expect(seen).toEqual([NEW, OLD]);
    for (const path of seen) {
      expect(path).toBeTruthy();
      expect(path).not.toBe('');
    }
  });

  it('returns the first 2xx and stops (single request in the happy path)', async () => {
    const leg = createResolverLeg(NEW, OLD);
    const seen: string[] = [];
    const result = await resolveWithFallback(leg, isNotFound, (path) => {
      seen.push(path);
      return Promise.resolve(path);
    });
    expect(result).toBe(NEW);
    expect(seen).toEqual([NEW]);
  });

  it('rethrows a non-404 error immediately without trying the next candidate', async () => {
    const leg = createResolverLeg(NEW, OLD);
    const seen: string[] = [];
    const boom = new Error('5xx up-but-broken');
    await expect(
      resolveWithFallback(leg, isNotFound, (path) => {
        seen.push(path);
        return Promise.reject(boom);
      })
    ).rejects.toBe(boom);
    expect(seen).toEqual([NEW]);
  });

  it('rethrows the 404 when the LAST candidate 404s', async () => {
    const leg = createResolverLeg(NEW, OLD);
    const seen: string[] = [];
    await expect(
      resolveWithFallback(leg, isNotFound, (path) => {
        seen.push(path);
        return Promise.reject(new NotFound());
      })
    ).rejects.toBeInstanceOf(NotFound);
    expect(seen).toEqual([NEW, OLD]);
  });
});
