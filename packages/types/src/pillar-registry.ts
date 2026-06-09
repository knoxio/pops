/**
 * Pillar registry + cross-pillar health/URI dispatch contracts (ADR-026
 * pre-flight P2).
 *
 * ADR-026 splits POPS into per-domain "pillars" — each a self-contained
 * process with its own SQLite, HTTP API, and UI bundle. The registry is the
 * platform's view of which pillars exist in the current deployment and where
 * to reach them. Cross-pillar references travel via the `pops:{pillar}/...`
 * URI scheme and are routed by a single dispatcher that lives in `core`.
 *
 * These types live in `@pops/types` (not `@pops/core-contract`) because every
 * pillar imports them: a pillar's `-api` package implements the
 * `PillarHealth` shape; a pillar's `-ui` package consumes `PillarRegistryEntry`
 * from `/pillars`; the dispatcher in core consumes both.
 */

/**
 * A single pillar in the live deployment.
 *
 * `id` is the canonical pillar slug (`core`, `finance`, `media`, `inventory`,
 * `cerebrum`, `ai`, `food`, `lists`) and matches the first path segment of
 * `pops:{pillar}/{type}/{id}` URIs. `baseUrl` is the HTTP origin the
 * dispatcher uses for outbound calls — no trailing slash, no path suffix.
 *
 * The shape is intentionally minimal: version, status, and last-seen
 * timestamps are derived from `PillarHealth` probes rather than stored on
 * the entry. The roadmap's source of truth is the `POPS_PILLARS` env var,
 * and an entry that round-trips through that string is the goal.
 */
export interface PillarRegistryEntry {
  readonly id: string;
  readonly baseUrl: string;
}

/**
 * Response body returned by every pillar's `GET /health` endpoint.
 *
 * `ok: true` is a literal because the health endpoint MUST respond
 * `503 Service Unavailable` (or fail outright) rather than return `ok: false`
 * — the dispatcher treats any non-2xx, parse error, or timeout as the pillar
 * being unavailable. `pillar` echoes the pillar's own id so a misconfigured
 * `POPS_PILLARS` entry pointing the wrong service surfaces immediately.
 * `version` is the deployed build identifier (semver, git sha, or `dev`).
 */
export interface PillarHealth {
  readonly ok: true;
  readonly pillar: string;
  readonly version: string;
}
