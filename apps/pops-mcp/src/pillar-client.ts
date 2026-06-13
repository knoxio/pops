/**
 * Server-SDK wiring for the MCP tool layer.
 *
 * Every tool file imports `getPillar()` from here rather than calling
 * `pillar()` from `@pops/pillar-sdk/server` directly so the
 * `configureServerSdk(...)` call lands once, at module load. The MCP
 * binary historically authenticated with `POPS_API_KEY`; the pillar SDK
 * looks for `POPS_INTERNAL_API_KEY`. We read whichever is set and route
 * the value into the SDK explicitly.
 *
 * Tool files type their handle with their pillar's `AppRouter` so the
 * proxy is fully typed end-to-end:
 *
 *     import type { AppRouter as InventoryAppRouter } from '@pops/inventory-api/router';
 *     const inventory = getPillar<InventoryAppRouter>('inventory');
 *     await inventory.inventory.locations.list();
 *
 * The `internalBaseUrls` map collapses registry discovery for the
 * Docker-internal hostnames; this lets the canary tool files work even
 * when the registry advertises hostnames that differ from the local
 * Docker network.
 */
import { configureServerSdk, pillar } from '@pops/pillar-sdk/server';

import type { PillarHandle } from '@pops/pillar-sdk/server';

const INTERNAL_BASE_URLS: Readonly<Record<string, string>> = {
  inventory: process.env['POPS_INVENTORY_API_URL'] ?? 'http://inventory-api:3003',
  finance: process.env['POPS_FINANCE_API_URL'] ?? 'http://finance-api:3004',
  core: process.env['POPS_CORE_API_URL'] ?? 'http://core-api:3001',
  media: process.env['POPS_MEDIA_API_URL'] ?? 'http://media-api:3005',
  cerebrum: process.env['POPS_CEREBRUM_API_URL'] ?? 'http://cerebrum-api:3006',
};

function resolveApiKey(): string | undefined {
  const explicit = process.env['POPS_INTERNAL_API_KEY'];
  if (explicit && explicit.length > 0) return explicit;
  const legacy = process.env['POPS_API_KEY'];
  if (legacy && legacy.length > 0) return legacy;
  return undefined;
}

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const apiKey = resolveApiKey();
  if (apiKey === undefined) {
    throw new Error(
      '[pops-mcp] no service-account key in environment: set POPS_INTERNAL_API_KEY (or legacy POPS_API_KEY) before calling pillar tools.'
    );
  }
  const registryUrl = process.env['POPS_REGISTRY_URL'];
  configureServerSdk({
    apiKey,
    internalBaseUrls: INTERNAL_BASE_URLS,
    ...(registryUrl !== undefined ? { registry: { registryUrl } } : {}),
  });
  configured = true;
}

/**
 * Get a typed pillar handle for the given pillar ID. Idempotent — the
 * underlying SDK memoises per-pillar handles, so repeated calls are
 * cheap and share their discovery cache.
 */
export function getPillar<TRouter>(pillarId: string): PillarHandle<TRouter> {
  ensureConfigured();
  return pillar<TRouter>(pillarId);
}

/**
 * Test seam — drops the boot guard so a test can install a fresh config
 * and re-bootstrap.
 */
export function __resetPillarClientForTests(): void {
  configured = false;
}
