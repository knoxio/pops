/**
 * Cross-pillar HTTP client for the cerebrum pillar — used by the ai-alerts
 * nudge dispatcher to write an alert nudge over REST instead of reaching into
 * the cerebrum DB. Pillars trust the docker network, so no per-request auth
 * header is sent. The base URL is resolved from the `POPS_PILLARS` registry
 * (mirrors the food→lists `lists-client` precedent).
 *
 * When the cerebrum pillar is absent from `POPS_PILLARS` (e.g. a dev box that
 * never booted it) the client is treated as not configured: {@link
 * resolveCerebrumBaseUrl} returns `null` and {@link createCerebrumNudgeClient}
 * returns `null`, so the dispatcher fails soft rather than crashing the alert
 * pipeline.
 */
import { parsePillarsEnv } from '../../pillars/env.js';

export type NudgeActionTypeWire = 'consolidate' | 'archive' | 'review' | 'link';

export interface CerebrumNudgeAction {
  type: NudgeActionTypeWire;
  label: string;
  params: Record<string, unknown>;
}

export interface CreateNudgeBody {
  type?: 'consolidation' | 'staleness' | 'pattern' | 'insight';
  title: string;
  body: string;
  priority: 'low' | 'medium' | 'high';
  engramIds?: string[];
  expiresAt?: string | null;
  action?: CerebrumNudgeAction | null;
}

export interface CreatedNudge {
  id: string;
}

export interface CerebrumNudgeClient {
  createNudge(body: CreateNudgeBody): Promise<CreatedNudge>;
}

type FetchImpl = typeof globalThis.fetch;

/**
 * Resolve the cerebrum pillar's base URL from `POPS_PILLARS`, or `null` when
 * the pillar is not registered (the dispatcher then no-ops).
 */
export function resolveCerebrumBaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const entry = parsePillarsEnv(env['POPS_PILLARS']).find((p) => p.id === 'cerebrum');
  return entry?.baseUrl ?? null;
}

async function readMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  return text.length === 0 ? '' : text;
}

/**
 * Bare-`fetch` cerebrum nudge client. `fetchImpl` is injectable so the
 * ai-alerts tests can drive the flow without a live cerebrum-api.
 */
export function createCerebrumNudgeHttpClient(
  baseUrl: string,
  fetchImpl: FetchImpl = globalThis.fetch
): CerebrumNudgeClient {
  const root = baseUrl.replace(/\/$/, '');

  return {
    async createNudge(body) {
      const res = await fetchImpl(`${root}/nudges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`cerebrum POST /nudges → HTTP ${res.status}: ${await readMessage(res)}`);
      }
      const json = (await res.json().catch(() => null)) as { nudge: CreatedNudge } | null;
      if (!json?.nudge) throw new Error('cerebrum POST /nudges → malformed response (no nudge)');
      return json.nudge;
    },
  };
}

/**
 * Build the default cerebrum nudge client from the environment, or `null` when
 * the pillar is not present in `POPS_PILLARS`.
 */
export function createCerebrumNudgeClient(
  env: NodeJS.ProcessEnv = process.env
): CerebrumNudgeClient | null {
  const baseUrl = resolveCerebrumBaseUrl(env);
  if (baseUrl === null) return null;
  return createCerebrumNudgeHttpClient(baseUrl);
}
