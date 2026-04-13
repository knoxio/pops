import { afterEach, describe, expect, it, vi } from 'vitest';

import { TokenBucketRateLimiter } from './rate-limiter.js';

describe('TokenBucketRateLimiter', () => {
  let limiter: TokenBucketRateLimiter;

  afterEach(() => {
    limiter?.destroy();
    vi.useRealTimers();
  });

  it('allows immediate acquire when tokens are available', async () => {
    limiter = new TokenBucketRateLimiter(5, 1);

    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('allows multiple acquires up to capacity', async () => {
    limiter = new TokenBucketRateLimiter(3, 1);

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    // All three should resolve immediately (within capacity)
  });

  it('waits when tokens are exhausted', async () => {
    vi.useFakeTimers();
    limiter = new TokenBucketRateLimiter(1, 10); // 1 token, refills at 10/sec

    // Exhaust the single token
    await limiter.acquire();

    // Next acquire should queue
    let resolved = false;
    const promise = limiter.acquire().then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    // Advance time to allow refill (100ms = 1 token at 10/sec)
    await vi.advanceTimersByTimeAsync(150);

    await promise;
    expect(resolved).toBe(true);
  });

  it('refills tokens over time', async () => {
    limiter = new TokenBucketRateLimiter(3, 100); // fast refill for testing

    // Exhaust all tokens
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    // Wait for refill (30ms at 100/sec = 3 tokens)
    await new Promise((r) => setTimeout(r, 50));

    // Should be able to acquire again
    const start = Date.now();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('does not exceed capacity on refill', async () => {
    limiter = new TokenBucketRateLimiter(2, 100);

    // Wait to allow over-refill time
    await new Promise((r) => setTimeout(r, 50));

    // Should only allow 2 (capacity), not more
    await limiter.acquire();
    await limiter.acquire();

    // Third should wait
    vi.useFakeTimers();
    let resolved = false;
    const promise = limiter.acquire().then(() => {
      resolved = true;
    });
    // Give microtasks a chance
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    // Advance to get a refill
    await vi.advanceTimersByTimeAsync(100);
    await promise;
    expect(resolved).toBe(true);
  });

  it('queues multiple waiters and drains in order', async () => {
    vi.useFakeTimers();
    limiter = new TokenBucketRateLimiter(1, 10);

    await limiter.acquire();

    const order: number[] = [];
    const p1 = limiter.acquire().then(() => order.push(1));
    const p2 = limiter.acquire().then(() => order.push(2));

    // Advance enough for 2 tokens
    await vi.advanceTimersByTimeAsync(250);

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2]);
  });

  it('destroy resolves pending waiters', async () => {
    limiter = new TokenBucketRateLimiter(0, 1); // starts empty

    let resolved = false;
    const promise = limiter.acquire().then(() => {
      resolved = true;
    });

    limiter.destroy();
    await promise;
    expect(resolved).toBe(true);
  });

  it('supports configurable capacity and refill rate', () => {
    // Just verify construction doesn't throw for various configs
    const l1 = new TokenBucketRateLimiter(40, 4); // TMDB: 40 capacity, 4/sec
    const l2 = new TokenBucketRateLimiter(20, 2); // TheTVDB: 20 capacity, 2/sec
    l1.destroy();
    l2.destroy();
  });
});
