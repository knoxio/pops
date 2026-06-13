import { installedManifests } from './installed-modules.js';

/**
 * Backend module manifests — convenience wrapper around `installedManifests()`
 * (PRD-101 US-05) for cross-cutting aggregators that need the live module
 * manifests with their code-bearing slots attached (router, URI handler,
 * AI tools, …). Settings live on each module's `SettingsManifest` export
 * surfaced via `@pops/pillar-sdk/settings`; consumers that just need the
 * settings shape read it directly from there.
 */
import type { ModuleManifest } from '@pops/types';

/**
 * Resolve the live backend module manifest list. Delegates to
 * `installedManifests()` so the build-time `MODULES` install set and any
 * test-only override applied via `__setInstalledManifestsOverride` are
 * honoured uniformly across every cross-cutting aggregator.
 */
export function getBackendManifests(): readonly ModuleManifest[] {
  return installedManifests();
}
