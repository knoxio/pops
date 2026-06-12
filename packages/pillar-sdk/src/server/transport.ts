import type { DiscoveredPillar, DiscoveryTransport } from '../client/index.js';

/**
 * Wraps an existing discovery transport and rewrites the `baseUrl` of
 * each discovered pillar against the supplied overrides map. Used by the
 * server SDK to redirect in-cluster calls at internal Docker hostnames
 * (or `localhost` in dev) without round-tripping through nginx.
 *
 * The override map is matched by `pillarId`. Pillars not in the map are
 * passed through untouched, so partial maps are fine — e.g. override
 * `finance` for a local debugging session while every other pillar still
 * goes to its registry-advertised hostname.
 */
export class InternalBaseUrlTransport implements DiscoveryTransport {
  constructor(
    private readonly inner: DiscoveryTransport,
    private readonly overrides: Readonly<Record<string, string>>
  ) {}

  async fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    const snapshot = await this.inner.fetchSnapshot();
    if (Object.keys(this.overrides).length === 0) return snapshot;
    return snapshot.map((entry) => {
      const override = this.overrides[entry.pillarId];
      if (override === undefined) return entry;
      return { ...entry, baseUrl: override };
    });
  }
}
