# Idea: DSL resolver slug suggestions ("did you mean…?")

When the recipe DSL resolver fails to resolve a slug — an unknown `prep_state` slug, or a step-body `@slug` that matches no known ingredient/recipe — it currently emits a `proposedSlug` with only the raw text and a best-guess `suggestedKind`. The review queue (Epic 03) surfaces those, but with no candidate corrections.

Add fuzzy-match suggestions so the resolver (or the review-queue renderer) can offer concrete alternatives.

## Build later

- On an unresolved slug, run a Levenshtein (or trigram) similarity pass over existing slugs in `slug_registry` scoped to the expected `kind` (prep_state suggestions only from prep_state slugs, etc.).
- Return the top N candidates above a similarity threshold on the `ProposedSlug` (e.g. `suggestions: { slug: string; distance: number }[]`), so callers don't re-query.
- Keep the resolver deterministic and read-only — suggestions are derived from the same `slug_registry` snapshot.
- Surface in the review queue as "did you mean `mashed`?" one-click corrections.

## Why deferred

The resolver's job is to resolve-or-flag; suggestion ranking is a UX nicety layered on the `proposedSlugs` channel. The channel already exists, so this is additive and can ship without touching the resolution algorithm.
