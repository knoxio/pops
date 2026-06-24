# Idea: Recipe CRUD Extensions

Forward-looking extensions on top of the shipped recipe CRUD pages (`prds/recipe-crud-pages`). None of these are built today; the shipped surface is list + detail + new + edit + drafts + historic-version pages backed by the `recipes.*` REST endpoints.

## Stale-slug redirect on rename

When a recipe's slug changes (the DSL `@recipe(slug=...)` is the source of truth and a save may rename the recipe), a previously-bookmarked URL `/food/recipes/<old-slug>` should resolve. Today `GET /recipes/:slug` returns a not-found for an unknown slug with no redirect; pages render their generic not-found state. A future version would keep a slug-history map (or reuse the pillar slug registry) and have the server respond with a redirect to the new canonical slug, so stale URLs and external links survive renames.

## "Recently cooked" sort

The list endpoint accepts `sort='recentlyCooked'` but falls back to `createdAtDesc` because no cook-event timestamps exist to join on. Once cook-run history (`recipe_runs.completed_at`) is populated, this sort should order the list by most-recently-cooked, surfacing the dishes you actually make. Cross-domain with the cook-event recording work.

## Mobile editor drawer mode

The recipe pages are mobile-readable (list cards stack, detail reflows, action menus honour tap-target sizes), but the edit page mounts the desktop DSL editor on mobile. A dedicated mobile editing mode — autocomplete in a bottom drawer, larger touch targets for token insertion — belongs to the DSL-editor surface and would make on-phone recipe editing comfortable.

## End-to-end flow test

The New → Edit → Promote → Detail flow is covered by component/integration tests, but not by a real browser end-to-end run against a live pillar + shell. A Playwright suite (seeded fixture + the food pillar's HTTP server) would catch wiring regressions across the route → endpoint → DB → render path that unit tests miss.

## Recipe duplication

"Copy this recipe to a new slug" — clone an existing recipe's current DSL into a brand-new recipe under a fresh slug, as a starting point for a variation. Distinct from "restore as new draft" (which forks a version of the _same_ recipe).

## Auto-save / unsaved-changes protection

The editor has no auto-save: navigating away loses an unsaved draft beyond the browser's generic navigate-away dialog. A future version would persist editor state (per draft, per session) so an accidental refresh or navigation does not discard work.

## Recipe export

Download a recipe as a portable `.recipe` file (the DSL body plus metadata) for backup or sharing. Read-only projection; no import path on the New page yet (ingest is a separate entry point).
