/**
 * Key/value setting exposed by the core pillar's `settings` surface.
 *
 * Mirrors the live `apps/pops-api/src/modules/core/settings/types.ts`
 * `Setting` shape, which is intentionally minimal: the live API only
 * surfaces `{ key, value }` and the `settings` table itself
 * (`packages/db-types/src/schema/settings.ts`) has no other columns.
 *
 * The task brief speculatively listed `id`, `scope`, and `lastEditedTime`
 * — none of those exist on the live wire shape. Following the contract
 * rule "mirror what core-api actually exposes", the contract pins the
 * minimal shape rather than inventing new fields. Once the storage layer
 * grows additional columns the contract bumps in lockstep.
 */
export interface Setting {
  key: string;
  value: string;
}
