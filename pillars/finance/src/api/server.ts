/**
 * Entry point for the finance pillar HTTP server.
 *
 * Boots the process with the `/health` + `/pillars` probes and the REST
 * surface generated from `src/contract/rest.ts`. The process opens its
 * OWN `finance.db` connection via `openFinanceDb` rather than reaching
 * back into pops-api's singleton.
 *
 * When `POPS_REGISTRY_ENABLED=true`, the process registers a finance
 * manifest with the central registry on boot via `bootstrapPillar`.
 * SIGTERM triggers `pillarHandle.stop()` so the heartbeat clears and the
 * registry sees an explicit deregister.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { openFinanceDb } from '../db/index.js';
import { createFinanceApiApp } from './app.js';
import { createContactsClient } from './contacts/client.js';
import { createPillarOwnerUriLookup } from './cron/pillar-lookup.js';
import { startReconcileCrossPillarWorker } from './cron/reconcile-cross-pillar.js';
import { resolveFinanceSqlitePath } from './finance-sqlite-path.js';
import { buildFinanceCapabilityReporter, buildFinanceManifest } from './manifest.js';
import { parseBareOrigin } from './pillars/env.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3004;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[finance-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';

// Normalise FINANCE_SELF_BASE_URL (or the localhost fallback) through the
// shared bare-origin parser so a misconfigured env crashes boot loudly
// instead of publishing an invalid PillarRegistryEntry.baseUrl.
function resolveSelfBaseUrl(): string {
  const raw = process.env['FINANCE_SELF_BASE_URL'] ?? `http://localhost:${port}`;
  try {
    return parseBareOrigin('FINANCE_SELF_BASE_URL', raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`[finance-api] FINANCE_SELF_BASE_URL ${raw} is invalid — ${message}`, {
      cause: err,
    });
  }
}
const selfBaseUrl = resolveSelfBaseUrl();

const financeDb = openFinanceDb(resolveFinanceSqlitePath());
const app = createFinanceApiApp({
  financeDb,
  version,
  selfBaseUrl,
  contacts: createContactsClient(),
});

// Nightly cross-pillar URI reconciliation (PRD-251 US-03). Reads peer
// pillars over HTTP via the pillar SDK proxy — no compile-time coupling.
const reconcileHandle = startReconcileCrossPillarWorker({
  db: financeDb.db,
  lookupOwnerUri: createPillarOwnerUriLookup(),
  logger: {
    info: (msg, meta) => console.warn(`[finance-api] ${msg}`, meta ?? {}),
    warn: (msg, meta) => console.warn(`[finance-api] ${msg}`, meta ?? {}),
  },
});

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildFinanceManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildFinanceCapabilityReporter(),
  });
}

const server = app.listen(port, () => {
  console.warn(`[finance-api] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[finance-api] Shutting down (${signal})`);
  reconcileHandle.stop();
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      financeDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
