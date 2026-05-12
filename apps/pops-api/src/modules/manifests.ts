import { installedManifests } from './installed-modules.js';

/**
 * Backend module manifests — convenience wrapper around `installedManifests()`
 * (PRD-101 US-05) for cross-cutting aggregators that need the live module
 * manifests with their code-bearing slots attached (router, URI handler,
 * AI tools, …). Settings have moved to `@pops/module-registry`'s `MODULES`
 * constant (PRD-101 US-04 follow-up) — consumers read them directly via
 * `MODULES.flatMap(m => m.settings ?? [])`.
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
