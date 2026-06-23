# Tag management & canonicalisation (food)

Forward-looking extensions on top of the shipped store-section taxonomy (`ingredient_tags` table, REST `ingredientTags` contract, per-ingredient chip editor, read-only Tags vocabulary tab). None of these is built today.

## Bulk multi-select tag editor

The Ingredients tab is a tree-view + detail panel with no multi-select column. A bulk editor — select N ingredients, apply/remove a tag across all of them in one action — needs a multi-select affordance on that tab first. Build that, then a batch `set`/`add`/`remove` path (could be a new `POST /ingredient-tags/bulk` endpoint wrapping a single transaction). Today users tag one ingredient at a time; the autocomplete makes it tolerable but not bulk.

## Tag rename / merge

The vocabulary tab is read-only. There is no native rename. Renaming `store-section:Produce` → `store-section:produce` (or merging two near-duplicates) is currently a manual full-set replace per affected ingredient. Add a rename/merge mutation that rewrites the tag across every ingredient carrying it in one transaction, plus the UI on the vocabulary tab to trigger it from a drill-down row.

## Canonicalisation suggestions ("did you mean…")

Lowercase-on-insert catches the common case, but typos and near-duplicates (`store-section:prodcue`) still fragment the vocabulary. Suggest the closest existing tag when the user types a near-match — surfaced inline in the chip editor and as a drift warning on the vocabulary tab.

## Tag-based recipe search

The schema already enables it ("show me recipes whose ingredients are all `diet:vegan`"). No query path or UI exists. Would join `ingredient_tags` against recipe lines and filter by namespace.

## Per-variant tags

Variants (`chicken-breast` vs `chicken-thigh`) inherit the parent ingredient's tags conceptually; the table keys on `ingredient_id` only. Variant-level granularity would need either a parallel `variant_tags` table or a nullable `variant_id` on this one, plus downstream queries that resolve the precedence.

## Other deferred surfaces

- Bulk import of tags from CSV.
- Tag analytics ("how many of my recipes use `store-section:produce` ingredients").
- LLM-assisted auto-tagging of the whole ingredient library.
- Cross-domain tag sharing (finance / inventory namespaces on a shared store).
- Enforced namespace schemas (validated allow-lists per namespace) — today the namespace is convention only.
