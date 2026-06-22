import type { LookupPricingFn, PricingEntry } from './types.js';

/**
 * Cross-pillar HTTP pricing adapter. Prefers the dedicated
 * `GET /ai-pricing/:provider/:model` route (already shaped as a
 * {@link PricingEntry}); falls back to `GET /ai-providers` and maps
 * `models[].{inputCostPerMtok,outputCostPerMtok}` → `{ input, output }` when the
 * dedicated route is absent (e.g. an older ai pillar). Returns null on any miss;
 * never throws (telemetry must not break callers).
 */
export function httpLookupPricing(
  aiApiBaseUrl: string,
  fetchImpl: typeof fetch = fetch
): LookupPricingFn {
  const base = aiApiBaseUrl.endsWith('/') ? aiApiBaseUrl.slice(0, -1) : aiApiBaseUrl;

  return async (provider, model) => {
    const direct = await fetchPricingEntry(
      fetchImpl,
      `${base}/ai-pricing/${encodeURIComponent(provider)}/${encodeURIComponent(model)}`
    );
    if (direct) return direct;
    return fetchProviderFallback(fetchImpl, `${base}/ai-providers`, provider, model);
  };
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

async function readJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function fetchPricingEntry(
  fetchImpl: typeof fetch,
  url: string
): Promise<PricingEntry | null> {
  const body = await readJson(fetchImpl, url);
  if (typeof body !== 'object' || body === null) return null;
  const input = asNumber(Reflect.get(body, 'input'));
  const output = asNumber(Reflect.get(body, 'output'));
  return input !== null && output !== null ? { input, output } : null;
}

async function fetchProviderFallback(
  fetchImpl: typeof fetch,
  url: string,
  provider: string,
  model: string
): Promise<PricingEntry | null> {
  const body = await readJson(fetchImpl, url);
  const providers = Array.isArray(body) ? body : toArray(getField(body, 'providers'));
  const providerEntry = providers.find((entry) => fieldEquals(entry, ['id', 'provider'], provider));
  const models = toArray(getField(providerEntry, 'models'));
  const modelEntry = models.find((entry) => fieldEquals(entry, ['model', 'id'], model));
  return pricingFromModel(modelEntry);
}

function pricingFromModel(model: unknown): PricingEntry | null {
  const input = asNumber(getField(model, 'inputCostPerMtok'));
  const output = asNumber(getField(model, 'outputCostPerMtok'));
  return input !== null && output !== null ? { input, output } : null;
}

function getField(obj: unknown, key: string): unknown {
  return typeof obj === 'object' && obj !== null ? Reflect.get(obj, key) : undefined;
}

function fieldEquals(obj: unknown, keys: string[], value: string): boolean {
  return keys.some((key) => getField(obj, key) === value);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
