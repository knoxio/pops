/**
 * SSE handler for `GET /registry/subscribe`.
 *
 * Plain Express route over plain HTTP.
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
 * read-only and public.
 *
 * Spec: subscription-model.
 */
import { pillarRegistryService, type CoreDb } from '../../../db/index.js';
import { subscribeToRegistryEvents, type RegistryEventPayload } from './event-bus.js';
import { toRegistryEntry } from './snapshot.js';
import { registryNow } from './status.js';

import type { Request, Response } from 'express';

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
