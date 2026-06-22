/**
 * Sink dispatcher (PRD-236 / ADR-034).
 *
 * `publishEvent(eventType, payload)` looks up every registered pillar
 * whose manifest declares a sink for the given event type, validates
 * the payload against the sink's runtime Zod schema, then HTTP-POSTs to
 * `${baseUrl}/_sinks/${eventType}` on every match.
 *
 * **Delivery contract: at-least-once.** A sink HTTP endpoint MUST be
 * idempotent. Network failure, timeout, or partial success may cause
 * the orchestrator (or its caller) to retry the same `(eventType,
 * payload)` pair, possibly after the sink has already processed it.
 * Sinks that mutate state should dedupe on a stable payload field
 * (e.g. an event id) — never assume single delivery.
 *
 * Pure orchestration: discovery is injected (array or fetcher), the
 * runtime Zod schema registry is injected, and HTTP dispatch is
 * delegated to an injectable poster. No global state, no module-level
 * fetch.
 */

import type { z } from 'zod';

import type { PillarSnapshot } from '../discovery/types.js';

/**
 * Reason a single sink dispatch did not complete successfully.
 *
 * - `schema-missing`: the orchestrator has no runtime Zod schema
 *   registered for the matched sink's `eventType`. The payload is not
 *   posted because the orchestrator cannot validate it. This is a
 *   configuration error — sinks should not be discoverable in the
 *   manifest if the runtime schema has not been wired up.
 * - `invalid-payload`: the payload failed Zod validation against the
 *   registered schema. This is the source pillar's fault: it published
 *   a payload that does not match the sink's declared shape. Mapped to
 *   HTTP 4xx in any HTTP wrapper.
 * - `pillar-offline`: the HTTP POST rejected — either a network failure
 *   or a non-2xx response. The dispatcher swallows the rejection and
 *   continues; other sinks still receive the event.
 */
export type SinkDispatchFailure =
  | { readonly pillarId: string; readonly eventType: string; readonly reason: 'schema-missing' }
  | {
      readonly pillarId: string;
      readonly eventType: string;
      readonly reason: 'invalid-payload';
      readonly issues: readonly {
        readonly path: readonly (string | number)[];
        readonly message: string;
      }[];
    }
  | {
      readonly pillarId: string;
      readonly eventType: string;
      readonly reason: 'pillar-offline';
      readonly error: unknown;
    };

export interface SinkDispatchResult {
  readonly delivered: readonly { readonly pillarId: string; readonly eventType: string }[];
  readonly failures: readonly SinkDispatchFailure[];
}

/**
 * HTTP poster contract. Implementations marshal the payload to JSON and
 * POST to `${target.baseUrl}/_sinks/${eventType}`. Rejection (including
 * non-2xx) is reported as `pillar-offline` and never bubbles up to the
 * caller of {@link publishEvent}.
 */
export type SinkPoster = (target: {
  readonly pillarId: string;
  readonly baseUrl: string;
  readonly eventType: string;
  readonly payload: unknown;
}) => Promise<void>;

/**
 * Runtime Zod schema registry. Maps `eventType` to the schema the
 * orchestrator validates against before dispatching. Source pillars
 * declare the schema once; the registry is reused per `publishEvent`
 * call. Schemas are kept in memory because the manifest carries a
 * JSON-Schema-shaped descriptor (cross-language friendly per the wire
 * format direction in PRD-231) and the orchestrator needs the live
 * Zod instance to validate.
 */
export type SinkSchemaRegistry = ReadonlyMap<string, z.ZodType<unknown>>;

export interface PublishEventOptions {
  readonly eventType: string;
  readonly payload: unknown;
  readonly discovery: readonly PillarSnapshot[] | (() => Promise<readonly PillarSnapshot[]>);
  readonly schemas: SinkSchemaRegistry;
  readonly poster: SinkPoster;
}

