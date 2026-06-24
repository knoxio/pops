import { EventEmitter } from 'node:events';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Snapshot before module-level mutation so the suite restores cleanly even
// when run alongside other tests in the same vitest worker.
const originalNodeEnv = process.env['NODE_ENV'];
const originalApiKey = process.env['POPS_API_KEY'];
process.env['NODE_ENV'] = 'test';
process.env['POPS_API_KEY'] = 'sa_test';

const { attachServerCleanup } = await import('./index.js');

afterAll(() => {
  if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = originalNodeEnv;
  if (originalApiKey === undefined) delete process.env['POPS_API_KEY'];
  else process.env['POPS_API_KEY'] = originalApiKey;
});

describe('attachServerCleanup', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('calls server.close() exactly once when res emits "close"', async () => {
    const res = new EventEmitter();
    const close = vi.fn().mockResolvedValue(undefined);
    attachServerCleanup(res, { close });

    res.emit('close');
    // microtask drain — the awaited promise resolves on the next tick
    await new Promise<void>((r) => setImmediate(r));

    expect(close).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
  });

  // A rejected server.close() must not escape the 'close' listener as an
  // unhandled rejection; the .catch in attachServerCleanup absorbs it.
  it('logs and swallows rejected server.close()', async () => {
    const res = new EventEmitter();
    const boom = new Error('close exploded');
    const close = vi.fn().mockRejectedValue(boom);
    attachServerCleanup(res, { close });

    res.emit('close');
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(close).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith('[pops-mcp] server.close() failed:', boom);
  });
});
