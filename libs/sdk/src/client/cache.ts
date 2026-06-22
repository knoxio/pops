import type { DiscoveredPillar, DiscoveryTransport } from './discovery.js';

type CacheEntry = {
  pillars: ReadonlyMap<string, DiscoveredPillar>;
  fetchedAt: number;
};

/**
 * TTL'd memoizing wrapper around a `DiscoveryTransport`. One in-flight
 * fetch is shared across all concurrent callers; a second concurrent
 * `lookup()` joins the same promise rather than firing a parallel HTTP
 * request. Expired entries refetch lazily on the next call.
 *
 * Re-exported under `@pops/pillar-sdk/client` for tests and advanced
 * usage, but `pillar()` is the normal lifecycle owner.
 */
export class DiscoveryCache {
  private readonly transport: DiscoveryTransport;
  private readonly ttlMs: number;
  private readonly now: () => number;

  private entry: CacheEntry | null = null;
  private inFlight: Promise<CacheEntry> | null = null;

  hitCount = 0;
  missCount = 0;
  refreshCount = 0;

  constructor(options: { transport: DiscoveryTransport; ttlMs: number; now?: () => number }) {
    this.transport = options.transport;
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  async lookup(pillarId: string): Promise<DiscoveredPillar | undefined> {
    const snapshot = await this.snapshot();
    return snapshot.pillars.get(pillarId);
  }

  async snapshot(): Promise<CacheEntry> {
    const current = this.entry;
    if (current !== null && this.now() - current.fetchedAt < this.ttlMs) {
      this.hitCount += 1;
      return current;
    }

    if (this.inFlight !== null) return this.inFlight;

    this.missCount += 1;
    const refresh = (async () => {
      try {
        const pillars = await this.transport.fetchSnapshot();
        const next: CacheEntry = {
          pillars: new Map(pillars.map((p) => [p.pillarId, p])),
          fetchedAt: this.now(),
        };
        this.entry = next;
        this.refreshCount += 1;
        return next;
      } finally {
        this.inFlight = null;
      }
    })();
    this.inFlight = refresh;
    return refresh;
  }

  invalidate(): void {
    this.entry = null;
  }
}
