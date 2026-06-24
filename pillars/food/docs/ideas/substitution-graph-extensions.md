# Idea: Substitution graph extensions

Forward-looking work deliberately excluded from the shipped [substitution-model](../prds/substitution-model/README.md). The base graph, CRUD, cook-time resolver, and one-hop solver are done; these are the next layers.

## Multi-hop substitution chaining

Today the resolver caps search depth at one hop — A→B→C is never auto-resolved; the user picks a single sub. A future version could offer transitive chains (with a depth cap and a confidence/penalty per hop, since stacking ratios and context constraints compounds error). Open questions: how to rank a 2-hop chain against a worse 1-hop, how to present compounded ratios, and how to avoid cycles.

## Curated context-tag vocabulary

Context tags are freeform strings. A typo (`sourry` for `savory`) is stored as-is and silently never matches. Build a canonical vocabulary with a merge/rename UI, autocomplete on the create form, and a one-off cleanup pass that maps existing freeform tags onto the canon. Consider whether the canon is enforced (reject unknown tags) or advisory (warn + allow).

## Substitution suggestions from cook history / ML

Mine actual cook-and-override history (which subs users accepted when short on an ingredient) to suggest new edges, ratios, and context tags, instead of relying entirely on hand-authored edges. Could surface "people who ran out of X used Y" candidates in the create form, or auto-propose edges for review.

## Substitution-aware shopping-list math

When a recipe line is covered by a sub rather than the canonical ingredient, the shopping list should reflect the substitute's qty (original × ratio) and unit, not the original's. Cross-cuts the shopping/list-export surface.

## Bidirectional-edge ergonomics

Bidirectional subs are two unlinked rows. The UI prompts to create the reverse, but nothing keeps the pair in sync (edit one ratio, the inverse drifts). Consider an optional linked-pair concept or a "create both directions" affordance that derives the inverse ratio.
