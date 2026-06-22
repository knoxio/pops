/**
 * In-memory fake of the contacts pillar client for finance integration tests.
 *
 * Implements {@link ContactsClient} over a seeded array so the live-fetch paths
 * (matcher, entity-usage join, commit pre-create, tag-suggester) run without a
 * real contacts pillar. `unavailable: true` makes every read return an empty
 * set and every create throw — exercising the OD-3/OD-8 degradation branches.
 */
import { randomUUID } from 'node:crypto';

import {
  ContactsUnavailableError,
  type ContactEntity,
  type ContactsClient,
  type CreateOrFetchResult,
} from '../contacts/client.js';

export interface SeedContact {
  id?: string;
  name: string;
  type?: string;
  abn?: string | null;
  aliases?: string[];
  defaultTransactionType?: string | null;
  defaultTags?: string[];
  notes?: string | null;
  lastEditedTime?: string;
}

export interface ContactsFake extends ContactsClient {
  /** The current contact set (mutated by create-or-fetch). */
  readonly entities: ContactEntity[];
  /** Names passed to `createOrFetchByName`, in order, for assertions. */
  readonly created: { name: string; type: string }[];
}

function toEntity(seed: SeedContact): ContactEntity {
  return {
    id: seed.id ?? randomUUID(),
    name: seed.name,
    type: seed.type ?? 'company',
    abn: seed.abn ?? null,
    aliases: seed.aliases ?? [],
    defaultTransactionType: seed.defaultTransactionType ?? null,
    defaultTags: seed.defaultTags ?? [],
    notes: seed.notes ?? null,
    lastEditedTime: seed.lastEditedTime ?? '2026-01-01T00:00:00.000Z',
  };
}

export interface ContactsFakeOptions {
  seed?: SeedContact[];
  /** When true, every read returns `[]` and every create throws (contacts down). */
  unavailable?: boolean;
}

export function makeContactsFake(options: ContactsFakeOptions = {}): ContactsFake {
  const entities = (options.seed ?? []).map(toEntity);
  const created: { name: string; type: string }[] = [];
  const unavailable = options.unavailable ?? false;

  function filter(query: { search?: string; type?: string }): ContactEntity[] {
    const search = query.search?.toLowerCase();
    return entities.filter((e) => {
      if (query.type && e.type !== query.type) return false;
      if (search && !e.name.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  return {
    entities,
    created,
    async fetchAllEntities(query = {}): Promise<ContactEntity[]> {
      return unavailable ? [] : filter(query);
    },
    async fetchEntityDefaultTags(entityId: string): Promise<string[]> {
      if (unavailable) return [];
      return entities.find((e) => e.id === entityId)?.defaultTags ?? [];
    },
    async createOrFetchByName(name: string, type: string): Promise<CreateOrFetchResult> {
      created.push({ name, type });
      if (unavailable) throw new ContactsUnavailableError('unavailable');
      const existing = entities.find((e) => e.name.toLowerCase() === name.toLowerCase());
      if (existing) return { id: existing.id, name: existing.name };
      const fresh = toEntity({ name, type });
      entities.push(fresh);
      return { id: fresh.id, name: fresh.name };
    },
  };
}
