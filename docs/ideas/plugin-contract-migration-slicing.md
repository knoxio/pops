# Plugin Contract — deferred slots (migration slicing, `dependsOn`)

Carved out of the [Plugin Contract PRD](../themes/foundation/prds/plugin-contract.md). These were specified against the old shared-database monolith and never landed in a form that survives the per-pillar-database federation. They stay here until a real driver appears.

## Per-pillar migration slicing

**Original intent (monolith era):** a partial install (`POPS_APPS=finance`) should run only the installed modules' SQL migrations so absent modules don't leave their tables on disk. Each module would declare the migration tags it owns; the runner would walk the shared journal and apply only entries whose owning module is in the install set, warning on orphan tags for a removed module.

**Why it's obsolete as written:** in the current architecture every pillar owns its **own** SQLite database. There is no shared `pops.db` and no shared migration journal to slice. A pillar runs its own migrations against its own DB on its own boot; an absent pillar's container never starts, so its tables never get created. The "tables for absent modules consume space on a shared disk" problem the slicing was solving does not exist.

**What partially shipped under the monolith (now superseded):** the migration runner could skip absent-module entries without recording them, re-apply previously-skipped tags when a module was re-enabled, and warn on orphan tags. Fresh-database schema slicing (zero tables for absent modules in a brand-new file) and the migration-generation workflow writing into per-module locations were both deferred even then — the legacy schema initialiser predated modularisation and created every table at init.

**If revived:** the only meaningful surface left is a per-pillar concern — each pillar's own migration tooling, owned inside that pillar, not a platform-level slicer. There is nothing cross-cutting to specify here unless a future "bridge pillar" hosts multiple logical domains in one database.

## `dependsOn` with registry-side fail-fast

**Original intent:** a manifest declares `dependsOn: ['finance']`; the registry build (or boot) fails fast with a clear message when a declared dependency is absent from the install set, instead of surfacing as a confusing runtime error after a partial boot.

**Current state:** the in-repo `ModuleManifest` type (`@pops/types`) still carries an optional `dependsOn` slot, but the **wire** manifest (`ManifestPayload`) does not, and neither the registry register handler nor `@pops/module-registry`'s build enforces it. A pillar can register without its dependencies being present, and nothing fails fast.

**If revived:** add a `dependsOn` array to `ManifestPayloadSchema`, then enforce it in two places — the build-time validator (in-repo set) and the registry register handler (live federation), the latter resolving against the current snapshot. Decide the failure mode: reject the registration outright vs. accept-but-mark-degraded. Rejection is cleaner for the in-repo build; degraded-marking is friendlier for a live federation where a dependency pillar may just be slow to come up. Until a pillar genuinely needs a hard runtime dependency on another, this stays unbuilt.
