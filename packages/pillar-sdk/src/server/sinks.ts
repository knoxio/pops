/**
 * Server-side sink handler helper (PRD-236 / ADR-034).
 *
 * Bridge pillars (and any pillar that declares a `sinks` manifest entry)
 * mount one endpoint per accepted `eventType` at:
 *
 *     POST <base_url>/_sinks/<eventType>
 *
 * The orchestrator's {@link publishEvent} dispatcher posts the JSON
 * payload to this URL. The handler here validates the incoming payload
 * against the same Zod schema the pillar exposed in its manifest, then
 * delegates to a user-supplied async handler.
 *
 * Framework-agnostic by design: the helper returns a small object
 * describing the URL pattern, the validator, and the dispatcher. The
 * pillar's HTTP layer (Express, Fastify, Hono, plain node:http) wires
 * the route — the SDK does not bind to any one framework.
 *
 * **At-least-once delivery contract.** The dispatcher may call the same
 * handler with the same payload more than once (network retry, partial
 * dispatch failure, broker replay). Handlers MUST be idempotent:
 * mutations should dedupe on a stable payload field. See ADR-034
 * "Trade-off accepted: the dispatcher is at-least-once delivery, not
 * exactly-once. Sinks must be idempotent."
 */

import type { z } from 'zod';

/**
 * Structured outcome of an inbound sink invocation. The HTTP layer maps
 * these to status codes:
 *
 *   - `ok`              → 200
 *   - `invalid-payload` → 400 (validation failed — the publisher is wrong)
 *   - `handler-failed`  → 500 (the handler threw; the dispatcher will retry)
 */
export type SinkInvocationResult =
  | { readonly status: 'ok' }
  | {
      readonly status: 'invalid-payload';
      readonly issues: readonly {
        readonly path: readonly (string | number)[];
        readonly message: string;
      }[];
    }
  | { readonly status: 'handler-failed'; readonly error: unknown };

export interface SinkHandlerOptions<T> {
  /**
   * Event-type identifier — must match `<source>.<entity>.<action>` per
   * ADR-034 / PRD-236. The orchestrator uses this verbatim to route.
   */
  readonly eventType: string;
  /** Zod schema for the payload. Same instance referenced by the manifest. */
  readonly schema: z.ZodType<T>;
  /**
   * Idempotent payload handler. May be called more than once for the
   * same payload (at-least-once delivery). Errors thrown here surface
   * as `handler-failed` so the dispatcher can retry.
   */
  readonly handler: (payload: T) => Promise<void> | void;
}

export interface SinkHandler<T> {
  /** URL path the HTTP layer should mount: `/_sinks/<eventType>`. */
  readonly path: string;
  readonly eventType: string;
  readonly schema: z.ZodType<T>;
  /**
   * Drive the handler for a single inbound payload. Catches the
   * handler's errors and surfaces them as `handler-failed` — the HTTP
   * layer should map this to 5xx so the dispatcher retries.
   */
  invoke(payload: unknown): Promise<SinkInvocationResult>;
}

/**
 * Build a server-side sink handler. The returned object is wired into
 * the HTTP framework of choice — e.g. for Express:
 *
 * ```ts
 * const handler = createSinkHandler({
 *   eventType: 'media.watch.completed',
 *   schema: mediaWatchCompletedSchema,
 *   handler: async (payload) => { await mirrorToHa(payload); },
 * });
 *
 * app.post(handler.path, async (req, res) => {
 *   const result = await handler.invoke(req.body);
 *   if (result.status === 'ok') return res.status(200).end();
 *   if (result.status === 'invalid-payload') return res.status(400).json({ issues: result.issues });
 *   return res.status(500).json({ error: 'handler failed' });
 * });
 * ```
 */
export function createSinkHandler<T>(options: SinkHandlerOptions<T>): SinkHandler<T> {
  const { eventType, schema, handler } = options;
  return {
    path: `/_sinks/${eventType}`,
    eventType,
    schema,
    async invoke(payload: unknown): Promise<SinkInvocationResult> {
      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        return {
          status: 'invalid-payload',
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.map((segment) =>
              typeof segment === 'number' ? segment : String(segment)
            ),
            message: issue.message,
          })),
        };
      }
      try {
        await handler(parsed.data);
        return { status: 'ok' };
      } catch (error) {
        return { status: 'handler-failed', error };
      }
    },
  };
}
