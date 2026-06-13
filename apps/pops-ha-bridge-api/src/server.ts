import { WebSocket as WsWebSocket, type RawData } from 'ws';

/**
 * Entry point for the HA bridge pillar HTTP server (PRD-229 US-01).
 *
 * Boot order:
 *   1. Resolve env (`HA_URL`, `HA_TOKEN`, `HA_BRIDGE_SQLITE_PATH`, …).
 *   2. Open the per-pillar SQLite + apply migrations.
 *   3. Construct the WebSocket subscriber (degrades silently if HA env
 *      missing per PRD § Secret management).
 *   4. Start the Express app (`/health`, `/manifest.json`).
 *   5. Register with the central registry when `POPS_REGISTRY_ENABLED=true`.
 *   6. Start the subscriber — `start()` is a no-op in degraded mode so
 *      the pillar still boots cleanly.
 *
 * On SIGTERM / SIGINT the server is closed, the subscriber is stopped
 * (cancels reconnect timers + closes the socket), the registry handle
 * is stopped (clears heartbeat + deregisters), and the SQLite handle
 * is closed.
 */
import { openHaBridgeDb } from '@pops/ha-bridge-db';
import { bootstrapPillar, type PillarBootstrapHandle } from '@pops/pillar-sdk/bootstrap';

import { createHaBridgeApiApp } from './app.js';
import { resolveHaBridgeSqlitePath } from './ha-bridge-sqlite-path.js';
import { buildHaBridgeManifest } from './manifest.js';
import { HaWebSocketSubscriber, type HaWebSocketLike } from './ws-subscriber.js';

function resolvePort(): number {
  // 3001 core, 3002 inventory, 3003 media, 3004 finance, 3005 food,
  // 3006 lists, 3007 cerebrum, 3008 ha-bridge.
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return 3008;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`[ha-bridge] PORT must be a positive integer in 1-65535; got '${raw}'`);
  }
  return parsed;
}

function defaultWebSocketFactory(url: string): HaWebSocketLike {
  const ws = new WsWebSocket(url);
  return {
    send: (data) => {
      ws.send(data);
    },
    close: (code, reason) => {
      ws.close(code, reason);
    },
    on: (event, listener) => {
      if (event === 'open') {
        ws.on('open', listener as () => void);
      } else if (event === 'message') {
        ws.on('message', listener as (data: RawData) => void);
      } else if (event === 'close') {
        ws.on('close', listener as (code: number, reason: Buffer) => void);
      } else {
        ws.on('error', listener as (err: Error) => void);
      }
    },
  };
}

const port = resolvePort();
const version = process.env['BUILD_VERSION'] ?? '0.1.0';
const haUrl = process.env['HA_URL'];
const haToken = process.env['HA_TOKEN'];

const haBridgeDb = openHaBridgeDb(resolveHaBridgeSqlitePath());

// Opt-in subscriber logging. Default is silent ("degrades silently" per
// PRD-229) so unconfigured deployments stay quiet; set HA_BRIDGE_LOG=warn
// to surface connection / auth events on the container's stdout.
const subscriberLogger =
  process.env['HA_BRIDGE_LOG'] === 'warn'
    ? {
        info: (msg: string, meta?: Record<string, unknown>) =>
          console.warn(`[ha-bridge] ${msg}`, meta ?? {}),
        warn: (msg: string, meta?: Record<string, unknown>) =>
          console.warn(`[ha-bridge] ${msg}`, meta ?? {}),
      }
    : undefined;

const subscriber = new HaWebSocketSubscriber({
  db: haBridgeDb,
  url: haUrl,
  token: haToken,
  webSocketFactory: defaultWebSocketFactory,
  logger: subscriberLogger,
});

const manifest = buildHaBridgeManifest(version);
const app = createHaBridgeApiApp({ manifest, version, subscriber });

let pillarHandle: PillarBootstrapHandle | undefined;
if (process.env['POPS_REGISTRY_ENABLED'] === 'true') {
  pillarHandle = await bootstrapPillar({ manifest });
}

subscriber.start();

const server = app.listen(port, () => {
  console.warn(`[ha-bridge] Listening on port ${port}`);
});

let shuttingDown = false;
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[ha-bridge] Shutting down (${signal})`);
  subscriber.stop();
  void (pillarHandle?.stop() ?? Promise.resolve()).finally(() => {
    server.close(() => {
      haBridgeDb.raw.close();
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
