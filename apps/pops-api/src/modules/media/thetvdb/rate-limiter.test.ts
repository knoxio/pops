import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TokenBucketRateLimiter } from "../../../shared/rate-limiter.js";
import { getTvdbRateLimiter, setTvdbRateLimiter, fetchWithRetry } from "./rate-limiter.js";

describe("getTvdbRateLimiter", () => {
  afterEach(() => {
    setTvdbRateLimiter(null);
  });

  it("creates a singleton rate limiter", () => {
    const limiter = getTvdbRateLimiter();
    expect(limiter).toBeInstanceOf(TokenBucketRateLimiter);
    expect(getTvdbRateLimiter()).toBe(limiter);
  });

  it("setTvdbRateLimiter replaces the singleton", () => {
    const original = getTvdbRateLimiter();
    const custom = new TokenBucketRateLimiter(10, 1);
    setTvdbRateLimiter(custom);
    expect(getTvdbRateLimiter()).toBe(custom);
    expect(getTvdbRateLimiter()).not.toBe(original);
    custom.destroy();
    original.destroy();
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Use a generous limiter so token acquisition doesn't interfere
    setTvdbRateLimiter(new TokenBucketRateLimiter(100, 100));
  });

  afterEach(() => {
    const limiter = getTvdbRateLimiter();
    limiter.destroy();
    setTvdbRateLimiter(null);
    vi.useRealTimers();
  });

  it("returns response on success without retry", async () => {
    const response = new Response("ok", { status: 200 });
    const fn = vi.fn().mockResolvedValue(response);

    const result = await fetchWithRetry(fn);
    expect(result).toBe(response);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("returns non-429 error responses without retry", async () => {
    const response = new Response("not found", { status: 404 });
    const fn = vi.fn().mockResolvedValue(response);

    const result = await fetchWithRetry(fn);
    expect(result.status).toBe(404);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 with exponential backoff", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry(fn);

    // First call happens immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // After 1s backoff, second call happens
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    const result = await promise;
    expect(result.status).toBe(200);
  });

  it("retries up to 3 times on 429", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry(fn);

    // Initial call
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // 1s backoff → retry 1
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // 2s backoff → retry 2
    await vi.advanceTimersByTimeAsync(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    // 4s backoff → retry 3
    await vi.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result.status).toBe(200);
  });

  it("returns 429 response after max retries exhausted", async () => {
    const fn = vi.fn().mockResolvedValue(new Response("", { status: 429 }));

    const promise = fetchWithRetry(fn);

    // Initial + 3 retries = 4 calls total
    await vi.advanceTimersByTimeAsync(0); // initial
    await vi.advanceTimersByTimeAsync(1000); // retry 1
    await vi.advanceTimersByTimeAsync(2000); // retry 2
    await vi.advanceTimersByTimeAsync(4000); // retry 3

    const result = await promise;
    expect(result.status).toBe(429);
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  });

  it("uses exponential backoff delays (1s, 2s, 4s)", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry(fn);

    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // Not enough time for first retry
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(1);

    // Complete first backoff (1s total)
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(2);

    // Not enough for second retry (needs 2s)
    await vi.advanceTimersByTimeAsync(1500);
    expect(fn).toHaveBeenCalledTimes(2);

    // Complete second backoff (2s total)
    await vi.advanceTimersByTimeAsync(500);
    expect(fn).toHaveBeenCalledTimes(3);

    // Complete third backoff (4s)
    await vi.advanceTimersByTimeAsync(4000);
    expect(fn).toHaveBeenCalledTimes(4);

    const result = await promise;
    expect(result.status).toBe(200);
  });

  it("propagates fetch errors without retry", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("network error"));

    await expect(fetchWithRetry(fn)).rejects.toThrow("network error");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("acquires rate limiter token before each attempt", async () => {
    const mockLimiter = new TokenBucketRateLimiter(100, 100);
    const acquireSpy = vi.spyOn(mockLimiter, "acquire");
    setTvdbRateLimiter(mockLimiter);

    const fn = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const promise = fetchWithRetry(fn);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    // acquire called once per attempt (initial + 1 retry = 2)
    expect(acquireSpy).toHaveBeenCalledTimes(2);
    mockLimiter.destroy();
  });
});
