import { type InferenceRecord } from './record-schema.js';

import type { ReportInferenceFn } from './types.js';

export interface ReportSinkConfig {
  /**
   * Base URL of the ai pillar. Defaults to `AI_API_URL` (checked FIRST so it
   * never collides with a service's self-pointing `POPS_API_URL`), then
   * `POPS_API_URL`. When neither resolves, reporting is a silent no-op.
   */
  baseUrl?: string;
  /** Internal token; defaults to `POPS_API_INTERNAL_TOKEN`. */
  token?: string;
  /** Injectable for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

const RECORD_PATH = '/ai-usage/record';

function resolveBaseUrl(explicit?: string): string | undefined {
  return explicit ?? process.env['AI_API_URL'] ?? process.env['POPS_API_URL'] ?? undefined;
}

/**
 * Builds an env-driven {@link ReportInferenceFn} that POSTs an
 * {@link InferenceRecord} to the ai pillar's internal `/ai-usage/record`
 * ingest. Best-effort by contract: a missing sink, a non-2xx response, or a
 * thrown fetch are all swallowed so telemetry can never break a caller.
 */
export function createEnvReportSink(config: ReportSinkConfig = {}): ReportInferenceFn {
  const fetchImpl = config.fetchImpl ?? fetch;
  return async (record: InferenceRecord): Promise<void> => {
    const baseUrl = resolveBaseUrl(config.baseUrl);
    if (!baseUrl) return;
    const token = config.token ?? process.env['POPS_API_INTERNAL_TOKEN'];
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token) headers['x-pops-internal-token'] = token;
    const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    await fetchImpl(`${base}${RECORD_PATH}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(record),
    });
  };
}

/** The default env-driven sink, resolved lazily from `process.env` per call. */
export const reportInference: ReportInferenceFn = (record) => createEnvReportSink()(record);
