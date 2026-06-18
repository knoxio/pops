/**
 * URI registry view used by the core pillar's `/uri/resolve` dispatcher.
 *
 * In the monolith this aggregated every installed domain module's manifest
 * (`getBackendManifests()` -> `installed-modules.ts`) and filtered for those
 * declaring a `uriHandler`. The core pillar container hosts no domain modules
 * with a `uriHandler` — core is backend-only (`uri.types: []`), and every
 * other domain lives in its own pillar process. In-process resolution
 * therefore has nothing to dispatch to; cross-pillar URIs are routed by the
 * dispatcher's remote leg via the `POPS_PILLARS` registry (see
 * `../../pillars/dispatcher.ts`).
 *
 * Kept as a function (rather than an exported constant) so the surface
 * matches the monolith's `getUriRegistry()` and a future fold of a
 * core-owned `uriHandler` has an obvious home.
 */
import type { ModuleManifest } from '@pops/types';

/** Backend manifests in this container that declare a `uriHandler`. */
export function getUriRegistry(): ReadonlyArray<ModuleManifest> {
  return [];
}
