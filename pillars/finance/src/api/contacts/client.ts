/**
 * Live contacts-pillar client for the finance backend.
 *
 * Finance no longer keeps a local `entities` mirror. The import matcher and the
 * entity-usage rollup fetch the contact set from the contacts pillar over the
 * pillar SDK at request time and join/match it in memory for that run only —
 * no persistent copy (PRD-163 US-03/US-06, contacts plan OD-3/OD-4).
 *
 * The whole set is fetched via a paginated `entities.list` sweep (the list cap
 * is per-page, so the client pages until exhausted). One bulk read serves all
 * three consumers: the matcher reads name/aliases, the usage rollup reads the
 * full attributes, and the tag-suggester reads `defaultTags`.
 *
 * All reads degrade gracefully: when contacts is unreachable the SDK returns a
 * `CallResult` whose `kind !== 'ok'` and the helpers substitute an EMPTY set
 * plus a logged warning rather than throwing — an import does a no-match run
 * and the usage list renders empty (OD-3 / S4). The pre-create path is
 * create-or-fetch-by-name: a 409 dup-name fetches the existing contact id so a
 * retry after a rolled-back finance transaction reuses the contact (OD-8).
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/client';

/** The contacts pillar id, as registered with the registry. */
export const CONTACTS_PILLAR_ID = 'contacts';

/** A full contact, mirroring the contacts `Entity` wire shape (no notion/owner columns). */
export interface ContactEntity {
  id: string;
  name: string;
  type: string;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
}

interface ListResponse {
  data: ContactEntity[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

/**
 * Typed handle over the subset of the contacts router the finance backend
 * calls. Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint — an interface does not (see the same
 * note in the orchestrator's `PillarSearchRouter`).
 */
type ContactsRouter = {
  entities: {
    list: (input: {
      search?: string;
      type?: string;
      limit?: number;
      offset?: number;
    }) => Promise<ListResponse>;
    get: (input: { id: string }) => Promise<{ data: ContactEntity }>;
    create: (input: {
      name: string;
      type: string;
    }) => Promise<{ data: ContactEntity; message: string }>;
  };
};

/** Outcome of a create-or-fetch-by-name pre-create against contacts. */
export interface CreateOrFetchResult {
  id: string;
  name: string;
}

/**
 * The injectable seam every finance live-fetch path depends on. The default
 * impl is backed by `pillar('contacts')`; tests pass a fake so the matcher /
 * usage join / degradation paths are exercised without the network.
 */
export interface ContactsClient {
  /**
   * The whole contact set (optionally filtered by `search`/`type`), paged out
   * of the contacts list endpoint. Empty when contacts is down (OD-3).
   */
  fetchAllEntities(query?: { search?: string; type?: string }): Promise<ContactEntity[]>;
  /**
   * The `defaultTags` of a single contact (the tag-suggester entity source for
   * the per-transaction suggest endpoint). Empty when the id is unknown or
   * contacts is down — the entity stage simply contributes nothing.
   */
  fetchEntityDefaultTags(entityId: string): Promise<string[]>;
  /**
   * Create a contact carrying `{ name, type }`, or fetch the existing one by
   * name on a 409 dup-name (idempotent). Throws only on a genuine failure
   * (contacts down / contract-mismatch) — the commit path cannot silently
   * drop a pending entity.
   */
  createOrFetchByName(name: string, type: string): Promise<CreateOrFetchResult>;
}

/** Thrown when a contact pre-create cannot resolve to an id (contacts unreachable). */
export class ContactsUnavailableError extends Error {
  override readonly name = 'ContactsUnavailableError';
  constructor(detail: string) {
    super(`contacts pillar unavailable during entity pre-create: ${detail}`);
  }
}

/** Per-page size for the bulk list sweep — matches the contacts list `MAX_LIMIT`. */
const PAGE_SIZE = 200;
/** Stop the paging sweep well before a runaway loop on a misbehaving peer. */
const MAX_PAGES = 100;

function warnDegraded(operation: string, result: CallResult<unknown>): void {
  if (isOk(result)) return;
  console.warn(
    `[contacts] ${operation} degraded (kind=${result.kind}); substituting empty contact set`
  );
}

async function pageThroughEntities(
  handle: PillarHandle<ContactsRouter>,
  query: { search?: string; type?: string }
): Promise<ContactEntity[]> {
  const all: ContactEntity[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await handle.entities.list({
      search: query.search,
      type: query.type,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (!isOk(result)) {
      warnDegraded('entities.list', result);
      return [];
    }
    all.push(...result.value.data);
    if (!result.value.pagination.hasMore) break;
  }
  return all;
}

/**
 * Build the default contacts client over the pillar SDK. `handleFactory` is
 * injectable purely so unit tests can supply a stub router; production passes
 * the real `pillar('contacts')`.
 */
export function createContactsClient(
  handleFactory: () => PillarHandle<ContactsRouter> = () =>
    pillar<ContactsRouter>(CONTACTS_PILLAR_ID)
): ContactsClient {
  return {
    fetchAllEntities(query: { search?: string; type?: string } = {}): Promise<ContactEntity[]> {
      return pageThroughEntities(handleFactory(), query);
    },

    async fetchEntityDefaultTags(entityId: string): Promise<string[]> {
      const result = await handleFactory().entities.get({ id: entityId });
      if (!isOk(result)) {
        if (result.kind !== 'not-found') warnDegraded('entities.get', result);
        return [];
      }
      return result.value.data.defaultTags;
    },

    async createOrFetchByName(name: string, type: string): Promise<CreateOrFetchResult> {
      const handle = handleFactory();
      const created = await handle.entities.create({ name, type });
      if (isOk(created)) {
        return { id: created.value.data.id, name: created.value.data.name };
      }
      if (created.kind !== 'conflict') {
        throw new ContactsUnavailableError(created.kind);
      }
      const existing = await fetchByExactName(handle, name);
      if (existing) return { id: existing.id, name: existing.name };
      throw new ContactsUnavailableError(`409 for "${name}" but no existing contact found`);
    },
  };
}

/**
 * Resolve a single contact by exact (case-insensitive) name for the
 * create-or-fetch 409 path. The list `search` is a substring filter, so the
 * exact match is re-checked client-side over the matching page.
 */
async function fetchByExactName(
  handle: PillarHandle<ContactsRouter>,
  name: string
): Promise<ContactEntity | null> {
  const matches = await pageThroughEntities(handle, { search: name });
  const target = name.toLowerCase();
  return matches.find((e) => e.name.toLowerCase() === target) ?? null;
}
