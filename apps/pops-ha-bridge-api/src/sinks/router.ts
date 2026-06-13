/**
 * PRD-237 US-02: Express router for `POST /_sinks/<eventType>`.
 *
 * Mounts one POST endpoint per shipped {@link SinkMapping} entry. Each
 * endpoint:
 *
 *   1. Looks up the mapping by its `eventType` (the route path).
 *   2. Validates the inbound JSON body against the Zod schema
 *      registered in `./schemas.ts`. Failure → 400 with Zod issues.
 *   3. Applies `mapping.transformInline` to the validated payload to
 *      get the HA `event_data` object.
 *   4. Calls the WS subscriber's `sendFireEvent(...)` helper. If the WS
 *      is connected the frame is delivered and the response is 200. If
 *      the WS is reconnecting the frame is enqueued and the response
 *      is still 200 (per the PRD — the orchestrator's contract is
 *      "accepted by the bridge").
 *
 * Unknown `eventType` paths fall through to Express's default 404 — a
 * mapping not in the config means the manifest never advertised it, so
 * a publisher hitting that path is a bug upstream, not here.
 */
import express, { type Router, type Request, type Response } from 'express';

import { mappings, type SinkMapping } from './mapping.js';
import { getSinkPayloadSchema } from './schemas.js';

import type { SendFireEventOutcome } from '../ws-subscriber.js';

export interface SinkFireEventFn {
  (
    eventType: string,
    haEventName: string,
    eventData: Record<string, unknown>
  ): SendFireEventOutcome;
}

export interface SinkSendBodyFn {
  (eventType: string, body: Record<string, unknown>): SendFireEventOutcome;
}

export interface SinkRouterDeps {
  readonly fireEvent: SinkFireEventFn;
  readonly sendBody: SinkSendBodyFn;
  readonly logger?: { warn(msg: string, meta?: Record<string, unknown>): void };
}

export interface SinkRouterOptions extends SinkRouterDeps {
  readonly mappings?: readonly SinkMapping[];
}

interface InvocationFailure {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export function createSinkRouter(options: SinkRouterOptions): Router {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));
  const list = options.mappings ?? mappings;

  for (const mapping of list) {
    router.post(`/_sinks/${mapping.eventType}`, (req: Request, res: Response) => {
      const outcome = invokeMapping(mapping, req.body, options);
      if (typeof outcome === 'object') {
        res.status(outcome.status).json(outcome.body);
        return;
      }
      res.status(200).json({ outcome });
    });
  }

  router.post('/_sinks/:eventType', (req: Request, res: Response) => {
    res.status(404).json({ error: 'unknown-event-type', eventType: req.params['eventType'] });
  });

  return router;
}

function invokeMapping(
  mapping: SinkMapping,
  body: unknown,
  deps: SinkRouterDeps
): SendFireEventOutcome | InvocationFailure {
  const schema = getSinkPayloadSchema(mapping.eventType);
  if (schema === undefined) {
    deps.logger?.warn('sink endpoint missing zod schema', { eventType: mapping.eventType });
    return {
      status: 500,
      body: { error: 'schema-not-registered', eventType: mapping.eventType },
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        error: 'invalid-payload',
        eventType: mapping.eventType,
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.map((segment) =>
            typeof segment === 'number' ? segment : String(segment)
          ),
          message: issue.message,
        })),
      },
    };
  }
  const data = parsed.data as Record<string, unknown>;
  if (mapping.buildFrameBody !== undefined) {
    const body = mapping.buildFrameBody(data);
    return deps.sendBody(mapping.eventType, body);
  }
  const eventData = mapping.transformInline(data);
  return deps.fireEvent(mapping.eventType, mapping.haEventName, eventData);
}
