/**
 * A user-defined tag scoped to the lists pillar. Tags are pillar-local by
 * design — cross-pillar references go through the URI layer
 * (`pops:lists/tag/<id>`), never a shared `Tag` type. Mirrors the API
 * response (camelCase) for the lists pillar.
 *
 * No `tags` table exists in `@pops/lists-db` yet — the contract pins the
 * intended shape downstream consumers should code against once the
 * persistence migration lands. `color` is nullable because not every tag
 * is colour-coded in the UI.
 */
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  /** ISO-8601 timestamp. Validated by `TagSchema` via `.datetime()`. */
  lastEditedTime: string;
}
