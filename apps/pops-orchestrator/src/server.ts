/**
 * Entry point for the orchestrator HTTP server.
 *
 * Precursor C2 (ADR-029, epics 06+07) boots the process with the minimal
 * `/health` + `/pillars` surface so the new container can be wired into
 * the federation. The orchestrator is a cross-pillar aggregator: it owns
 * no domain DB and federates over pillars via `@pops/pillar-sdk` (which
 * defaults to REST). Federated search (epic 06), the AI-tool registry
 * (epic 07), and the cross-pillar embeddings pipeline land in follow-up
 * increments.
 *
 * Port 3009 is the next free slot after the pillars + ha-bridge:
 *   3001 core, 3002 inventory, 3003 media, 3004 finance, 3005 food,
 *   3006 lists, 3007 cerebrum, 3008 ha-bridge.
 *
 * When `POPS_REGISTRY_ENABLED=true`, the process registers an
 * orchestrator manifest with the central registry on boot via
 * `bootstrapPillar` — the same handshake the pillars use. SIGTERM /
 * SIGINT trigger `pillarHandle.stop()` so the heartbeat clears and the
 * registry sees an explicit deregister before the HTTP server shuts down.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';
import { setRegistryUrl } from '@pops/pillar-sdk/discovery';

import { createOrchestratorApp } from './app.js';
import { buildOrchestratorManifest } from './manifest.js';
import { parseBareOrigin } from './pillars/env.js';

const DEFAULT_PORT = 3009;

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[orchestrator] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

// Normalise ORCHESTRATOR_SELF_BASE_URL (or the localhost fallback) through
// the shared bare-origin parser so a misconfigured env crashes boot loudly
// instead of publishing an invalid PillarRegistryEntry.baseUrl.
function resolveSelfBaseUrl(): string {
  const raw = process.env['ORCHESTRATOR_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('ORCHESTRATOR_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[orchestrator] ORCHESTRATOR_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

// Point the SDK discovery client (the `GET /pillars` registry-first source) at
// core's registry. When unset, the SDK keeps its `http://core-api:3001` default.
// Normalise through the same bare-origin parser as the self URL so a stray
// path/query/trailing-slash crashes boot loudly instead of silently breaking
// discovery.
const registryUrl = process.env['POPS_REGISTRY_URL'];
if (registryUrl !== undefined && registryUrl !== '') {
  try {
    setRegistryUrl(parseBareOrigin('POPS_REGISTRY_URL', registryUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[orchestrator] POPS_REGISTRY_URL ${registryUrl} is invalid — ${message}`, {
      cause: err,
    });
  }
}

const app = createOrchestratorApp({ version, selfBaseUrl });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildOrchestratorManifest(version),
    baseUrl: selfBaseUrl,
  });
}

const server = app.listen(port, () => {
  console.warn(`[orchestrator] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[orchestrator] Shutting down (${signal})`);
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close();
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
