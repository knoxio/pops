/**
 * Pillar registry HTTP surface (ADR-026 pre-flight P2).
 *
 * Exposes the cross-pillar endpoints the rest of the platform depends on:
 *
 *   POST /uri/resolve  — dispatcher. Body: `{ uri }`. Returns a typed
 *                        `UriResolverResult` JSON. Pillar consumers and the
 *                        AI overlay both call this; never throws.
 *   GET  /pillars      — registry snapshot. Returns the parsed
 *                        `POPS_PILLARS` entries plus a synthetic `core` entry
 *                        for self-discovery. Drives `pops-shell` pillar boot
 *                        (P3) and ops dashboards.
 *
 * The `/health` endpoint stays where it is (routes/health.ts) and is
 * extended in-place with the pillar-shaped fields.
 *
 * These routes live outside the tRPC router because:
 *   1. Pillars call each other over plain HTTP, not tRPC — adding a tRPC
 *      client dependency to every pillar would defeat the isolation goal.
 *   2. ADR-026's contract specifies POST /uri/resolve, not tRPC.
 *   3. The existing `core.uri.resolve` tRPC procedure stays as-is: the
 *      React shell still talks tRPC; only inter-pillar traffic uses raw HTTP.
 */

import { type Router as ExpressRouter, Router } from 'express';

import { dispatchUri, type DispatchUriOptions } from '../modules/core/pillars/dispatcher.js';
import { probeAllPillars } from '../modules/core/pillars/health-probe.js';
import { getPillarRegistry } from '../modules/core/pillars/registry.js';
import { getUriRegistry } from '../modules/core/uri/registry.js';
import { readInstalledModules } from '../modules/env-modules.js';

import type { PillarRegistryEntry, UriResolverResult } from '@pops/types';

const router: ExpressRouter = Router();

/**
 * Build the dispatcher's `ResolveUriOptions` from current process state.
 *
 * Factored out so tests can call `dispatchUri` directly with stub registries,
 * while the HTTP route uses the live in-process module registry.
 */
function buildResolveOptions(): DispatchUriOptions {
  const installed = readInstalledModules();
  const installedSet = new Set<string>(['core', ...installed.apps, ...installed.overlays]);
  return {
    registry: getUriRegistry(),
    isInstalled: (moduleId: string) => installedSet.has(moduleId),
  };
}

router.post('/uri/resolve', async (req, res) => {
  const body = req.body as { uri?: unknown } | undefined;
  const uri = body && typeof body.uri === 'string' ? body.uri : undefined;
  if (!uri) {
    const malformed: UriResolverResult = {
      kind: 'malformed',
      uri: typeof body?.uri === 'string' ? body.uri : '',
      reason: 'request body must be { uri: string }',
    };
    res.status(400).json(malformed);
    return;
  }

  const result = await dispatchUri(uri, buildResolveOptions());
  res.json(result);
});

router.get('/pillars', (_req, res) => {
  res.json({ pillars: listPillarsWithSelf() });
});

/**
 * Aggregated cross-pillar health probe (ADR-026 P3).
 *
 * Fans out `GET {baseUrl}/health` against every remote pillar in the registry
 * and returns a map of pillar id to health. The self-pillar is short-circuited
 * to `'healthy'` — if this handler is serving requests, core is up.
 *
 * The shell calls this once at boot and uses the result to gate per-pillar
 * routes via a `PillarUnavailable` placeholder. Container-network base URLs
 * are not reachable from the browser, which is why the probe runs server-side.
 */
router.get('/pillars/health', async (_req, res) => {
  const pillars = listPillarsWithSelf();
  const health = await probeAllPillars(pillars);
  res.json({ health });
});

function listPillarsWithSelf(): readonly PillarRegistryEntry[] {
  // The /pillars view always includes a `core` self-entry so a consumer can
  // iterate the registry without special-casing the dispatcher host. The
  // `baseUrl` of the self-entry is always empty — pillars talking to
  // themselves use the in-process resolver, not HTTP — and a deployer's
  // misconfigured `core:http://...` entry is normalised the same way so the
  // contract holds regardless of how `POPS_PILLARS` is set.
  const remote = getPillarRegistry();
  const self: PillarRegistryEntry = { id: 'core', baseUrl: '' };
  if (remote.some((p) => p.id === 'core')) {
    return remote.map((p) => (p.id === 'core' ? self : p));
  }
  return [self, ...remote];
}

export default router;
