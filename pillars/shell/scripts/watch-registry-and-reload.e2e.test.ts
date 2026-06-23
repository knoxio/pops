/**
 * End-to-end integration test for the PRD-228 US-03 watcher.
 *
 * Spins up the SHELL watcher (`watchRegistryAndReload`) against a fake
 * in-process SSE registry, fires `pillar.registered` + `pillar.deregistered`
 * frames, and asserts that:
 *
 *   - `regenerate` ran twice (once per lifecycle transition).
 *   - The reload command ran twice (gating passed both times).
 *   - The validate command (`nginx -t -c ...`) ran twice.
 *   - On a forced validate failure, the reload is skipped and the
 *     `nginx_generator_last_error_at` health surface flips to degraded.
 *   - On the next successful cycle, the error clears.
 *
 * Mirrors the in-process e2e in `pillars/registry` US-05 — same shape,
 * but exercised THROUGH the watcher rather than against the registry's
 * mutation handlers directly.
 */
import { createServer, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNginxGeneratorHealth, type NginxGeneratorHealth } from './nginx-generator-health.ts';
import {
  readConfig,
  watchRegistryAndReload,
  type WatcherConfig,
} from './watch-registry-and-reload.ts';

import type { AddressInfo } from 'node:net';

interface FakeSseServer {
  readonly url: string;
  readonly emit: (event: string, data: string) => void;
  readonly endStream: () => void;
  readonly close: () => Promise<void>;
  readonly waitForSubscriber: () => Promise<void>;
}

