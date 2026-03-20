/**
 * Generic token bucket rate limiter.
 *
 * Bucket starts full at `capacity` tokens. Tokens refill at `refillRate`
 * per second. acquire() consumes one token — resolves immediately when
 * available, waits otherwise. Callers never see rate-limit errors.
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly waitQueue: Array<() => void> = [];
  private drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly capacity: number,
    private readonly refillRate: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** Consume one token. Resolves immediately if available, waits otherwise. */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
      this.scheduleDrain();
    });
  }

  /** Refill tokens based on elapsed time since last refill. */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    if (newTokens >= 1) {
      this.tokens = Math.min(this.capacity, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  /** Schedule a timer to drain the wait queue when tokens become available. */
  private scheduleDrain(): void {
    if (this.drainTimer !== null) return;

    const msPerToken = 1000 / this.refillRate;

    this.drainTimer = setTimeout(() => {
      this.drainTimer = null;
      this.refill();

      while (this.waitQueue.length > 0 && this.tokens >= 1) {
        this.tokens -= 1;
        const next = this.waitQueue.shift();
        if (next) next();
      }

      if (this.waitQueue.length > 0) {
        this.scheduleDrain();
      }
    }, msPerToken);
  }

  /** Clean up pending timers and resolve waiting callers. */
  destroy(): void {
    if (this.drainTimer !== null) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }
    while (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift();
      if (next) next();
    }
  }
}
