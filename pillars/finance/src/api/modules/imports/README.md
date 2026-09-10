# Import pipeline

Turns parsed bank rows into committed transactions, in two phases:

- `POST /imports/process` — dedups by checksum, then classifies each surviving row. It creates no transactions, but it is **not** side-effect free: every correction and tag rule that fires has its `timesApplied` and `lastUsedAt` bumped, gated on `!isPreview`.
- `POST /imports/commit` — writes the transactions themselves, applies rule ChangeSets, and re-classifies history, in one SQLite transaction.

Between them the wizard buffers edits, entity creations and rule ChangeSets client-side. `POST /imports/reevaluate-pending` re-runs matching against DB rules merged with that pending set; `GET /imports/progress` polls a running process session.

Re-evaluation is asymmetric by bucket, and the asymmetry is the point (`reevaluate.ts`). Unmatched rows (`uncertain`/`failed`) run the full ladder below. Already-`matched` rows are re-decided by **learned corrections only** — never the alias/exact/prefix/contains stages — and the row can never leave `matched`: a rule with nothing to apply, or one whose winning outcome is itself `uncertain` (an entity-less purchase rule, finance ADR-004), leaves the row untouched, but a rule that _does_ have something to apply is applied, whatever bucket it would otherwise route to (POPS-3120). A correction rule is written to overrule a match the system got wrong, and those rows are all in `matched`, so discarding an applicable rule's outcome there made every new rule a no-op for the siblings of the row the user hand-fixed. Re-running the entity matcher there, or honouring a demotion, would instead relitigate rows the user never asked about and hand back ones they had already settled.

## Classification ladder

`classifyWithoutAi` runs two stages and then defers to AI; the middle of the ladder is entirely inside `entity-matcher.ts`. First hit wins.

1. **Learned corrections** (`apply-learned-correction.ts`) — every active rule, no confidence floor, ordered `priority ASC, id ASC`. A rule is an instruction, not a hypothesis: provenance decides the bucket, not confidence (finance ADR-004). A rule naming an entity, or an entity-less `transfer`/`income` rule, is `matched`. An entity-less `purchase` rule is always `uncertain` — the review step still has to resolve a merchant, whatever the rule's own confidence.
2. **Aliases** — substring match; longest matching alias wins.
3. **Exact** — description equals an entity name.
4. **Prefix** — description starts with an entity name; longest name wins.
5. **Contains** — entity name anywhere in the description; longest name wins.
6. **Punctuation-stripped retry** of stages 3–5. Aliases are not retried.
7. **AI fallback** (`ai-batch-resolver.ts`) — only once every deterministic stage has missed.

Stages 2–6 live in `entity-matcher.ts`, whose helpers document their own normalization, minimum-length guards and tie-breaking.

AI is best-effort: no configuration or provider failure ever fails an import, the row just becomes `uncertain`.

## Tag-only pass

The ladder above answers "who is this merchant"; it does not answer "what was this". A row the matcher resolves perfectly gets tags only from a correction rule, a tag rule or the entity's `defaultTags` — all of which exist only because a human made them — so the better the match, the less tag help the row got (POPS-2596). `ai-tags-resolver.ts` closes that: after the AI pass, rows that resolved **deterministically**, carry **no** suggested tags and have a **spend** type are batched into one tag-only call per `FINANCE_AI_CATEGORIZER_BATCH_SIZE`, with the merchant given and only the closed-facet classification asked for.

It is gated on `FINANCE_AI_CATEGORIZER_TAGS_FOR_MATCHED` (default off) **in addition to** `FINANCE_AI_CATEGORIZER_ENABLED`, because unlike the fallback it spends on the common path. The narrowness is load-bearing: a row that already has rule or entity tags is never topped up, a row the AI itself resolved is never re-asked, and the batch is keyed on `(entityId, normalizeDescription(description))` so twelve Woolworths rows cost one entry. Every failure — open breaker, rate limit, malformed reply — leaves the row exactly as the ladder left it; nothing is re-bucketed and no `AI_API_ERROR` warning is raised, because no row was lost.

The rows this addresses are the ones `measureTagCoverage` (POPS-2607) counts as missing a required facet, which is why the spend-type condition matches its applicability rule rather than being a second opinion about it.

