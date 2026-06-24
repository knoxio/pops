import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createReloadHandler,
  isWatchedEvent,
  WATCHED_EVENTS,
  type ReloadErrorEvent,
  type ReloadLogger,
} from './nginx-event-reload.ts';

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createSilentLogger(): { logger: ReloadLogger; infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  return {
    logger: {
      info: (msg) => infos.push(msg),
      error: (msg) => errors.push(msg),
    },
    infos,
    errors,
  };
}

describe('isWatchedEvent', () => {
  it.each(WATCHED_EVENTS)('returns true for watched event %s', (name) => {
    expect(isWatchedEvent(name)).toBe(true);
  });

  it('returns false for the snapshot event', () => {
    expect(isWatchedEvent('pillar.snapshot')).toBe(false);
  });

  it('returns false for unrelated events', () => {
    expect(isWatchedEvent('message')).toBe(false);
    expect(isWatchedEvent('')).toBe(false);
  });
});

describe('createReloadHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a burst of triggers into one regen + reload run', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 100 });

    handler.trigger('pillar.registered');
    handler.trigger('pillar.registered');
    handler.trigger('pillar.health-changed');

    expect(regenerate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    await handler.flush();

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not start a run until the debounce window closes', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 250 });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(100);
    handler.trigger('pillar.deregistered');
    await vi.advanceTimersByTimeAsync(100);
    handler.trigger('pillar.health-changed');
    await vi.advanceTimersByTimeAsync(100);

    expect(regenerate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(250);
    await handler.flush();

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('runs regen then reload in order', async () => {
    const calls: string[] = [];
    const regenerate = vi.fn(async () => {
      calls.push('regen');
    });
    const reload = vi.fn(async () => {
      calls.push('reload');
    });
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 10 });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(calls).toEqual(['regen', 'reload']);
  });

  it('skips reload when regenerate rejects but stays alive for the next event', async () => {
    const regenerate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const { logger, errors } = createSilentLogger();
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 10, logger });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(reload).not.toHaveBeenCalled();
    expect(errors.some((e) => e.includes('regenerate failed'))).toBe(true);

    handler.trigger('pillar.deregistered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(regenerate).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('logs but does not throw when reload rejects', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockRejectedValue(new Error('nginx -t failed'));
    const { logger, errors } = createSilentLogger();
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 10, logger });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(errors.some((e) => e.includes('reload failed'))).toBe(true);
  });

  it('queues a second run when triggers arrive mid-regen', async () => {
    const regenGate = deferred();
    let firstRun = true;
    const regenerate = vi.fn(async () => {
      if (firstRun) {
        firstRun = false;
        await regenGate.promise;
      }
    });
    const reload = vi.fn().mockResolvedValue(undefined);
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 10 });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    expect(regenerate).toHaveBeenCalledTimes(1);

    handler.trigger('pillar.deregistered');
    await vi.advanceTimersByTimeAsync(20);

    regenGate.resolve();
    await vi.advanceTimersByTimeAsync(20);
    await handler.flush();

    expect(regenerate).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('stop() drops a pending run and rejects further triggers', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 100 });

    handler.trigger('pillar.registered');
    handler.stop();
    handler.trigger('pillar.deregistered');
    await vi.advanceTimersByTimeAsync(500);
    await handler.flush();

    expect(regenerate).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('passes the event summary into the info log', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const { logger, infos } = createSilentLogger();
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 10, logger });

    handler.trigger('pillar.registered');
    handler.trigger('pillar.health-changed');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    const triggerLine = infos.find((l) => l.includes('regen triggered'));
    expect(triggerLine).toBeDefined();
    expect(triggerLine).toContain('pillar.registered');
    expect(triggerLine).toContain('pillar.health-changed');
  });

  it('runs validateConfig between regenerate and reload', async () => {
    const calls: string[] = [];
    const regenerate = vi.fn(async () => {
      calls.push('regen');
    });
    const validateConfig = vi.fn(async () => {
      calls.push('validate');
    });
    const reload = vi.fn(async () => {
      calls.push('reload');
    });
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(calls).toEqual(['regen', 'validate', 'reload']);
  });

  it('skips reload when validateConfig rejects (nginx -t failed)', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const validateConfig = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('nginx: [emerg] invalid number of arguments'));
    const reload = vi.fn().mockResolvedValue(undefined);
    const { logger, errors } = createSilentLogger();
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
      logger,
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(validateConfig).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(errors.some((e) => e.includes('nginx -t validation failed'))).toBe(true);
  });

  it('emits onError with stage=validate when validateConfig rejects', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const validateConfig = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('bad conf'));
    const reload = vi.fn().mockResolvedValue(undefined);
    const errors: ReloadErrorEvent[] = [];
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
      onError: (e) => errors.push(e),
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.stage).toBe('validate');
    expect(errors[0]?.message).toBe('bad conf');
    expect(errors[0]?.at).toBeInstanceOf(Date);
  });

  it('emits onError with stage=regenerate when regenerate rejects', async () => {
    const regenerate = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('snapshot fetch failed'));
    const validateConfig = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const errors: ReloadErrorEvent[] = [];
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
      onError: (e) => errors.push(e),
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.stage).toBe('regenerate');
    expect(validateConfig).not.toHaveBeenCalled();
  });

  it('emits onError with stage=reload when reload rejects', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const validateConfig = vi.fn().mockResolvedValue(undefined);
    const reload = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error('SIGHUP target missing'));
    const errors: ReloadErrorEvent[] = [];
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
      onError: (e) => errors.push(e),
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.stage).toBe('reload');
  });

  it('fires onSuccess only after the full regen + validate + reload cycle passes', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const validateConfig = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
      onSuccess,
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it('does not fire onSuccess when validateConfig rejects', async () => {
    const regenerate = vi.fn().mockResolvedValue(undefined);
    const validateConfig = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('bad'));
    const reload = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const handler = createReloadHandler({
      regenerate,
      validateConfig,
      reload,
      debounceMs: 10,
      onSuccess,
    });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('runs regen then reload with no validate gate when validateConfig is omitted', async () => {
    const calls: string[] = [];
    const regenerate = vi.fn(async () => {
      calls.push('regen');
    });
    const reload = vi.fn(async () => {
      calls.push('reload');
    });
    const handler = createReloadHandler({ regenerate, reload, debounceMs: 10 });

    handler.trigger('pillar.registered');
    await vi.advanceTimersByTimeAsync(10);
    await handler.flush();

    expect(calls).toEqual(['regen', 'reload']);
  });
});
