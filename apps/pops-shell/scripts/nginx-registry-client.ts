/**
 * Registry client used by the `--dynamic` mode of
 * `generate-nginx-conf.ts` (Theme 13 PRD-232).
 *
 * Defines the wire schema for `core.registry.list` (just enough to keep
 * the nginx generator happy — pillarId + baseUrl), a hand-rolled type
 * guard, and a tRPC HTTP GET adapter. Lives in its own module so the
 * generator stays focused on rendering and so the test suite can swap
 * in an in-memory fetcher without touching the network.
 */

export interface RegistryListEntry {
  readonly pillarId: string;
  readonly baseUrl: string;
}

export interface RegistryListResponse {
  readonly pillars: readonly RegistryListEntry[];
}

export type RegistryFetcher = (registryUrl: string) => Promise<RegistryListResponse>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEntry(raw: unknown, index: number): RegistryListEntry {
  if (!isRecord(raw)) {
    throw new Error(`registry response pillars[${index}] is not an object`);
  }
  const { pillarId, baseUrl } = raw;
  if (typeof pillarId !== 'string' || pillarId.length === 0) {
    throw new Error(`registry response pillars[${index}].pillarId is not a non-empty string`);
  }
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    throw new Error(`registry response pillars[${index}].baseUrl is not a non-empty string`);
  }
  return { pillarId, baseUrl };
}

export function parseRegistryListResponse(payload: unknown): RegistryListResponse {
  if (!isRecord(payload)) {
    throw new Error('registry response is not an object');
  }
  const pillars = payload['pillars'];
  if (!Array.isArray(pillars)) {
    throw new Error('registry response is missing `pillars` array');
  }
  return { pillars: pillars.map(parseEntry) };
}

/**
 * tRPC HTTP GET adapter for `core.registry.list`. tRPC encodes a no-input
 * query as `?input=%7B%7D`; the procedure returns `{ result: { data: … } }`.
 */
export async function fetchRegistryViaTrpc(registryUrl: string): Promise<RegistryListResponse> {
  const base = registryUrl.replace(/\/+$/, '');
  const url = `${base}/trpc/core.registry.list?input=${encodeURIComponent('{}')}`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`registry fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  const body: unknown = await res.json();
  if (!isRecord(body)) {
    throw new Error('registry response body is not an object');
  }
  const result = body['result'];
  if (!isRecord(result)) {
    throw new Error('registry response is missing `result`');
  }
  return parseRegistryListResponse(result['data']);
}
