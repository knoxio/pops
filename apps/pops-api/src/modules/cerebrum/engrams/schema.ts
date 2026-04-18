/**
 * Engram Zod schemas.
 *
 * A single source of truth for both the file-format validator (used when
 * parsing Markdown files on disk) and the API input validators (used at the
 * tRPC layer). Shared so that a well-formed API call always round-trips to a
 * well-formed engram file.
 */
import { z } from 'zod';

export const ENGRAM_STATUSES = ['active', 'archived', 'consolidated', 'stale'] as const;
export type EngramStatus = (typeof ENGRAM_STATUSES)[number];

export const ENGRAM_SOURCES = ['manual', 'agent', 'moltbot', 'cli'] as const;
/**
 * Source of an engram. Plain values are the fixed channels; `plexus:{name}`
 * is a namespaced prefix for plugin-driven ingestion.
 */
export const engramSourceSchema = z
  .string()
  .refine(
    (value): value is EngramSource =>
      (ENGRAM_SOURCES as readonly string[]).includes(value) || value.startsWith('plexus:'),
    { message: "source must be one of 'manual|agent|moltbot|cli' or 'plexus:{name}'" }
  );
export type EngramSource = (typeof ENGRAM_SOURCES)[number] | `plexus:${string}`;

/**
 * A minimal ISO-8601 validator. Accepts an offset or 'Z'. We don't enforce
 * milliseconds so `Date#toISOString` and editor-written values both pass.
 */
export const iso8601Schema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/,
    'must be an ISO 8601 timestamp with timezone'
  );

export const ENGRAM_ID_PATTERN = /^eng_\d{8}_\d{4}_[a-z0-9-]+$/;
export const engramIdSchema = z
  .string()
  .regex(ENGRAM_ID_PATTERN, 'must match eng_{YYYYMMDD}_{HHmm}_{slug}');

/** Engram frontmatter — canonical shape of the YAML block in any `.md` file. */
export const engramFrontmatterSchema = z
  .object({
    id: engramIdSchema,
    type: z.string().min(1),
    scopes: z.array(z.string().min(1)).min(1, 'at least one scope is required'),
    created: iso8601Schema,
    modified: iso8601Schema,
    source: engramSourceSchema,
    tags: z.array(z.string().min(1)).optional(),
    links: z.array(engramIdSchema).optional(),
    status: z.enum(ENGRAM_STATUSES),
    template: z.string().min(1).optional(),
  })
  .passthrough();
// `.passthrough()` preserves template-defined custom fields on the frontmatter
// object so the CRUD service can store them in `custom_fields` without losing
// unknown keys.

export type EngramFrontmatter = z.infer<typeof engramFrontmatterSchema>;

/** Status transitions enforced at the service layer. */
const STATUS_TRANSITIONS: Record<EngramStatus, readonly EngramStatus[]> = {
  active: ['archived', 'consolidated', 'stale'],
  archived: ['active'],
  consolidated: [],
  stale: [],
};

export function canTransitionStatus(from: EngramStatus, to: EngramStatus): boolean {
  if (from === to) return true;
  return STATUS_TRANSITIONS[from].includes(to);
}
