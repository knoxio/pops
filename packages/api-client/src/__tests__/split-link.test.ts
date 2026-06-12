import { observable } from '@trpc/server/observable';
import { describe, expect, it } from 'vitest';

import {
  LEGACY_TRPC_URL,
  PILLAR_TRPC_URLS,
  createPillarSplitLink,
  pillarOfPath,
} from '../split-link.js';

import type { Operation, OperationLink, TRPCClientRuntime, TRPCLink } from '@trpc/client';

import type { AppRouter } from '@pops/api';

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
  it('returns the namespace when it is a known pillar', () => {
    expect(pillarOfPath('finance.wishlist.list')).toBe('finance');
    expect(pillarOfPath('media.movies.get')).toBe('media');
    expect(pillarOfPath('core.health')).toBe('core');
  });

  it('returns null for unprefixed paths', () => {
    expect(pillarOfPath('health')).toBeNull();
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
  it('routes finance.* operations to the finance URL', () => {
    const { link, records } = buildRecordingHarness();

    dispatch(link, makeOp('finance.wishlist.list', 1));

    expect(records).toEqual([{ url: PILLAR_TRPC_URLS.finance, path: 'finance.wishlist.list' }]);
  });

  it('routes media.* operations to the media URL', () => {
    const { link, records } = buildRecordingHarness();

    dispatch(link, makeOp('media.movies.get', 7));

    expect(records).toEqual([{ url: PILLAR_TRPC_URLS.media, path: 'media.movies.get' }]);
  });

  it('routes a mix of core and finance ops to two distinct URLs', () => {
    const { link, records } = buildRecordingHarness();

    dispatch(link, makeOp('core.foo', 1));
    dispatch(link, makeOp('finance.bar', 2));

    expect(records).toEqual([
      { url: PILLAR_TRPC_URLS.core, path: 'core.foo' },
      { url: PILLAR_TRPC_URLS.finance, path: 'finance.bar' },
    ]);
    const urls = new Set(records.map((r) => r.url));
    expect(urls.size).toBe(2);
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

  it('routes every known pillar to its dedicated URL', () => {
    const { link, records } = buildRecordingHarness();
    const cases = Object.entries(PILLAR_TRPC_URLS) as [keyof typeof PILLAR_TRPC_URLS, string][];

    cases.forEach(([pillar], index) => {
      dispatch(link, makeOp(`${pillar}.thing`, index + 1));
    });

    expect(records).toEqual(cases.map(([pillar, url]) => ({ url, path: `${pillar}.thing` })));
  });

  it('honours overridden pillar and legacy URLs', () => {
    const records: DispatchRecord[] = [];
    const link = createPillarSplitLink({
      pillarUrls: {
        ...PILLAR_TRPC_URLS,
        finance: 'http://finance-api:3004/trpc',
      },
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

    dispatch(link, makeOp('finance.x', 1));
    dispatch(link, makeOp('unknown.y', 2));

    expect(records).toEqual([
      { url: 'http://finance-api:3004/trpc', path: 'finance.x' },
      { url: 'http://legacy:3000/trpc', path: 'unknown.y' },
    ]);
  });
});
