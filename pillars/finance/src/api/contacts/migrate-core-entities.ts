/**
 * One-shot, IDEMPOTENT migrator: copy the legacy `entities` rows into the
 * contacts pillar. Reads the full source entity set over the SDK and creates
 * each as a contact, create-or-fetch-by-name so a re-run is a no-op (a 409
 * dup-name is treated as "already migrated"). Does NOT auto-run — it is a
 * deploy step invoked by `scripts/migrate-core-entities.ts`.
 */

/** A core entity in its wire shape (core's `EntitySchema`). */
export interface CoreEntity {
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

/** The body `POST /entities` (contacts `CreateEntityBody`) accepts. */
export interface ContactCreateBody {
  name: string;
  type: string;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
}

/** Outcome of one create-or-fetch-by-name attempt. */
export type MigrateOutcome = 'created' | 'already-exists';

/** Reads core's entities, one page (or the whole set) at a time. */
export type CoreEntityReader = () => Promise<CoreEntity[]>;

/**
 * Creates a contact, returning `'created'` on success or `'already-exists'`
 * when the name already exists (409 → idempotent skip). Any other failure
 * throws so the migration aborts loudly rather than silently dropping a row.
 */
export type ContactCreator = (body: ContactCreateBody) => Promise<MigrateOutcome>;

export interface MigrateSummary {
  total: number;
  created: number;
  alreadyExisted: number;
}

/**
 * Map a core entity to the contacts create body. Pure and total: every field is
 * carried byte-for-byte (the two pillars share the same wire shape), so a
 * migrated contact reads identically to its core origin. The `id`/`lastEditedTime`
 * are intentionally NOT carried — contacts assigns its own id and stamps its own
 * edit time on create, matching how every other contact is born.
 */
export function coreEntityToContactCreate(entity: CoreEntity): ContactCreateBody {
  return {
    name: entity.name,
    type: entity.type,
    abn: entity.abn,
    aliases: entity.aliases,
    defaultTransactionType: entity.defaultTransactionType,
    defaultTags: entity.defaultTags,
    notes: entity.notes,
  };
}

/**
 * Run the migration: read the core entity set, create each in contacts
 * (create-or-fetch-by-name). Idempotent — re-running skips names that already
 * exist. Returns a summary for the deploy log.
 */
export async function migrateCoreEntities(deps: {
  readCoreEntities: CoreEntityReader;
  createContact: ContactCreator;
}): Promise<MigrateSummary> {
  const entities = await deps.readCoreEntities();
  let created = 0;
  let alreadyExisted = 0;

  for (const entity of entities) {
    const outcome = await deps.createContact(coreEntityToContactCreate(entity));
    if (outcome === 'created') created++;
    else alreadyExisted++;
  }

  return { total: entities.length, created, alreadyExisted };
}
