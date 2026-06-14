import { installedManifests } from './installed-modules.js';

/**
 * Backend module manifests — convenience wrapper around `installedManifests()`
 * (PRD-101 US-05) for cross-cutting aggregators that need the live module
 * manifests with their code-bearing slots attached (router, URI handler,
 * AI tools, …). Settings sections are resolved at each module's `index.ts`
 * via `discoverSettings()` + `findSettingsManifest()` from
 * `@pops/pillar-sdk/settings` (PRD-240 US-04) with the contract-package
 * descriptor as the local fallback; consumers just read `m.settings`.
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
