// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PillarSdkProvider } from '../provider.js';
import {
  applySubscriptionEvent,
  usePillarSubscriptionBridge,
  type SubscriptionConnect,
  type SubscriptionEvent,
  type SubscriptionSource,
} from '../subscription-bridge.js';

import type { ReactNode } from 'react';

interface FakeSource extends SubscriptionSource {
  emit: (event: SubscriptionEvent) => void;
  triggerClose: () => void;
  readonly closed: boolean;
  eventListenerCount: () => number;
}

function createFakeSource(): FakeSource {
  const eventListeners = new Set<(event: SubscriptionEvent) => void>();
  const closeListeners = new Set<(reason?: unknown) => void>();
  let closed = false;
  const fake: FakeSource = {
    close: () => {
      closed = true;
    },
    onClose: (listener) => {
      closeListeners.add(listener);
      return () => {
        closeListeners.delete(listener);
      };
    },
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
      };
    },
    emit: (event) => {
      for (const listener of eventListeners) listener(event);
    },
    triggerClose: () => {
      for (const listener of closeListeners) listener();
    },
    eventListenerCount: () => eventListeners.size,
    get closed() {
      return closed;
    },
  };
  return fake;
}

function entry(pillarId: string): Record<string, unknown> {
  return { pillarId, baseUrl: `http://${pillarId}` };
}

function payload(pillarId: string): Record<string, unknown> {
  return {
    event: 'whatever',
    pillarId,
    entry: entry(pillarId),
    emittedAt: '2026-06-12T00:00:00.000Z',
  };
}

function buildWrapper(): {
  wrapper: (props: { children: ReactNode }) => ReactNode;
  queryClient: QueryClient;
} {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, queryClient };
}

function seedQuery(client: QueryClient, queryKey: readonly unknown[], data: unknown): void {
  client.setQueryData(queryKey, data);
}

