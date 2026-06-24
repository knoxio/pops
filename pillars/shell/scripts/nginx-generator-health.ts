/**
 * Health surface for the event-driven nginx reloader
 * (docs/themes/federation/prds/dynamic-pillar-registration). Exposes
 * `nginx_generator_last_error_at` so the registry — or any operator
 * dashboard — can detect a stuck dispatcher generator.
 *
 * State model:
 *   - On every successful regen + validate + reload, `lastError` clears
 *     and `lastSuccessAt` advances.
 *   - On any stage failure, `lastError` records `{ stage, message, at }`.
 *     It stays set until the next success.
 *   - `nginx_generator_last_error_at` is the unix-epoch-ms of the last
 *     failure, or `null` when healthy. The dedicated `lastSuccessAt`
 *     field lets consumers verify the generator is alive even when no
 *     events have been emitted recently.
 *
 * The HTTP server is intentionally tiny — a single GET endpoint
 * returning JSON. No framework dependency; the watcher is a CLI script
 * and the homelab footprint is already heavy enough.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import type { ReloadErrorEvent, ReloadStage } from './nginx-event-reload.ts';

export interface NginxGeneratorHealthSnapshot {
  readonly status: 'ok' | 'degraded';
  readonly lastSuccessAt: number | null;
  readonly lastError: {
    readonly stage: ReloadStage;
    readonly message: string;
    readonly at: number;
  } | null;
  readonly nginx_generator_last_error_at: number | null;
}

export interface NginxGeneratorHealth {
  readonly snapshot: () => NginxGeneratorHealthSnapshot;
  readonly recordSuccess: (at?: Date) => void;
  readonly recordError: (event: ReloadErrorEvent) => void;
}

interface HealthState {
  lastSuccessAt: number | null;
  lastError: NginxGeneratorHealthSnapshot['lastError'];
}

export function createNginxGeneratorHealth(): NginxGeneratorHealth {
  const state: HealthState = { lastSuccessAt: null, lastError: null };
  return {
    snapshot: () => ({
      status: state.lastError === null ? 'ok' : 'degraded',
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
      nginx_generator_last_error_at: state.lastError?.at ?? null,
    }),
    recordSuccess: (at?: Date) => {
      state.lastSuccessAt = (at ?? new Date()).getTime();
      state.lastError = null;
    },
    recordError: (event: ReloadErrorEvent) => {
      state.lastError = {
        stage: event.stage,
        message: event.message,
        at: event.at.getTime(),
      };
    },
  };
}

export interface HealthEndpointHandle {
  readonly port: number;
  readonly close: () => Promise<void>;
}

export interface StartHealthEndpointOptions {
  readonly health: NginxGeneratorHealth;
  readonly port: number;
  readonly host?: string;
  readonly path?: string;
}

const DEFAULT_HEALTH_PATH = '/health';

function handleHealthRequest(
  req: IncomingMessage,
  res: ServerResponse,
  health: NginxGeneratorHealth,
  path: string
): void {
  const url = req.url ?? '/';
  const pathname = url.split('?')[0] ?? '/';
  if (req.method !== 'GET' || pathname !== path) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }
  const snapshot = health.snapshot();
  res.statusCode = snapshot.status === 'ok' ? 200 : 503;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(snapshot));
}

export async function startHealthEndpoint(
  options: StartHealthEndpointOptions
): Promise<HealthEndpointHandle> {
  const path = options.path ?? DEFAULT_HEALTH_PATH;
  const server: Server = createServer((req, res) => {
    handleHealthRequest(req, res, options.health, path);
  });
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (err: Error): void => {
      server.off('listening', onListening);
      rejectPromise(err);
    };
    const onListening = (): void => {
      server.off('error', onError);
      resolvePromise();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(options.port, options.host ?? '0.0.0.0');
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  return {
    port,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => {
          if (err !== undefined && err !== null) rejectClose(err);
          else resolveClose();
        });
      }),
  };
}
