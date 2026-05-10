/**
 * Capability — typed RBAC scope identifier (PRD-101).
 *
 * Capabilities supersede the free-form `provides: string[]` slot from PRD-098.
 * They are the surface a future RBAC layer will consume; PRD-101 only defines
 * the type and aggregates them into the `ModuleManifest`. No enforcement is
 * wired in this PRD.
 *
 * Shape: `${ModuleId}.${string}` — namespaced under the owning module so
 * `finance.transaction.read` cannot collide with `media.transaction.read`,
 * and a typo at the module boundary is a type error rather than silent data.
 *
 * `ModuleId` defaults to `string` so a manifest authored in isolation (i.e.
 * before the build-time registry from US-02 narrows the union) still
 * type-checks. Consumers that have access to the generated `ModuleId` union
 * (e.g. `@pops/module-registry`) can pass it explicitly:
 *
 * ```ts
 * type FinanceCap = Capability<'finance'>; // 'finance.${string}'
 * ```
 */
export type Capability<ModuleId extends string = string> = `${ModuleId}.${string}`;
