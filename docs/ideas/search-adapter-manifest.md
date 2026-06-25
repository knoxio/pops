# Idea: Roll search adapters out across the federation

Spun out of [Search Adapter Manifest](../themes/federation/prds/search-adapter-manifest.md). The
manifest schema, validator, and orchestrator selection gate are built and the
`contacts` pillar declares a real adapter end-to-end. What is **not** built is the
rollout across the rest of the federation, plus runtime use of the richer query
shape. These are the leftover rollout scope and the open design question.

## 1. Populate `search.adapters` on the remaining pillars

Today only `contacts` declares a non-empty `search.adapters`. Several pillars already
serve a `/search` handler (`<pillar>.search.search`) but declare
`search: { adapters: [] }`, so the orchestrator **does not federate them**.

| Pillar    | `/search` handler                                   | Adapter declared    | Federated today |
| --------- | --------------------------------------------------- | ------------------- | --------------- |
| contacts  | yes                                                 | yes                 | yes             |
| finance   | yes (transactions + budgets + wishlist, aggregated) | no (`adapters: []`) | no              |
| inventory | yes (items)                                         | no (`adapters: []`) | no              |
| media     | no                                                  | no                  | no              |
| cerebrum  | n/a                                                 | no                  | no              |

Work:

- **finance** — declare adapters for transactions / budgets / wishlist. The
  handler already concatenates all three into one flat ranked `hits` list; the
  manifest just needs the descriptors (each `procedurePath` must be added to
  `routes.queries` so the cross-field rule passes, or point at the existing
  `finance.search.search` route). This was the PRD's named "finance pilot" and
  is the highest-value first rollout.
- **inventory** — declare the `items` adapter against the existing handler.
- **media / cerebrum** — build the `/search` handler first, then declare adapters
  (movies / tv-shows for media; whatever cerebrum exposes). This was the
  "roll out to media / inventory / cerebrum" scope.

Acceptance: each rolled-out pillar's `build<Pillar>Manifest()` declares a non-empty
`search.adapters` whose `procedurePath`s are all declared routes, passes
`validateManifestPayload`, and appears in federated search results from the
orchestrator.

## 2. Runtime `queryShape` enforcement

The orchestrator carries the full adapter descriptor (`queryShape`, `rankFieldName`)
on each adapter but, per its own code comments, **does not yet use `queryShape` to
pre-filter fan-out targets**. A federated query with a date-range filter is still sent
to adapters whose `queryShape.supportsDateRange` is `false`.

Work:

- Use `queryShape.supportsText/supportsTags/supportsDateRange/supportsScope` to decide
  whether a given query is even applicable to an adapter, and skip non-matching
  adapters instead of dispatching a query they cannot honour.
- Pass the relevant `supportsScope` scopes through as structured filters when the query
  carries them.

Acceptance: a query carrying a filter dimension an adapter does not support is not
dispatched to that adapter; the orchestrator's target set is derived from `queryShape`,
not just `adapters.length > 0`.

## 3. Use `rankFieldName` in the merge

`rankFieldName` is declared and carried but the cross-pillar ranking merge sorts by the
hit's `score`, ignoring the per-adapter rank-field hint. Either wire `rankFieldName`
into the merge (pull the ranking value from `data[rankFieldName]` when present) or drop
the field from the schema as unused. Decide and close the loop.

## Edge case to validate during rollout

A pillar that advertises a `queryShape` filter its `/search` handler silently ignores
returns empty/text-only results. Until item 2 lands, the only guard is the smoke test —
a rollout PR should assert the declared `queryShape` matches what the handler actually
filters on.
