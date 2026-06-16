/**
 * Handlers for the `list.*` ts-rest sub-router (header CRUD + aggregate).
 *
 * Each per-route arrow is intentionally tiny; common error-mapping goes
 * through `tryMapServiceError`. Returned from a factory so we can close
 * over the per-process drizzle handle without leaking it through Express.
 */
import {
  archiveList,
  createList,
  deleteList,
  getList,
  listItemsService,
  ListNotFoundError,
  unarchiveList,
  updateList,
} from '../../db/index.js';
import { selectListAggregate } from '../services/aggregate.js';
import { tryMapServiceError } from './error-mapping.js';

import type { ListsDb } from '../../db/index.js';

interface ConflictBody {
  message: string;
  code?: string;
}

function toConflictBody(err: unknown): ConflictBody | null {
  const mapped = tryMapServiceError(err);
  if (mapped?.status === 409) return { message: mapped.body.message, code: mapped.body.code };
  return null;
}

function toNotFoundBody(err: unknown): ConflictBody | null {
  const mapped = tryMapServiceError(err);
  if (mapped?.status === 404) return mapped.body;
  return null;
}

export function makeListHandlers(db: ListsDb) {
  return {
    listAggregate: async ({
      query,
    }: {
      query: {
        kinds?: ('shopping' | 'packing' | 'todo' | 'generic')[];
        includeArchived?: boolean;
        sort?: 'updated' | 'name' | 'created';
      };
    }) => {
      const items = selectListAggregate(db, {
        kinds: query.kinds,
        includeArchived: query.includeArchived,
        sort: query.sort,
      });
      return { status: 200 as const, body: { items: [...items] } };
    },

    get: async ({ params }: { params: { id: number } }) => {
      const list = getList(db, params.id);
      if (list === null) return { status: 200 as const, body: null };
      const items = listItemsService.listItemsForList(db, params.id);
      return { status: 200 as const, body: { list, items: [...items] } };
    },

    create: async ({
      body,
    }: {
      body: {
        name: string;
        kind: 'shopping' | 'packing' | 'todo' | 'generic';
        ownerApp?: string;
      };
    }) => {
      try {
        const row = createList(db, {
          name: body.name,
          kind: body.kind,
          ownerApp: body.ownerApp ?? 'user',
        });
        return { status: 201 as const, body: { id: row.id } };
      } catch (err) {
        const conflict = toConflictBody(err);
        if (conflict !== null) return { status: 400 as const, body: conflict };
        throw err as Error;
      }
    },

    update: async ({
      params,
      body,
    }: {
      params: { id: number };
      body: { name?: string; kind?: 'shopping' | 'packing' | 'todo' | 'generic' };
    }) => {
      try {
        updateList(db, params.id, { name: body.name, kind: body.kind });
        return { status: 200 as const, body: { ok: true as const } };
      } catch (err) {
        if (err instanceof ListNotFoundError) {
          return {
            status: 200 as const,
            body: { ok: false as const, reason: 'NotFound' as const },
          };
        }
        throw err as Error;
      }
    },

    archive: async ({ params }: { params: { id: number } }) => {
      try {
        archiveList(db, params.id);
        return { status: 200 as const, body: { ok: true as const } };
      } catch (err) {
        const notFound = toNotFoundBody(err);
        if (notFound !== null) return { status: 404 as const, body: notFound };
        throw err as Error;
      }
    },

    unarchive: async ({ params }: { params: { id: number } }) => {
      try {
        unarchiveList(db, params.id);
        return { status: 200 as const, body: { ok: true as const } };
      } catch (err) {
        const notFound = toNotFoundBody(err);
        if (notFound !== null) return { status: 404 as const, body: notFound };
        throw err as Error;
      }
    },

    delete: async ({ params }: { params: { id: number } }) => {
      const existing = getList(db, params.id);
      if (existing === null) {
        return {
          status: 404 as const,
          body: { message: `List #${params.id} not found`, code: 'NOT_FOUND' },
        };
      }
      deleteList(db, params.id);
      return { status: 200 as const, body: { ok: true as const } };
    },
  };
}
