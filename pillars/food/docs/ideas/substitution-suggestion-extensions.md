# Substitution suggestion extensions

Forward-looking extensions to cook-time substitutions (the picker + `resolve-line` resolver are shipped — see `../prds/cook-time-substitutions/`). None of the below is built.

## Suggestions outside the cook modal

Surface "what can I use instead?" on the recipe detail page next to each ingredient line, before the user ever opens the cook modal. Today substitutions are only reachable by hitting a shortfall (or opening the batch-override picker) inside the cook flow. A per-line "alternative ingredients" preview would need a read-only variant of `resolve-line` that doesn't require an open cook session.

## Multi-hop substitution chains

Allow A→B→C resolution when no direct A→C edge exists but A→B and B→C do. The current resolver and the underlying graph are single-hop by rule. Multi-hop needs cycle detection, a hop cap, and compounded-ratio math (`ratio_AC = ratio_AB × ratio_BC`), plus a UI affordance to explain the chain.

## Ranking by historical picks

Rank the Substitutions section by which subs the user has actually chosen in the past, not just ratio/tag/expiry heuristics. Requires an event log of past substitution selections (which `substitutionEdgeId` won for which line/recipe) and a scoring pass that folds frequency/recency into the existing ranking key.

## One-click "cook with default subs"

Auto-apply the top-ranked substitution for every shortfall line in one action, instead of forcing the user to pick each line. Would need a per-recipe or per-ingredient notion of a "default" substitute and a confirmation surface showing every auto-pick before commit.

## Yield-side substitution

Suggest alternative _outputs_ ("this recipe yields X; it could yield Y instead") rather than alternative inputs. Orthogonal to the ingredient-input substitution graph; would need a separate yield-substitution model.
