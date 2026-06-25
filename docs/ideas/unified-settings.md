# Unified Settings — unbuilt extensions

Captured from the original unified-settings acceptance criteria that the shipped federated settings system does **not** implement. The built system is documented at [foundation/prds/unified-settings](../themes/foundation/prds/unified-settings.md).

## Legacy route redirects

The original PRD specified that old per-pillar settings routes redirect into the unified page with the section anchored:

- `/media/plex` → `/settings#media.plex`
- `/media/arr` → `/settings#media.arr`
- `/media/rotation` → `/settings#media.rotation`
- `/ai/config` → `/settings#ai.config`

None of these redirects exist in the shell router. The greenfield architecture never shipped the standalone settings pages those routes pointed at, so there is nothing to redirect from — `/settings` is the sole entry point. If old bookmarks ever need to resolve, add `Navigate` redirects in the shell router keyed on the manifest `id`.

## Server-side `envFallback` resolution

Today `envFallback` is a UI-only affordance: when a key has no stored value the field shows "Using environment variable {name}", but no layer actually reads that env var into the effective value. `GET /settings` resolves override → manifest default → empty string and stops.

Unbuilt: a resolution tier where the federated `list`/`get`/`getMany` handlers fall back to the named env var (still redacting if sensitive) so a consumer reading the setting transparently gets the env value when no override is stored. This would make `envFallback` a real precedence rule (`override > env > default`) instead of a label.

## Appearance / theme migration

The `theme` key remains outside the unified page. Folding appearance settings (theme, density, accent) into a shell-owned `shell.appearance` settings section — so theme lives in `/settings` alongside everything else — was deferred and never built.

## Cross-section settings search

A search box over all sections/fields (filter the sidebar + jump to a matching field) was listed as a future enhancement and is not built. The page navigates by section only.

## Import / export, history, audit

Bulk export of all pillars' settings to a portable bundle, re-import, a change history / audit trail, and per-user settings were all out of scope for the single-user system and remain unbuilt.
