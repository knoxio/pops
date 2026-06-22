/**
 * One-shot deploy step: migrate core's `entities` into the contacts pillar
 * (PRD-163 N4). Reads the full core entity set over the pillar SDK and creates
 * each contact create-or-fetch-by-name (idempotent — safe to re-run). Does NOT
 * run automatically; invoke explicitly:
 *
 *   POPS_REGISTRY_URL=http://core-api:3001 \
 *   POPS_INTERNAL_API_KEY=... \
 *   pnpm --filter @pops/finance exec tsx scripts/migrate-core-entities.ts
 *
 * Core keeps serving `/entities` during the transition, so the source stays
 * readable while contacts becomes authoritative. Exits non-zero on any hard
 * failure so a deploy pipeline can halt.
 */
import { isOk, pillar, type CallResult } from '@pops/pillar-sdk/server';

import {
  migrateCoreEntities,
  type ContactCreateBody,
  type CoreEntity,
  type MigrateOutcome,
} from '../src/api/contacts/migrate-core-entities.js';

const PAGE_SIZE = 200;
/**
 * Safety cap on the read sweep — a backstop against a runaway loop, NOT a
 * dataset cap. At `PAGE_SIZE` per page this is 1M entities. The migrator must
 * copy the FULL core set, so hitting this cap with rows still available is a
 * hard failure (throws → non-zero exit) rather than a silent tail-drop, letting
 * deploy automation halt safely.
 */
const MAX_PAGES = 5000;

type CoreRouter = {
  entities: {
    list: (input: {
      limit: number;
      offset: number;
    }) => Promise<{ data: CoreEntity[]; pagination: { hasMore: boolean } }>;
  };
};

type ContactsRouter = {
  entities: {
    create: (body: ContactCreateBody) => Promise<{ data: { id: string }; message: string }>;
  };
};

/** Read the whole core entity set by paging `entities.list` until exhausted. */
async function readAllCoreEntities(): Promise<CoreEntity[]> {
  const core = pillar<CoreRouter>('registry');
  const all: CoreEntity[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await core.entities.list({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    if (!isOk(result)) {
      throw new Error(`core entities.list failed: ${describe(result)}`);
    }
    all.push(...result.value.data);
    if (!result.value.pagination.hasMore) return all;
  }
  throw new Error(
    `core entities.list sweep hit the ${MAX_PAGES}-page safety cap with more rows still ` +
      `available after ${all.length} entities — refusing to migrate a TRUNCATED set; raise ` +
      `MAX_PAGES and re-run`
  );
}

/** Create a contact, mapping a 409 dup-name to an idempotent skip. */
async function createContact(body: ContactCreateBody): Promise<MigrateOutcome> {
  const result = await pillar<ContactsRouter>('contacts').entities.create(body);
  if (isOk(result)) return 'created';
  if (result.kind === 'conflict') return 'already-exists';
  throw new Error(`contacts entities.create failed for "${body.name}": ${describe(result)}`);
}

function describe(result: CallResult<unknown>): string {
  if (isOk(result)) return 'ok';
  return 'message' in result && result.message ? `${result.kind} (${result.message})` : result.kind;
}

async function main(): Promise<void> {
  const summary = await migrateCoreEntities({
    readCoreEntities: readAllCoreEntities,
    createContact,
  });
  console.warn(
    `[migrate-core-entities] done — total=${summary.total} created=${summary.created} ` +
      `alreadyExisted=${summary.alreadyExisted}`
  );
}

main().catch((err: unknown) => {
  console.error('[migrate-core-entities] FAILED:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