## Where things live

| Concern                                                     | File                                            |
| ----------------------------------------------------------- | ----------------------------------------------- |
| Two-pass orchestration, dedup, per-run map building         | `process-service.ts`                            |
| Per-row ladder walk and bucketing                           | `process-transaction.ts`                        |
| Stages 2–6 matching and normalization                       | `entity-matcher.ts`                             |
| Batching, chunking, and the rate-limit circuit breaker      | `ai-batch-resolver.ts`, `ai-circuit-breaker.ts` |
| Tag-only classification of already-matched rows             | `ai-tags-resolver.ts`, `ai-tags-only-api.ts`    |
| Model, key, token budgets and cost estimate                 | `ai-categorizer-config.ts`                      |
| Prompt construction and the field allowlist                 | `ai-categorizer*.ts`                            |
| Transactional write, rollback semantics, commit idempotency | `commit.ts`                                     |

Each carries a file-header comment explaining its own mechanics. Read the header before the body.

## Rules that span files

- **Reference data is fetched once per run, never per row.** Entity names, aliases and default tags come live from the `contacts` pillar — finance keeps no entity mirror. The correction rule set is loaded once and threaded through `ProcessContext`. Entity-key normalization is cached against the lookup map's identity, so **building a map and then mutating it mid-run yields stale keys** — build a fresh one.
- **Processing mutates rule telemetry.** Because `process` bumps usage counters, re-running it over the same batch — which the wizard does on resume, and on any dead-session recovery — inflates `timesApplied` for every rule that fires. Preview paths pass `isPreview` precisely to avoid this.
- **Tag suggestion runs after matching**, in `../tag-suggester/` — its header documents the source priority and dedup.

## Pending drafts

An import that has been started and not committed is a row in `import_drafts`
(finance ADR-005, `pillars/finance/docs/architecture/adr-005-import-drafts-are-server-records.md`),
served by the `importDrafts` sub-router (`src/contract/rest-import-drafts.ts`,
`src/api/rest/import-drafts-handlers.ts`). The row is the only copy: the
wizard writes it through on every change and hydrates from it on open, so
there is no browser-side persistence to fall out of step with it.

Three things about the wire that no single file states:

- **The state a card shows is a verdict, not a column.** The row stores
  `saved` or `live`; `open`, `left-open` and `unusable` are decided in
  `src/api/modules/import-drafts-types.ts` from the lease columns, the shape
  version and the account, in that order of precedence. The list keeps
  serving an unusable draft so the card can offer Discard; `GET /import-drafts/:id`
  refuses it with 409 `DraftUnusable` so no wizard mounts on it.
- **Every write names its tab.** `ownerToken` in the body is the lease; a
  write, heartbeat or unforced claim from another token is 409
  `DraftOwnedElsewhere`, with `details.ownerSeenAt` so the caller can tell a
  tab that is in it now from one that left without releasing.
- **Committing a live draft is what puts its rows in the ledger.** The commit
  takes a `draftId`; for a draft the bank filled it also writes the batch as an
  `api` batch, mints `balance_reported_cents` as an `import` checkpoint dated to
  the newest row it wrote, and deletes the draft, all inside the one
  transaction. A commit that fails leaves the draft to be resumed.
- **A live draft belongs to the bank until a person claims it.** Claiming
  turns it `saved`, so the Up path never writes into a draft someone has open;
  what arrives afterwards collects in a new live draft for the account. The
  webhook and the scheduled sync both land in `../import-drafts/live-draft.ts`,
  which classifies rows on arrival through `processImportCore` so the card can
  say how many need a decision; a settle or a delete from Up changes the staged
  row in place unless a tab holds the draft.

## Absent

The bank/dialect selector is not an account identity — it only picks a CSV parser (`app/src/components/imports/bank-dialect.ts`). The wizard's account-step (POPS-2840) resolves the real `accountId` transactions commit against; the free-text account-name mirror this table once carried was dropped in POPS-2770.

Related: `../corrections/`, `../tag-rules/`, `../tag-suggester/`, `../transfers/`, and the wizard UI at `pillars/finance/app/src/components/imports/`.