/**
 * Dispatch an event to every registered pillar manifesting a sink for
 * `eventType`. Resolves with the per-target delivery list and a
 * per-target failure list. Never rejects on a single target failure —
 * pillar-offline is reported in `failures` and the other targets still
 * receive the event.
 *
 * Zero subscribers is a no-op: empty `delivered` and empty `failures`.
 */
export async function publishEvent(options: PublishEventOptions): Promise<SinkDispatchResult> {
  const { eventType, payload, schemas, poster } = options;
  const pillars = await resolveDiscovery(options.discovery);
  const targets = collectSinkTargets(pillars, eventType);

  if (targets.length === 0) return { delivered: [], failures: [] };

  const schema = schemas.get(eventType);
  if (schema === undefined) return fanOutFailure(targets, eventType, { reason: 'schema-missing' });

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return fanOutFailure(targets, eventType, {
      reason: 'invalid-payload',
      issues: mapZodIssues(parsed.error.issues),
    });
  }

  return dispatchToTargets(targets, eventType, parsed.data, poster);
}

type FanOutReason =
  | { readonly reason: 'schema-missing' }
  | {
      readonly reason: 'invalid-payload';
      readonly issues: readonly {
        readonly path: readonly (string | number)[];
        readonly message: string;
      }[];
    };

function fanOutFailure(
  targets: readonly SinkTarget[],
  eventType: string,
  reason: FanOutReason
): SinkDispatchResult {
  const failures: SinkDispatchFailure[] = targets.map((target) => {
    if (reason.reason === 'schema-missing') {
      return { pillarId: target.pillarId, eventType, reason: 'schema-missing' as const };
    }
    return {
      pillarId: target.pillarId,
      eventType,
      reason: 'invalid-payload' as const,
      issues: reason.issues,
    };
  });
  return { delivered: [], failures };
}

async function dispatchToTargets(
  targets: readonly SinkTarget[],
  eventType: string,
  validatedPayload: unknown,
  poster: SinkPoster
): Promise<SinkDispatchResult> {
  const settled = await Promise.allSettled(
    targets.map((target) =>
      poster({
        pillarId: target.pillarId,
        baseUrl: target.baseUrl,
        eventType,
        payload: validatedPayload,
      })
    )
  );

  const delivered: { pillarId: string; eventType: string }[] = [];
  const failures: SinkDispatchFailure[] = [];

  targets.forEach((target, index) => {
    const outcome = settled[index];
    if (outcome === undefined) return;
    if (outcome.status === 'fulfilled') {
      delivered.push({ pillarId: target.pillarId, eventType });
      return;
    }
    failures.push({
      pillarId: target.pillarId,
      eventType,
      reason: 'pillar-offline',
      error: outcome.reason,
    });
  });

  return { delivered, failures };
}

function mapZodIssues(
  issues: readonly { path: ReadonlyArray<PropertyKey>; message: string }[]
): readonly { readonly path: readonly (string | number)[]; readonly message: string }[] {
  return issues.map((issue) => ({
    path: issue.path.map((segment) => (typeof segment === 'number' ? segment : String(segment))),
    message: issue.message,
  }));
}

interface SinkTarget {
  readonly pillarId: string;
  readonly baseUrl: string;
}

function collectSinkTargets(
  pillars: readonly PillarSnapshot[],
  eventType: string
): readonly SinkTarget[] {
  const targets: SinkTarget[] = [];
  for (const pillar of pillars) {
    if (!pillar.registered) continue;
    const sinks = pillar.manifest.sinks?.descriptors;
    if (sinks === undefined) continue;
    if (sinks.some((descriptor) => descriptor.eventType === eventType)) {
      targets.push({ pillarId: pillar.pillarId, baseUrl: pillar.baseUrl });
    }
  }
  return targets;
}

async function resolveDiscovery(
  source: PublishEventOptions['discovery']
): Promise<readonly PillarSnapshot[]> {
  if (typeof source === 'function') return source();
  return source;
}
