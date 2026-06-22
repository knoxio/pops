import { describe, expect, it, vi } from 'vitest';

/**
 * Unit tests for {@link createContactsClient} driven against a hand-built stub
 * of the contacts pillar handle. These exercise the paths the in-memory fake
 * cannot model faithfully:
 *
 *  - The no-silent-cap paging sweep: it pages until `hasMore` is false, and
 *    when the safety cap is hit with rows still available it WARNS and returns
 *    a (visibly) truncated set rather than dropping the tail silently.
 *  - create-or-fetch-by-name against contacts' ACTUAL enforcement: name
 *    uniqueness is only case-SENSITIVE there (no UNIQUE constraint), so a
 *    case-variant must be deduped client-side by the fetch-FIRST step, and a
 *    genuine 409 race must re-fetch the existing id.
 */
import {
  type CallDynamicFn,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import {
  createContactsClient,
  type ContactEntity,
  type ContactsRouter,
  type ListResponse,
} from '../client.js';

function ok<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

function conflict<T>(message: string): CallResult<T> {
  return { kind: 'conflict', pillar: 'contacts', message };
}

function proc<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Promise<CallResult<Output>>
): CallableProcedure<Args, Output> {
  const orThrow = async (...args: Args): Promise<Output> => {
    const result = await fn(...args);
    if (result.kind !== 'ok') throw new Error(`stub orThrow: ${result.kind}`);
    return result.value;
  };
  return Object.assign(fn, { orThrow });
}

const callDynamic: CallDynamicFn = () => {
  throw new Error('callDynamic is not used by the contacts client');
};

interface StubImpls {
  list: (input: {
    search?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }) => Promise<CallResult<ListResponse>>;
  get?: (input: { id: string }) => Promise<CallResult<{ data: ContactEntity }>>;
  create?: (input: {
    name: string;
    type: string;
  }) => Promise<CallResult<{ data: ContactEntity; message: string }>>;
}

function unexpected(name: string): never {
  throw new Error(`stub ${name} called unexpectedly`);
}

function stubHandle(impls: StubImpls): PillarHandle<ContactsRouter> {
  return {
    entities: {
      list: proc(impls.list),
      get: proc(impls.get ?? (() => unexpected('entities.get'))),
      create: proc(impls.create ?? (() => unexpected('entities.create'))),
    },
    callDynamic,
  };
}

function entity(over: Partial<ContactEntity> & { id: string; name: string }): ContactEntity {
  return {
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function page(data: ContactEntity[], hasMore: boolean, offset = 0): CallResult<ListResponse> {
  return ok({ data, pagination: { total: data.length, limit: 200, offset, hasMore } });
}

describe('createContactsClient.fetchAllEntities — no-silent-cap paging', () => {
  it('pages until hasMore is false and concatenates every page', async () => {
    const pageA = [entity({ id: '1', name: 'Alpha' }), entity({ id: '2', name: 'Bravo' })];
    const pageB = [entity({ id: '3', name: 'Charlie' })];
    const list = vi.fn(async (input: { offset?: number }) =>
      (input.offset ?? 0) === 0 ? page(pageA, true) : page(pageB, false, 200)
    );
    const client = createContactsClient(() => stubHandle({ list }));

    const all = await client.fetchAllEntities();

    expect(all.map((e) => e.id)).toEqual(['1', '2', '3']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('WARNS and returns a truncated set when the safety cap is hit with rows remaining', async () => {
    const list = vi.fn(async (input: { offset?: number }) =>
      page([entity({ id: String(input.offset ?? 0), name: 'Endless' })], true, input.offset ?? 0)
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createContactsClient(() => stubHandle({ list }), { maxPages: 3 });

    const all = await client.fetchAllEntities();

    expect(all).toHaveLength(3);
    expect(list).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('safety cap'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRUNCATED'));
    warn.mockRestore();
  });

  it('degrades to an empty set (no throw) when a list page is not ok', async () => {
    const list = vi.fn(async (): Promise<CallResult<ListResponse>> => conflict('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const client = createContactsClient(() => stubHandle({ list }));

    expect(await client.fetchAllEntities()).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('degraded'));
    warn.mockRestore();
  });
});

describe('createContactsClient.createOrFetchByName — robust against case-sensitive contacts', () => {
  it('creates a new contact when no name matches (created=true)', async () => {
    const fresh = entity({ id: 'new-1', name: 'Acme' });
    const create = vi.fn(async () => ok({ data: fresh, message: 'Created' }));
    const list = vi.fn(async () => page([], false));
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await client.createOrFetchByName('Acme', 'company');

    expect(result).toEqual({ id: 'new-1', name: 'Acme', created: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reuses a CASE-VARIANT existing contact via fetch-first, never calling create', async () => {
    const existing = entity({ id: 'acme-id', name: 'ACME' });
    const create = vi.fn(() => unexpected('entities.create'));
    const list = vi.fn(async () => page([existing], false));
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await client.createOrFetchByName('acme', 'company');

    expect(result).toEqual({ id: 'acme-id', name: 'ACME', created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('tolerates a 409 race: fetch-first misses, create 409s, re-fetch resolves (created=false)', async () => {
    const existing = entity({ id: 'raced-id', name: 'Globex' });
    let listCalls = 0;
    const list = vi.fn(async () => {
      listCalls += 1;
      return listCalls === 1 ? page([], false) : page([existing], false);
    });
    const create = vi.fn(
      async (): Promise<CallResult<{ data: ContactEntity; message: string }>> =>
        conflict("Entity with name 'Globex' already exists")
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    const result = await client.createOrFetchByName('Globex', 'company');

    expect(result).toEqual({ id: 'raced-id', name: 'Globex', created: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('throws when create fails for a non-conflict reason (contacts down)', async () => {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(
      async (): Promise<CallResult<{ data: ContactEntity; message: string }>> => ({
        kind: 'unavailable',
        pillar: 'contacts',
      })
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    await expect(client.createOrFetchByName('Anything', 'company')).rejects.toThrow(
      'contacts pillar unavailable'
    );
  });

  it('throws when a 409 is reported but no existing contact can be re-fetched', async () => {
    const list = vi.fn(async () => page([], false));
    const create = vi.fn(
      async (): Promise<CallResult<{ data: ContactEntity; message: string }>> => conflict('phantom')
    );
    const client = createContactsClient(() => stubHandle({ list, create }));

    await expect(client.createOrFetchByName('Ghost', 'company')).rejects.toThrow(
      'but no existing contact found'
    );
  });
});
