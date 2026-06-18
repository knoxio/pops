import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppContextProvider } from '../AppContextProvider';
import { useSearchInputData } from './useSearchInputData';

import type { ReactNode } from 'react';

interface WireHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: string;
  data?: unknown;
}

interface WireSection {
  domain: string;
  moduleId: string;
  hits: WireHit[];
  icon: string;
  color: string;
  isContextSection: boolean;
  totalCount: number;
}

function makeHit(overrides: Partial<WireHit> = {}): WireHit {
  return {
    uri: 'pops:media/movie/1',
    score: 0.9,
    matchField: 'title',
    matchType: 'prefix',
    data: { title: 'The Matrix' },
    ...overrides,
  };
}

function makeSection(overrides: Partial<WireSection> = {}): WireSection {
  return {
    domain: 'movies',
    moduleId: 'media',
    hits: [makeHit()],
    icon: 'Film',
    color: 'purple',
    isContextSection: false,
    totalCount: 1,
    ...overrides,
  };
}

function mockFetchOnceWith(sections: WireSection[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ sections }),
      }) as unknown as Response
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function makeWrapper(initialPath: string): ({ children }: { children: ReactNode }) => ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppContextProvider>{children}</AppContextProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useSearchInputData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs the query + context to the orchestrator /search endpoint', async () => {
    const fetchMock = mockFetchOnceWith([makeSection()]);
    const { result } = renderHook(() => useSearchInputData({ query: 'matrix', isOpen: true }), {
      wrapper: makeWrapper('/media'),
    });

    await waitFor(() => expect(result.current.sections).toHaveLength(1));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/orchestrator-api/search');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      query: { text: 'matrix' },
      context: { app: 'media', page: null },
    });
  });

  it('maps the orchestrator sections onto the renderer shape', async () => {
    mockFetchOnceWith([makeSection({ domain: 'tv-shows', color: 'blue' })]);
    const { result } = renderHook(() => useSearchInputData({ query: 'matrix', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });

    await waitFor(() => expect(result.current.sections).toHaveLength(1));
    const [section] = result.current.sections;
    expect(section?.domain).toBe('tv-shows');
    expect(section?.label).toBe('Tv Shows');
    expect(section?.color).toBe('blue');
    expect(section?.hits.map((h) => h.uri)).toEqual(['pops:media/movie/1']);
  });

  it('filters out sections owned by a module that is not installed', async () => {
    mockFetchOnceWith([
      makeSection({ domain: 'movies', moduleId: 'media' }),
      makeSection({
        domain: 'ghosts',
        moduleId: 'not-a-real-module',
        hits: [makeHit({ uri: 'g/1' })],
      }),
    ]);
    const { result } = renderHook(() => useSearchInputData({ query: 'x', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });

    await waitFor(() => expect(result.current.sections).toHaveLength(1));
    expect(result.current.sections[0]?.domain).toBe('movies');
  });

  it('clamps totalCount to the returned hit count so the "Show more" affordance is suppressed', async () => {
    // The orchestrator reports a higher pre-cap total but exposes no pagination,
    // so the hook must never advertise more hits than it can actually render.
    mockFetchOnceWith([makeSection({ totalCount: 42, hits: [makeHit()] })]);
    const { result } = renderHook(() => useSearchInputData({ query: 'x', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });

    await waitFor(() => expect(result.current.sections).toHaveLength(1));
    const [section] = result.current.sections;
    expect(section?.totalCount).toBe(section?.hits.length);
    expect(section?.totalCount).toBe(1);
  });

  it('exposes orderedUris flattened across sorted sections', async () => {
    mockFetchOnceWith([
      makeSection({
        domain: 'movies',
        hits: [makeHit({ uri: 'm/1' }), makeHit({ uri: 'm/2', score: 0.5 })],
        totalCount: 2,
      }),
    ]);
    const { result } = renderHook(() => useSearchInputData({ query: 'x', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });

    await waitFor(() => expect(result.current.orderedUris).toHaveLength(2));
    expect(result.current.orderedUris).toEqual(['m/1', 'm/2']);
  });

  it('does not fetch when the panel is closed', async () => {
    const fetchMock = mockFetchOnceWith([makeSection()]);
    renderHook(() => useSearchInputData({ query: 'matrix', isOpen: false }), {
      wrapper: makeWrapper('/'),
    });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not fetch for an empty query', async () => {
    const fetchMock = mockFetchOnceWith([makeSection()]);
    renderHook(() => useSearchInputData({ query: '', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handleShowMore is a no-op that resolves without issuing another fetch', async () => {
    const fetchMock = mockFetchOnceWith([makeSection({ totalCount: 9 })]);
    const { result } = renderHook(() => useSearchInputData({ query: 'x', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });

    await waitFor(() => expect(result.current.sections).toHaveLength(1));
    const callsBefore = fetchMock.mock.calls.length;
    await expect(result.current.handleShowMore('movies')).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('yields no sections when the response body is malformed', async () => {
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ sections: 'not-an-array' }),
        }) as unknown as Response
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSearchInputData({ query: 'x', isOpen: true }), {
      wrapper: makeWrapper('/'),
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.sections).toEqual([]);
  });
});
