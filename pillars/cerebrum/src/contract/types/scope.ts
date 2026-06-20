/**
 * A cerebrum scope — a hierarchical container engrams attach to. Mirrors
 * the API response (camelCase) for the cerebrum pillar.
 *
 * Contract shape diverges from the live runtime `Scope`
 * (`apps/pops-api/src/modules/cerebrum/engrams/scope-schema.ts`), which
 * is a parsed dotted-path value object (`raw`/`segments`/`depth`/...)
 * with no persistent identity. The contract pins a tree-shaped entity
 * (`id`/`parentId`) so downstream consumers can reference, edit, and
 * render scopes as first-class records. The row mapper translates from
 * the dotted-path representation to this tree shape.
 */
export interface Scope {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  /** ISO-8601 timestamp. Validated by `ScopeSchema` via `.datetime()`. */
  lastEditedTime: string;
}
