/**
 * SSE handler for `GET /registry/subscribe` (Theme 13 PRD-163).
 *
 * Plain Express route — NOT a tRPC subscription. tRPC subscriptions
 * require a WebSocket transport; SSE is plain HTTP. The handler sits
 * alongside the tRPC mount in `app.ts`.
 *
 * Lifecycle:
 *   1. On connect, write a `snapshot` event containing the current
 *      `RegistryEntry[]` (one read against `pillar_registry`).
 *   2. Subscribe to the in-process event bus and forward every
 *      register / deregister / health-changed payload as a discrete
 *      `event: pillar.<name>` SSE frame.
 *   3. On `req.on('close')`, unsubscribe from the bus so a flaky
 *      client cannot leak listeners.
 *
 * Auth: registry mutations are nginx-gated; `/registry/subscribe` is
 * read-only and public for now (PRD-163 "Out of Scope: Authentication
 * on the SSE endpoint"). Reconnect behaviour + client-side backoff
 * are PRD-164's responsibility — this PR only ships the server.
 *
 * Follow-ups (intentionally not in this PR):
 *   - 30s keep-alive comments (covered when PRD-164 needs them).
 *   - Per-client write-queue bounds + backpressure handling.
 */
import { pillarRegistryService, type CoreDb } from '../../../db/index.js';
import { subscribeToRegistryEvents, type RegistryEventPayload } from './event-bus.js';
import { computeStatus, registryNow } from './status.js';
import { RegistryEntrySchema, type RegistryEntry } from './types.js';

import type { Request, Response } from 'express';

import type { PillarRegistration } from '../../../db/index.js';

function toRegistryEntry(reg: PillarRegistration, now: Date): RegistryEntry {
  const manifest = RegistryEntrySchema.shape.manifest.parse(reg.manifest);
  const status =
    reg.status === 'unknown' ? 'unknown' : computeStatus(new Date(reg.lastHeartbeatAt), now);
  return {
    pillarId: reg.pillarId,
    baseUrl: reg.baseUrl,
    manifest,
    contract: {
      package: reg.contractPackage,
      version: reg.contractVersion,
      tag: reg.contractTag,
    },
    registeredAt: reg.registeredAt,
    lastHeartbeatAt: reg.lastHeartbeatAt,
    status,
    statusUpdatedAt: reg.statusUpdatedAt,
  };
}

function writeFrame(res: Response, eventName: string, data: unknown): boolean {
  if (res.writableEnded || res.closed) return false;
  try {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function createRegistrySubscribeHandler(
  coreDb: CoreDb
): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const now = registryNow();
    const snapshot = pillarRegistryService
      .listPillarRegistrations(coreDb)
      .map((row) => toRegistryEntry(row, now));
    writeFrame(res, 'pillar.snapshot', snapshot);

    const unsubscribe = subscribeToRegistryEvents((payload: RegistryEventPayload) => {
      writeFrame(res, `pillar.${payload.event}`, payload);
    });

    let cleanedUp = false;
    const cleanup = (): void => {
      if (cleanedUp) return;
      cleanedUp = true;
      unsubscribe();
    };

    req.once('close', cleanup);
    res.once('close', cleanup);
  };
}
