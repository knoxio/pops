import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
process.env['POPS_API_KEY'] = 'sa_test';

const { attachServerCleanup } = await import('./index.js');

describe('attachServerCleanup', () => {
  it('calls server.close() exactly once when res emits "close"', async () => {
    const res = new EventEmitter();
    const close = vi.fn().mockResolvedValue(undefined);
    attachServerCleanup(res, { close });

    res.emit('close');
    // microtask drain — the awaited promise resolves on the next tick
    await new Promise<void>((r) => setImmediate(r));

    expect(close).toHaveBeenCalledTimes(1);
  });

  // Regression: an `await` inside the event listener used to discard the
  // returned promise, so a rejection here would crash the process with an
  // unhandled rejection. The .catch must absorb it.
  it('logs and swallows rejected server.close()', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = new EventEmitter();
    const boom = new Error('close exploded');
    const close = vi.fn().mockRejectedValue(boom);
    attachServerCleanup(res, { close });

    res.emit('close');
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));

    expect(close).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith('[pops-mcp] server.close() failed:', boom);
    errSpy.mockRestore();
  });
});
