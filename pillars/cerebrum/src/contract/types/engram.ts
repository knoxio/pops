/**
 * A cerebrum engram — a memory unit the cerebrum pillar stores. Mirrors
 * the API response (camelCase) for the cerebrum pillar.
 *
 * Contract shape is narrower than the live persistence row: the runtime
 * type today (`apps/pops-api/src/modules/cerebrum/engrams/types.ts`)
 * carries filesystem/template-registry/scope-rule-engine internals
 * (`filePath`, `contentHash`, `wordCount`, `customFields`, `template`,
 * `status`, `source`, etc.) that are deliberately not part of the wire
 * surface. It also exposes multiple `scopes` and `tags` arrays where the
 * contract pins a single `scopeId` reference and a stable `tagIds`
 * reference list. The runtime API today emits the legacy fields; this
 * contract pins the intended shape downstream consumers should code
 * against. The row mapper translates.
 */
export interface Engram {
  id: string;
  content: string;
  parentId: string | null;
  /**
   * Stable identifiers for the tags attached to this engram. Empty array
   * when the engram has no tags. Order is preserved from the source row.
   */
  tagIds: readonly string[];
  scopeId: string | null;
  /** ISO-8601 timestamp. Validated by `EngramSchema` via `.datetime()`. */
  createdAt: string;
  /** ISO-8601 timestamp. Validated by `EngramSchema` via `.datetime()`. */
  lastEditedTime: string;
}
