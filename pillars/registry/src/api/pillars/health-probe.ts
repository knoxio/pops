/**
 * Cross-pillar health probe (ADR-026).
 *
 * Fans out concurrent `GET {baseUrl}/health` requests against the live
 * `POPS_PILLARS` registry and reports each pillar as `'healthy'` or
 * `'unavailable'`. The aggregator runs inside the registry pillar because base
 * URLs are container-network addresses unreachable from the browser; the
 * shell calls a single `GET /pillars/health` and gets the aggregate.
 *
 * The probe is intentionally cheap: small timeout, no retries, no body
 * inspection beyond `PillarHealth` shape validation.
 */
import type { PillarRegistryEntry } from '@pops/types';

/** Health view of a single pillar from the aggregator's perspective. */
export type PillarHealthStatus = 'healthy' | 'unavailable';

/** Aggregated probe result keyed by pillar id. */
export type PillarHealthMap = Record<string, PillarHealthStatus>;

export interface ProbePillarHealthOptions {
  /** Self-pillar id; the probe assumes `'healthy'` for this id without HTTP. */
  readonly selfPillarId?: string;
  /** Per-probe timeout in milliseconds. Defaults to 2000. */
  readonly timeoutMs?: number;
  /** Override the global `fetch` (tests inject a stub). */
  readonly fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 2000;
const DEFAULT_SELF_PILLAR_ID = 'registry';

/**
 * Probe a single pillar's `/health` endpoint. Any non-200, parse error,
 * timeout, network failure, or shape mismatch maps to `'unavailable'`.
 *
 * The pillar field of the response is checked against the registry id — a
 * misconfigured `POPS_PILLARS` pointing at the wrong service is treated as
 * unavailable rather than silently misreporting the upstream's health.
 */
export async function probePillarHealth(
  entry: PillarRegistryEntry,
  options: ProbePillarHealthOptions = {}
): Promise<PillarHealthStatus> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  try {
    const response = await fetchImpl(`${entry.baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return 'unavailable';
    const body: unknown = await response.json();
    if (!isPillarHealthShape(body)) return 'unavailable';
    if (body.pillar !== entry.id) return 'unavailable';
    return 'healthy';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Concurrently probe every entry in the registry. The self-pillar entry
 * (matched on `id`, regardless of `baseUrl`) is reported `'healthy'` without
 * HTTP — the aggregator is part of that pillar's process.
 *
 * Returns a partial map: an empty registry yields `{}`. Iteration order is
 * registry order; consumers should not depend on it.
 */
export async function probeAllPillars(
  entries: readonly PillarRegistryEntry[],
  options: ProbePillarHealthOptions = {}
): Promise<PillarHealthMap> {
  const selfPillarId = options.selfPillarId ?? DEFAULT_SELF_PILLAR_ID;
  const probes = entries.map(async (entry) => {
    if (entry.id === selfPillarId) return [entry.id, 'healthy'] as const;
    const status = await probePillarHealth(entry, options);
    return [entry.id, status] as const;
  });
  const results = await Promise.all(probes);
  const out: PillarHealthMap = {};
  for (const [id, status] of results) out[id] = status;
  return out;
}

function isPillarHealthShape(
  body: unknown
): body is { readonly ok: true; readonly pillar: string; readonly version: string } {
  if (typeof body !== 'object' || body === null) return false;
  const ok: unknown = Reflect.get(body, 'ok');
  const pillar: unknown = Reflect.get(body, 'pillar');
  const version: unknown = Reflect.get(body, 'version');
  return ok === true && typeof pillar === 'string' && typeof version === 'string';
}
