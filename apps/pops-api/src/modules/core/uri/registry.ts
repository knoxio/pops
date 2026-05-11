/**
 * URI registry view used by `core.uri.resolve` (PRD-101 US-08).
 *
 * Delegates to `getBackendManifests()` from `../../manifests.ts` (the
 * module-root aggregator landed in PRD-101 US-04) so this file doesn't reach
 * into individual domain modules — that would violate the
 * `no-cross-api-module-import` boundary rule. The aggregator is allowed to
 * know about every domain because it lives one level above any
 * `<domain>/index.ts`.
 */
import { getBackendManifests } from '../../manifests.js';

import type { ModuleManifest } from '@pops/types';

/** Backend manifests that declare a `uriHandler` for `core.uri.resolve`. */
export function getUriRegistry(): ReadonlyArray<ModuleManifest> {
  return getBackendManifests().filter((m) => m.uriHandler !== undefined);
}
