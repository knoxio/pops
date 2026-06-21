/**
 * Supertest-backed REST client for the ai pillar integration tests.
 *
 * Preserves a caller-shaped API (`client.aiBudgets.upsert({...})`,
 * `client.aiObservability.getStats()`) so per-test bodies stay readable — only
 * the transport changed. Non-2xx responses throw `HttpError` carrying the
 * parsed `{ status, body }` so tests assert on `.rejects.toMatchObject({ status })`.
 */
import supertest from 'supertest';

import type { Express } from 'express';

import type { RunEvaluationResult } from '../modules/ai-alerts/evaluator.js';
import type { AlertRule, FiredAlert } from '../modules/ai-alerts/types.js';
import type { Budget, BudgetStatus } from '../modules/ai-budgets/service.js';
import type {
  HistoryOutput as ObsHistory,
  LatencyStats as ObsLatency,
  ObservabilityFilters as ObsFilters,
  QualityMetrics as ObsQuality,
  StatsOutput as ObsStats,
} from '../modules/ai-observability/types.js';
import type { ProviderWithModels } from '../modules/ai-providers/service.js';
import type {
  AiUsageHistoryOutput as AiUsageHistory,
  AiUsageStatsOutput as AiUsageStats,
} from '../modules/ai-usage/types.js';

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body !== null && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${status}`;
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

async function send<T>(req: supertest.Test): Promise<T> {
  const res = await req;
  if (res.status >= 200 && res.status < 300) return res.body as T;
  throw new HttpError(res.status, res.body);
}

/** Per-client extra request headers (e.g. the internal token on the ingest). */
export type ClientHeaders = Record<string, string>;

function withHeaders(req: supertest.Test, headers: ClientHeaders | undefined): supertest.Test {
  if (!headers) return req;
  let out = req;
  for (const [name, value] of Object.entries(headers)) out = out.set(name, value);
  return out;
}

export interface AlertListQuery {
  acknowledged?: 'true' | 'false';
  type?: string;
  severity?: 'warning' | 'critical';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function makeClient(app: Express, headers?: ClientHeaders) {
  const base = supertest(app);
  const r = {
    get: (url: string) => withHeaders(base.get(url), headers),
    post: (url: string) => withHeaders(base.post(url), headers),
    put: (url: string) => withHeaders(base.put(url), headers),
    patch: (url: string) => withHeaders(base.patch(url), headers),
    delete: (url: string) => withHeaders(base.delete(url), headers),
  };
  return {
    raw: r,
    aiUsage: {
      getStats: () => send<AiUsageStats>(r.get('/ai-usage/stats')),
      getHistory: (query: { startDate?: string; endDate?: string } = {}) =>
        send<AiUsageHistory>(r.get('/ai-usage/history').query(query)),
    },
    aiBudgets: {
      list: () => send<Budget[]>(r.get('/ai-budgets')),
      getBudgetStatus: () => send<BudgetStatus[]>(r.get('/ai-budgets/status')),
      upsert: (body: Record<string, unknown>) => send<Budget>(r.post('/ai-budgets').send(body)),
    },
    aiProviders: {
      list: () => send<ProviderWithModels[]>(r.get('/ai-providers')),
      get: (providerId: string) =>
        send<ProviderWithModels | null>(r.get(`/ai-providers/${providerId}`)),
      upsert: (body: Record<string, unknown>) =>
        send<ProviderWithModels>(r.post('/ai-providers').send(body)),
      healthCheck: (providerId: string) =>
        send<{ status: 'active' | 'error'; latencyMs: number; error?: string }>(
          r.post(`/ai-providers/${providerId}/health-check`).send({})
        ),
    },
    aiObservability: {
      getStats: (query: ObsFilters = {}) =>
        send<ObsStats>(r.get('/ai-observability/stats').query(query)),
      getHistory: (query: ObsFilters = {}) =>
        send<ObsHistory>(r.get('/ai-observability/history').query(query)),
      getLatencyStats: (query: ObsFilters = {}) =>
        send<ObsLatency>(r.get('/ai-observability/latency').query(query)),
      getQualityMetrics: (query: ObsFilters = {}) =>
        send<ObsQuality>(r.get('/ai-observability/quality').query(query)),
    },
    aiAlerts: {
      rules: {
        list: () => send<AlertRule[]>(r.get('/ai-alerts/rules')),
        get: (id: number) => send<AlertRule>(r.get(`/ai-alerts/rules/${id}`)),
        create: (body: Record<string, unknown>) =>
          send<AlertRule>(r.post('/ai-alerts/rules').send(body)),
        update: (id: number, body: Record<string, unknown>) =>
          send<AlertRule>(r.patch(`/ai-alerts/rules/${id}`).send(body)),
        setEnabled: (id: number, enabled: boolean) =>
          send<AlertRule>(r.patch(`/ai-alerts/rules/${id}/enabled`).send({ enabled })),
        delete: (id: number) => send<{ success: boolean }>(r.delete(`/ai-alerts/rules/${id}`)),
        seedDefaults: () =>
          send<{ created: number }>(r.post('/ai-alerts/rules/seed-defaults').send({})),
      },
      list: (query: AlertListQuery = {}) =>
        send<{ alerts: FiredAlert[]; total: number }>(r.get('/ai-alerts').query(query)),
      acknowledge: (id: number) =>
        send<FiredAlert>(r.post(`/ai-alerts/${id}/acknowledge`).send({})),
      runNow: () => send<RunEvaluationResult>(r.post('/ai-alerts/run').send({})),
    },
  };
}
