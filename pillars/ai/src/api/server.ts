/**
 * Entry point for the ai pillar HTTP server (PRD-055).
 *
 * Opens its OWN `ai.db` via `openAiDb`, serves the AI-ops telemetry surface +
 * the cross-pillar ingest, and (when `POPS_REGISTRY_ENABLED=true`) registers
 * with core's registry via `bootstrapPillar` — the same handshake every pillar
 * uses. The two AI-ops schedulers (observability rollup + alert evaluation) are
 * env-gated OFF by default and run queue-free. SIGTERM/SIGINT stop the
 * schedulers, deregister, then close the HTTP server and DB.
 */
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { openAiDb } from '../db/index.js';
import { buildAiCapabilityReporter, buildAiManifest } from './ai-manifest.js';
import { resolveAiSqlitePath } from './ai-sqlite-path.js';
import { createAiApiApp } from './app.js';
import { startAlertsScheduler } from './modules/ai-alerts/scheduler.js';
import { startObservabilityScheduler } from './modules/ai-observability/scheduler.js';
import { parseBareOrigin } from './pillars/env.js';

function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3008;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[ai-api] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? 'dev';
const selfBaseUrl = parseBareOrigin(
  'AI_SELF_BASE_URL',
  process.env['AI_SELF_BASE_URL'] ?? `http://localhost:${port}`
);

const aiDb = openAiDb(resolveAiSqlitePath());

const app = createAiApiApp({ aiDb, version, selfBaseUrl });

const server = app.listen(port, () => {
  console.warn(`[ai-api] Listening on port ${port}`);
});

// AI Ops summary + retention. OFF unless AI_OBSERVABILITY_SCHEDULER_ENABLED=true.
const stopObservabilityScheduler = startObservabilityScheduler(aiDb.db);
// AI alert evaluator. OFF unless AI_ALERTS_SCHEDULER_ENABLED=true.
const stopAlertsScheduler = startAlertsScheduler(aiDb.db);

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({
    manifest: buildAiManifest(version),
    baseUrl: selfBaseUrl,
    capabilityReporter: buildAiCapabilityReporter(),
  });
}

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[ai-api] Shutting down (${signal})`);
  stopObservabilityScheduler();
  stopAlertsScheduler();
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      aiDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
