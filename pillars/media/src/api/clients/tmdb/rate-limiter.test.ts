/**
 * Token bucket rate limiter tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TokenBucketRateLimiter } from './rate-limiter.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('TokenBucketRateLimiter', () => {
  it('allows immediate acquisition when tokens are available', async () => {
    const limiter = new TokenBucketRateLimiter(5, 1);

    // Should resolve immediately for first 5 calls
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    limiter.destroy();
  });

  it('exhausts bucket after capacity is reached', async () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(3, 1);

    // Drain all 3 tokens
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // The 4th call should not resolve immediately
    let resolved = false;
    const promise = limiter.acquire().then(() => {
      resolved = true;
    });

    // Give microtasks a chance to run
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    // After enough time for 1 token to refill (1 token / 1 per sec = 1000ms)
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(resolved).toBe(true);

    limiter.destroy();
  });

  it('refills tokens over time', async () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(2, 2); // 2 tokens/sec

    // Drain bucket
    await limiter.acquire();
    await limiter.acquire();

    // Wait 1 second — should refill 2 tokens
    await vi.advanceTimersByTimeAsync(1000);

    // Should be able to acquire 2 more immediately
    await limiter.acquire();
    await limiter.acquire();

    limiter.destroy();
  });

  it('does not exceed capacity on refill', async () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(3, 10); // Fast refill

    // Only drain 1 token
    await limiter.acquire();

    // Wait a long time
    await vi.advanceTimersByTimeAsync(5000);

    // Should still only have 3 tokens (capacity), not more
    // Drain all 3
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // 4th should wait
    let resolved = false;
    limiter.acquire().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    limiter.destroy();
  });

  it('processes queued waiters in FIFO order', async () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(1, 1);
    const order: number[] = [];

    // Drain the single token
    await limiter.acquire();

    // Queue 3 waiters
    limiter.acquire().then(() => order.push(1));
    limiter.acquire().then(() => order.push(2));
    limiter.acquire().then(() => order.push(3));

    // Advance enough for 3 tokens
    await vi.advanceTimersByTimeAsync(3000);

    expect(order).toEqual([1, 2, 3]);

    limiter.destroy();
  });

  it('works with TMDB-like settings (40 capacity, 4/sec refill)', async () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(40, 4);

    // Should drain all 40 immediately
    for (let i = 0; i < 40; i++) {
      await limiter.acquire();
    }

    // 41st should wait
    let resolved = false;
    limiter.acquire().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    // At 4 tokens/sec, one token takes 250ms
    await vi.advanceTimersByTimeAsync(250);
    expect(resolved).toBe(true);

    limiter.destroy();
  });

  it('destroy resolves pending waiters and clears timers', async () => {
    vi.useFakeTimers();
    const limiter = new TokenBucketRateLimiter(1, 1);

    await limiter.acquire();

    let resolved = false;
    limiter.acquire().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    limiter.destroy();

    // Give microtasks a chance
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });
});
