import { observable } from '@trpc/server/observable';
import { describe, expect, it } from 'vitest';

import {
  LEGACY_TRPC_URL,
  PILLAR_TRPC_URLS,
  createPillarSplitLink,
  pillarOfPath,
} from '../split-link.js';

import type { Operation, OperationLink, TRPCClientRuntime, TRPCLink } from '@trpc/client';

import type { AppRouter } from '../app-router.js';

interface DispatchRecord {
  readonly url: string;
  readonly path: string;
}

interface RecordingHarness {
  readonly link: TRPCLink<AppRouter>;
  readonly records: DispatchRecord[];
}

function buildRecordingHarness(): RecordingHarness {
  const records: DispatchRecord[] = [];
  const link = createPillarSplitLink({
    linkFor:
      (url) =>
      () =>
      ({ op }) =>
        observable((observer) => {
          records.push({ url, path: op.path });
          observer.next({ result: { type: 'data', data: { ok: true } } });
          observer.complete();
        }),
  });
  return { link, records };
}

const identity = <T>(v: T): T => v;
const RUNTIME: TRPCClientRuntime = {
  transformer: {
    input: { serialize: identity, deserialize: identity },
    output: { serialize: identity, deserialize: identity },
  },
};

function makeOp(path: string, id: number): Operation {
  return {
    id,
    type: 'query',
    input: undefined,
    path,
    context: {},
    signal: null,
  };
}

function dispatch(link: TRPCLink<AppRouter>, op: Operation): void {
  const handler: OperationLink<AppRouter> = link(RUNTIME);
  const result$ = handler({
    op,
    next: () => {
      throw new Error('terminal link should not call next');
    },
  });
  const sub = result$.subscribe({});
  sub.unsubscribe();
}

describe('pillarOfPath', () => {
  it('returns null now that no pillar has a dedicated tRPC URL', () => {
    expect(pillarOfPath('core.health')).toBeNull();
    expect(pillarOfPath('cerebrum.nudges.list')).toBeNull();
  });

  it('returns null for unprefixed paths', () => {
    expect(pillarOfPath('health')).toBeNull();
  });

  it('returns null for pillars that left tRPC for a REST contract', () => {
    expect(pillarOfPath('finance.wishlist.list')).toBeNull();
    expect(pillarOfPath('media.movies.get')).toBeNull();
    expect(pillarOfPath('food.recipes.list')).toBeNull();
  });

  it('returns null for paths prefixed with a non-pillar namespace', () => {
    expect(pillarOfPath('pops.health')).toBeNull();
    expect(pillarOfPath('debug.ping')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(pillarOfPath('')).toBeNull();
  });
});

describe('createPillarSplitLink', () => {
  it('routes operations of pillars that left tRPC to the legacy URL', () => {
    const { link, records } = buildRecordingHarness();

    dispatch(link, makeOp('finance.wishlist.list', 1));
    dispatch(link, makeOp('media.movies.get', 7));

    expect(records).toEqual([
      { url: LEGACY_TRPC_URL, path: 'finance.wishlist.list' },
      { url: LEGACY_TRPC_URL, path: 'media.movies.get' },
    ]);
  });

  it('routes the remaining tRPC procedures to the legacy URL', () => {
    const { link, records } = buildRecordingHarness();

    // `cerebrum.nudges.list` is the sole live FE tRPC procedure (global
    // search moved to the orchestrator's `POST /search`); `core.health` is a
    // non-pillar path. Both fall through to the legacy `/trpc` catch-all.
    dispatch(link, makeOp('cerebrum.nudges.list', 1));
    dispatch(link, makeOp('core.health', 2));

    expect(records).toEqual([
      { url: LEGACY_TRPC_URL, path: 'cerebrum.nudges.list' },
      { url: LEGACY_TRPC_URL, path: 'core.health' },
    ]);
    const urls = new Set(records.map((r) => r.url));
    expect(urls.size).toBe(1);
  });

  it('routes unprefixed paths to the legacy URL', () => {
    const { link, records } = buildRecordingHarness();

    dispatch(link, makeOp('health', 1));

    expect(records).toEqual([{ url: LEGACY_TRPC_URL, path: 'health' }]);
  });

  it('routes paths with an unknown namespace to the legacy URL', () => {
    const { link, records } = buildRecordingHarness();

    dispatch(link, makeOp('pops.health', 1));
    dispatch(link, makeOp('debug.ping', 2));

    expect(records).toEqual([
      { url: LEGACY_TRPC_URL, path: 'pops.health' },
      { url: LEGACY_TRPC_URL, path: 'debug.ping' },
    ]);
  });

  it('exposes no dedicated per-pillar URLs', () => {
    expect(Object.keys(PILLAR_TRPC_URLS)).toEqual([]);
  });

  it('honours an overridden legacy URL', () => {
    const records: DispatchRecord[] = [];
    const link = createPillarSplitLink({
      legacyUrl: 'http://legacy:3000/trpc',
      linkFor:
        (url) =>
        () =>
        ({ op }) =>
          observable((observer) => {
            records.push({ url, path: op.path });
            observer.next({ result: { type: 'data', data: { ok: true } } });
            observer.complete();
          }),
    });

    dispatch(link, makeOp('core.x', 1));
    dispatch(link, makeOp('unknown.y', 2));

    expect(records).toEqual([
      { url: 'http://legacy:3000/trpc', path: 'core.x' },
      { url: 'http://legacy:3000/trpc', path: 'unknown.y' },
    ]);
  });
});
