/**
 * Cross-pillar HTTP client for the lists pillar — used by send-to-list to
 * write shopping-list items over REST instead of reaching into the lists
 * DB. Pillars trust the docker network (the dispatcher authenticates), so
 * no per-request auth header is sent. The base URL is resolved from the
 * `POPS_PILLARS` registry.
 *
 * Each call is its own atomic operation on the lists side; the single
 * cross-pillar transaction the old `@pops/app-lists-db` path had is gone by
 * design (PRD: lists owns its own consistency now). `upsertByRef` makes the
 * merge-or-insert atomic per item so retries are idempotent.
 */
import { parsePillarsEnv } from '../../../pillars/env.js';

export interface ListHeader {
  id: number;
  kind: string;
  ownerApp: string;
  archivedAt: string | null;
}

export type UpsertRefKind = 'ingredient' | 'variant' | 'recipe' | 'custom';
export type UpsertConflictMode = 'merge-additive' | 'replace' | 'skip';

export interface UpsertByRefBody {
  refKind: UpsertRefKind;
  refId: number;
  label: string;
  qty?: number | null;
  unit?: string | null;
  notes?: string | null;
  onConflict?: UpsertConflictMode;
}

export interface UpsertByRefResult {
  outcome: 'inserted' | 'merged' | 'skipped';
  itemId: number;
}

export interface AddItemBody {
  label: string;
  qty?: number | null;
  unit?: string | null;
  refKind?: string;
  refId?: number | null;
  notes?: string | null;
}

export interface ListsClient {
  getList(id: number): Promise<ListHeader | null>;
  createShoppingList(name: string): Promise<number>;
  upsertByRef(listId: number, body: UpsertByRefBody): Promise<UpsertByRefResult>;
  addItem(listId: number, body: AddItemBody): Promise<void>;
  /** Distinct shopping-list ids whose item notes contain `notesContains`. */
  searchShoppingListIdsByNotes(notesContains: string): Promise<number[]>;
}

/** Resolve the lists pillar's base URL from `POPS_PILLARS`. */
export function resolveListsBaseUrl(): string {
  const entry = parsePillarsEnv(process.env['POPS_PILLARS']).find((p) => p.id === 'lists');
  if (entry === undefined) {
    throw new Error('lists pillar not present in POPS_PILLARS — cannot send to list');
  }
  return entry.baseUrl;
}

type FetchImpl = typeof globalThis.fetch;

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  return text.length === 0 ? null : (JSON.parse(text) as unknown);
}

function asMessage(body: unknown): string {
  return body !== null && typeof body === 'object' && 'message' in body
    ? String((body as { message: unknown }).message)
    : '';
}

/**
 * Bare-`fetch` implementation. `fetchImpl` is injectable so the send-to-list
 * tests can drive the flow without a live lists-api.
 */
export function createListsHttpClient(
  baseUrl: string,
  fetchImpl: FetchImpl = globalThis.fetch
): ListsClient {
  const root = baseUrl.replace(/\/$/, '');

  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    return fetchImpl(`${root}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return {
    async getList(id) {
      const res = await call('GET', `/lists/${id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`lists GET /lists/${id} → HTTP ${res.status}`);
      const json = (await readJson(res)) as { list: ListHeader } | null;
      return json?.list ?? null;
    },

    async createShoppingList(name) {
      const res = await call('POST', '/lists', { name, kind: 'shopping', ownerApp: 'food' });
      if (!res.ok)
        throw new Error(
          `lists POST /lists → HTTP ${res.status}: ${asMessage(await readJson(res))}`
        );
      const json = (await readJson(res)) as { id: number };
      return json.id;
    },

    async upsertByRef(listId, body) {
      const res = await call('POST', `/lists/${listId}/items/upsert-by-ref`, body);
      if (!res.ok) {
        throw new Error(
          `lists upsert-by-ref → HTTP ${res.status}: ${asMessage(await readJson(res))}`
        );
      }
      return (await readJson(res)) as UpsertByRefResult;
    },

    async addItem(listId, body) {
      const res = await call('POST', `/lists/${listId}/items`, body);
      if (!res.ok) throw new Error(`lists POST /lists/${listId}/items → HTTP ${res.status}`);
    },

    async searchShoppingListIdsByNotes(notesContains) {
      const qs = new URLSearchParams({ kind: 'shopping', notesContains });
      const res = await call('GET', `/items?${qs.toString()}`);
      if (!res.ok) throw new Error(`lists GET /items → HTTP ${res.status}`);
      const json = (await readJson(res)) as { items: { listId: number }[] };
      const ids = new Set(json.items.map((i) => i.listId));
      return [...ids].toSorted((a, b) => a - b);
    },
  };
}