async function startFakeSseRegistry(): Promise<FakeSseServer> {
  const subscribers: Array<{
    write: (chunk: string) => void;
    end: () => void;
  }> = [];
  const subscriberWaiters: Array<() => void> = [];

  const server: Server = createServer((req, res) => {
    if (req.url !== '/registry/subscribe' || req.method !== 'GET') {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-store');
    res.flushHeaders?.();
    res.write('event: pillar.snapshot\ndata: {"pillars":[]}\n\n');
    subscribers.push({
      write: (chunk: string) => res.write(chunk),
      end: () => res.end(),
    });
    const waiters = subscriberWaiters.splice(0);
    for (const w of waiters) w();
  });

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => resolvePromise());
  });
  const addr = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${addr.port}`;

  return {
    url,
    emit: (event, data) => {
      const chunk = `event: ${event}\ndata: ${data}\n\n`;
      for (const sub of subscribers) sub.write(chunk);
    },
    endStream: () => {
      for (const sub of subscribers) sub.end();
      subscribers.length = 0;
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        for (const sub of subscribers) sub.end();
        subscribers.length = 0;
        server.close((err) => {
          if (err !== undefined && err !== null) rejectClose(err);
          else resolveClose();
        });
      }),
    waitForSubscriber: () => {
      if (subscribers.length > 0) return Promise.resolve();
      return new Promise<void>((resolveWait) => {
        subscriberWaiters.push(resolveWait);
      });
    },
  };
}

interface ExecRecorder {
  readonly calls: string[];
  readonly exec: (cmd: string) => Promise<void>;
  setFailingCmd: (substring: string | null) => void;
}

function createExecRecorder(): ExecRecorder {
  const calls: string[] = [];
  let failing: string | null = null;
  return {
    calls,
    exec: async (cmd) => {
      calls.push(cmd);
      if (failing !== null && cmd.includes(failing)) {
        throw new Error(`stub exec: forced failure for cmd containing '${failing}'`);
      }
    },
    setFailingCmd: (substring) => {
      failing = substring;
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: predicate did not become true within timeout');
    }
    await new Promise((r) => setTimeout(r, 5));
  }
}

interface Harness {
  readonly registry: FakeSseServer;
  readonly exec: ExecRecorder;
  readonly health: NginxGeneratorHealth;
  readonly regenCalls: string[];
  readonly run: Promise<void>;
  readonly controller: AbortController;
  readonly config: WatcherConfig;
}

async function startHarness(overrides?: Partial<NodeJS.ProcessEnv>): Promise<Harness> {
  const registry = await startFakeSseRegistry();
  const exec = createExecRecorder();
  const health = createNginxGeneratorHealth();
  const regenCalls: string[] = [];

  const config = readConfig({
    CORE_REGISTRY_URL: registry.url,
    POPS_NGINX_OUTPUT: '/tmp/pops-shell-e2e.conf',
    POPS_NGINX_RELOAD_CMD: 'nginx -s reload',
    POPS_NGINX_DEBOUNCE_MS: '10',
    POPS_NGINX_BACKOFF_MS: '50',
    ...overrides,
  });

  const controller = new AbortController();
  const run = watchRegistryAndReload(
    config,
    controller.signal,
    { info: () => undefined, error: () => undefined },
    {
      health,
      execImpl: exec.exec,
      regenerateImpl: async (cfg) => {
        regenCalls.push(cfg.registryUrl);
      },
    }
  );

  return { registry, exec, health, regenCalls, run, controller, config };
}

async function teardown(h: Harness): Promise<void> {
  h.controller.abort();
  await h.registry.close();
  await h.run;
}

describe('watchRegistryAndReload — end-to-end through the SHELL watcher', () => {
  let harness: Harness | null = null;

  beforeEach(() => {
    harness = null;
  });

  afterEach(async () => {
    if (harness !== null) await teardown(harness);
  });

  it('fires regen + validate + reload on pillar.registered and again on pillar.deregistered', async () => {
    harness = await startHarness();
    const h = harness;
    await h.registry.waitForSubscriber();

    h.registry.emit('pillar.registered', '{"pillarId":"externalDrop"}');
    await waitFor(() => h.regenCalls.length >= 1 && h.exec.calls.length >= 2);

    expect(h.regenCalls.length).toBe(1);
    expect(h.exec.calls.some((c) => c.startsWith('nginx -t'))).toBe(true);
    expect(h.exec.calls.filter((c) => c === 'nginx -s reload').length).toBe(1);

    const reloadsAfterRegister = h.exec.calls.filter((c) => c === 'nginx -s reload').length;
    const validatesAfterRegister = h.exec.calls.filter((c) => c.startsWith('nginx -t')).length;
    expect(reloadsAfterRegister).toBe(1);
    expect(validatesAfterRegister).toBe(1);

    h.registry.emit('pillar.deregistered', '{"pillarId":"externalDrop"}');
    await waitFor(() => h.regenCalls.length >= 2 && h.exec.calls.length >= 4);

    expect(h.regenCalls.length).toBe(2);
    expect(h.exec.calls.filter((c) => c === 'nginx -s reload').length).toBe(2);
    expect(h.exec.calls.filter((c) => c.startsWith('nginx -t')).length).toBe(2);

    expect(h.health.snapshot().status).toBe('ok');
    expect(h.health.snapshot().nginx_generator_last_error_at).toBeNull();
  });

  it('skips reload + flips health to degraded when nginx -t fails, then recovers on the next clean cycle', async () => {
    harness = await startHarness();
    const h = harness;
    await h.registry.waitForSubscriber();
    h.exec.setFailingCmd('nginx -t');

    h.registry.emit('pillar.registered', '{"pillarId":"flaky"}');
    await waitFor(
      () => h.regenCalls.length >= 1 && h.exec.calls.some((c) => c.startsWith('nginx -t'))
    );

    expect(h.regenCalls.length).toBe(1);
    expect(h.exec.calls.filter((c) => c === 'nginx -s reload').length).toBe(0);

    await waitFor(() => h.health.snapshot().status === 'degraded');
    const degradedSnap = h.health.snapshot();
    expect(degradedSnap.status).toBe('degraded');
    expect(degradedSnap.lastError?.stage).toBe('validate');
    expect(degradedSnap.nginx_generator_last_error_at).not.toBeNull();

    h.exec.setFailingCmd(null);
    h.registry.emit('pillar.health-changed', '{"pillarId":"flaky"}');
    await waitFor(() => h.exec.calls.filter((c) => c === 'nginx -s reload').length >= 1);
    await waitFor(() => h.health.snapshot().status === 'ok');

    const recoveredSnap = h.health.snapshot();
    expect(recoveredSnap.status).toBe('ok');
    expect(recoveredSnap.lastError).toBeNull();
    expect(recoveredSnap.nginx_generator_last_error_at).toBeNull();
    expect(recoveredSnap.lastSuccessAt).not.toBeNull();
  });

  it('ignores the initial pillar.snapshot frame — no regen on connect', async () => {
    harness = await startHarness();
    const h = harness;
    await new Promise((r) => setTimeout(r, 50));
    expect(h.regenCalls.length).toBe(0);
    expect(h.exec.calls.length).toBe(0);
  });

  it('does not invoke validate when POPS_NGINX_CONFIG_TEST_CMD is explicitly empty', async () => {
    harness = await startHarness({ POPS_NGINX_CONFIG_TEST_CMD: '' });
    const h = harness;
    await h.registry.waitForSubscriber();

    h.registry.emit('pillar.registered', '{"pillarId":"noGate"}');
    await waitFor(() => h.regenCalls.length >= 1 && h.exec.calls.length >= 1);

    expect(h.exec.calls).toEqual(['nginx -s reload']);
  });
});