describe('applySubscriptionEvent (pure rules)', () => {
  it('pillar.registered invalidates every entry under the [pillarId] prefix', async () => {
    const client = new QueryClient();
    seedQuery(client, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);
    seedQuery(client, ['finance', 'budget', 'get', '{}'], { id: 'b' });
    seedQuery(client, ['media', 'movies', 'list', '{}'], []);

    applySubscriptionEvent(client, { event: 'pillar.registered', data: payload('finance') });

    await waitFor(() => {
      expect(client.getQueryState(['finance', 'wishlist', 'list', '{}'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['finance', 'budget', 'get', '{}'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['media', 'movies', 'list', '{}'])?.isInvalidated).toBe(false);
    });
  });

  it('pillar.deregistered invalidates the [pillarId] prefix', async () => {
    const client = new QueryClient();
    seedQuery(client, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);
    seedQuery(client, ['media', 'movies', 'list', '{}'], []);

    applySubscriptionEvent(client, { event: 'pillar.deregistered', data: payload('finance') });

    await waitFor(() => {
      expect(client.getQueryState(['finance', 'wishlist', 'list', '{}'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['media', 'movies', 'list', '{}'])?.isInvalidated).toBe(false);
    });
  });

  it('pillar.health-changed invalidates the [pillarId] prefix', async () => {
    const client = new QueryClient();
    seedQuery(client, ['finance', 'budget', 'get', '{}'], { id: 'b' });

    applySubscriptionEvent(client, { event: 'pillar.health-changed', data: payload('finance') });

    await waitFor(() => {
      expect(client.getQueryState(['finance', 'budget', 'get', '{}'])?.isInvalidated).toBe(true);
    });
  });

  it('pillar.snapshot invalidates every cache entry whose first segment matches a pillar in the snapshot', async () => {
    const client = new QueryClient();
    seedQuery(client, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);
    seedQuery(client, ['media', 'movies', 'list', '{}'], []);
    seedQuery(client, ['health', 'metrics', 'get', '{}'], { hr: 60 });

    applySubscriptionEvent(client, {
      event: 'pillar.snapshot',
      data: [entry('finance'), entry('media')],
    });

    await waitFor(() => {
      expect(client.getQueryState(['finance', 'wishlist', 'list', '{}'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['media', 'movies', 'list', '{}'])?.isInvalidated).toBe(true);
      expect(client.getQueryState(['health', 'metrics', 'get', '{}'])?.isInvalidated).toBe(false);
    });
  });

  it('ignores malformed payloads (missing pillarId / non-array snapshot)', async () => {
    const client = new QueryClient();
    seedQuery(client, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);

    applySubscriptionEvent(client, { event: 'pillar.registered', data: { entry: {} } });
    applySubscriptionEvent(client, { event: 'pillar.snapshot', data: 'oops' });

    expect(client.getQueryState(['finance', 'wishlist', 'list', '{}'])?.isInvalidated).toBe(false);
  });
});

describe('usePillarSubscriptionBridge', () => {
  it('invalidates the affected query keys when a register event arrives', async () => {
    const source = createFakeSource();
    const connect: SubscriptionConnect = () => source;
    const { wrapper, queryClient } = buildWrapper();

    seedQuery(queryClient, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);
    seedQuery(queryClient, ['media', 'movies', 'list', '{}'], []);

    renderHook(() => usePillarSubscriptionBridge({ connect }), { wrapper });

    await waitFor(() => expect(source.eventListenerCount()).toBeGreaterThan(0));

    act(() => {
      source.emit({ event: 'pillar.registered', data: payload('finance') });
    });

    await waitFor(() => {
      expect(queryClient.getQueryState(['finance', 'wishlist', 'list', '{}'])?.isInvalidated).toBe(
        true
      );
      expect(queryClient.getQueryState(['media', 'movies', 'list', '{}'])?.isInvalidated).toBe(
        false
      );
    });
  });

  it('invalidates on a deregister event', async () => {
    const source = createFakeSource();
    const connect: SubscriptionConnect = () => source;
    const { wrapper, queryClient } = buildWrapper();

    seedQuery(queryClient, ['finance', 'budget', 'get', '{}'], { id: 'b' });

    renderHook(() => usePillarSubscriptionBridge({ connect }), { wrapper });
    await waitFor(() => expect(source.eventListenerCount()).toBeGreaterThan(0));

    act(() => {
      source.emit({ event: 'pillar.deregistered', data: payload('finance') });
    });

    await waitFor(() => {
      expect(queryClient.getQueryState(['finance', 'budget', 'get', '{}'])?.isInvalidated).toBe(
        true
      );
    });
  });

  it('stops dispatching invalidations after the hook unmounts (disconnect)', async () => {
    const source = createFakeSource();
    const connect: SubscriptionConnect = () => source;
    const { wrapper, queryClient } = buildWrapper();

    seedQuery(queryClient, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);

    const { unmount } = renderHook(() => usePillarSubscriptionBridge({ connect }), { wrapper });
    await waitFor(() => expect(source.eventListenerCount()).toBeGreaterThan(0));

    unmount();
    expect(source.closed).toBe(true);

    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    act(() => {
      source.emit({ event: 'pillar.registered', data: payload('finance') });
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not subscribe when enabled=false', async () => {
    const source = createFakeSource();
    let connectCalls = 0;
    const connect: SubscriptionConnect = () => {
      connectCalls += 1;
      return source;
    };
    const { wrapper } = buildWrapper();

    renderHook(() => usePillarSubscriptionBridge({ connect, enabled: false }), { wrapper });
    await Promise.resolve();
    expect(connectCalls).toBe(0);
    expect(source.eventListenerCount()).toBe(0);
  });

  it('PillarSdkProvider subscribe prop mounts the bridge', async () => {
    const source = createFakeSource();
    const connect: SubscriptionConnect = () => source;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    seedQuery(queryClient, ['finance', 'wishlist', 'list', '{}'], [{ id: 'wish-1' }]);

    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <PillarSdkProvider queryClient={queryClient} subscribe subscriptionOptions={{ connect }}>
        {children}
      </PillarSdkProvider>
    );

    renderHook(() => null, { wrapper });
    await waitFor(() => expect(source.eventListenerCount()).toBeGreaterThan(0));

    act(() => {
      source.emit({ event: 'pillar.registered', data: payload('finance') });
    });

    await waitFor(() => {
      expect(queryClient.getQueryState(['finance', 'wishlist', 'list', '{}'])?.isInvalidated).toBe(
        true
      );
    });
  });

  it('PillarSdkProvider does not mount the bridge by default', async () => {
    const source = createFakeSource();
    let connectCalls = 0;
    const connect: SubscriptionConnect = () => {
      connectCalls += 1;
      return source;
    };
    const queryClient = new QueryClient();

    const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
      <PillarSdkProvider queryClient={queryClient} subscriptionOptions={{ connect }}>
        {children}
      </PillarSdkProvider>
    );

    renderHook(() => null, { wrapper });
    await Promise.resolve();
    expect(connectCalls).toBe(0);
  });
});
