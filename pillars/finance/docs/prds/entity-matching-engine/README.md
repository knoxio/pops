# Entity Matching Engine

> Status: Done — AI fallback ships without the disk cache / `ai_usage` ledger the doc once claimed; those are forward ideas (see `docs/ideas/`).

Given a raw transaction description, decide which entity (merchant/payee) it belongs to and what tags to suggest. A deterministic ladder resolves the vast majority of rows; an optional, env-gated AI fallback handles the long tail. Reference data (entity names, aliases, default tags) is fetched live from the `contacts` pillar once per import run — finance keeps no local entity mirror.

This engine is internal pipeline logic invoked during import processing and re-evaluation. It exposes no entity-matching REST endpoints of its own; the only contract surface it owns is the AI-cache maintenance router (see below).

## Classification Ladder (priority order)

For each parsed transaction, the first stage that hits wins; later stages are skipped.

1. **Learned corrections** — `applyLearnedCorrection`, min confidence 0.7.
   Query active `transaction_corrections` (`is_active`, `confidence >= 0.7`), ordered priority ASC then id ASC; the first whose pattern matches the normalized description wins. Match types: `exact`, `contains`, `regex` (invalid regex silently skipped). Confidence `>= 0.9` → `matched`; `< 0.9` → `uncertain`. The correction supplies entity, location override, tags, and optional `transaction_type`.
   - Type-only corrections (a `transaction_type` of `transfer`/`income` with no entity) classify with no entity and are a **terminal `matched`** result — they count toward the batch's affected count and never fall through to later stages.
2. **Transfer/income heuristic** — `isTransferOrIncomeRow`: rows that look like transfers/income short-circuit to a `matched` transfer with no entity.
3. **Manual aliases** — case-insensitive substring of any alias in the description maps to its entity.
4. **Exact** — normalized description equals an entity name (case-insensitive).
5. **Prefix** — description starts with an entity name; longest entity name wins.
6. **Contains** — entity name appears anywhere in the description; minimum 4 chars (shorter names skipped to avoid false positives); longest entity name wins.
7. **Punctuation strip** — drop apostrophes/backticks from both sides, retry exact/prefix/contains.
8. **AI fallback** (stages 3–7 produce `matchType` `alias`/`exact`/`prefix`/`contains`; this stage produces `ai`) — only when every prior stage misses; see below.

No online/in-person field exists on transactions — that distinction is expressed only as an ordinary tag via `transaction_tag_rules`, applied by the tag pipeline below.

### Reference maps (built once per run)

- **Entity lookup**: lowercase entity name → `{ id, name (original case) }`, from the live contacts fetch.
- **Alias map**: lowercase alias → entity name; whitespace-only aliases dropped. Aliases arrive as arrays on the contacts wire shape (no comma-splitting in finance).
- **Default-tags map**: `entityId → defaultTags`, from the same fetch.
- **Known tags**: active `tag_vocabulary` plus every distinct tag on a stored transaction, loaded once and threaded into AI/category validation.

### AI fallback (`categorizeWithAi`)

- **Env-gated, default OFF.** Runs only when `FINANCE_AI_CATEGORIZER_ENABLED === 'true'`; otherwise returns no result and the row goes to `uncertain` with reason `No entity match found` (AI counters stay zero).
- Enabled without `ANTHROPIC_API_KEY`/`CLAUDE_API_KEY`, or any API failure, throws `AiCategorizationError` (`NO_API_KEY` / `INSUFFICIENT_CREDITS` / `API_ERROR`) — **non-fatal**: the row degrades to `uncertain` with reason `AI categorization unavailable`.
- Model: `claude-haiku-4-5-*` (override via `FINANCE_AI_CATEGORIZER_MODEL`), `max_tokens` 200 (override via `FINANCE_AI_CATEGORIZER_MAX_TOKENS`). Prompt sends only the trimmed merchant description plus the known-tag vocabulary — no account/card numbers, no PII.
- Response is JSON `{ entityName, tags: string[] }` (markdown code fences tolerated). `entityName` is sanitized: placeholder names (`Unknown…`, `Generic…`, etc.) and trailing store/location codes are stripped to `null`. If the sanitized entity exists in the lookup → `matched` (`matchType: 'ai'`); if it is a new name → `uncertain`.
- Rate limiting: exponential backoff + jitter on HTTP 429, max 5 retries.
- Usage/cost (input/output tokens, USD) is reported to the `ai` pillar via `@pops/ai-telemetry` (fire-and-forget; telemetry `contextId` is an opaque `import_batch:<id>`, never the description) and accumulated into per-batch counters surfaced on the import result as `aiUsage` (api calls, cache hits, tokens, cost). Finance does not write a local `ai_usage` ledger row per call.

## Tag suggestion pipeline (`suggestTags`)

Runs after entity matching. Builds a deduplicated, source-attributed tag list in priority order:

1. **Correction tags** — tags from the matched correction rule (`source: 'rule'`, carries the correction's `pattern`).
2. **Tag rules** — `transaction_tag_rules` matched by description pattern + optional entity scope (`source: 'rule'`, carries `pattern`). Applied on every import.
3. **AI tags** — the AI's `tags` array (`source: 'ai'`); a tag not in the known vocabulary is flagged `isNew: true`. When the cache/legacy entry carries only a `category` string, it is matched case-insensitively against known tags and emitted if found.
4. **Entity defaults** — the contact's `defaultTags` from the per-run map (`source: 'entity'`).

Output shape: `{ tag, source: 'rule' | 'ai' | 'entity', pattern?, isNew? }[]`, each tag appearing once regardless of how many sources propose it.

## AI-cache maintenance contract

The categorizer no longer reads/writes a per-row disk cache, but the legacy `ai_entity_cache.json` store and its maintenance endpoints survive for operational cleanup:

- `GET /ai-usage/cache` → `{ totalEntries, diskSizeBytes }`
- `POST /ai-usage/cache/prune` (body `{ maxAgeDays }`, default 30) → `{ removed }`
- `DELETE /ai-usage/cache` → `{ removed }` (purge all)

## Business rules

- Corrections outrank everything — they encode learned user intent.
- AI is best-effort: unavailability never fails an import; the row becomes `uncertain`.
- Only the merchant description reaches the model; no account/card numbers or personal identifiers.
- Reference data is live from `contacts` per run — no persistent finance-side entity/alias/default-tag mirror.

## Edge cases

| Case                                                           | Behaviour                                                                                                        |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Entity name < 4 chars                                          | Skipped in contains match (false-positive guard, e.g. `IGA` vs `DIGITAL GATEWAY`)                                |
| Multiple prefix/contains matches                               | Longest entity name wins                                                                                         |
| Invalid regex on a correction                                  | That rule silently skipped, others still evaluated                                                               |
| AI returns a placeholder / store-coded name                    | Sanitized to `null` → row stays uncertain                                                                        |
| AI returns an entity absent from the lookup                    | `uncertain` — user creates or selects manually                                                                   |
| AI disabled or unavailable (no key, 429-exhausted, no credits) | Non-fatal; row → `uncertain` with reason `AI categorization unavailable` (the `aiError` flag drives that reason) |
| Type-only (transfer/income) correction                         | Terminal `matched` with no entity; counts toward affected count                                                  |

## Acceptance criteria

- [x] Reference maps (entity lookup, alias map, default-tags, known tags) are built once per import run from the live contacts fetch, not per transaction.
- [x] Whitespace-only aliases are dropped; lookups are case-insensitive.
- [x] Stage 1 matches active corrections (confidence ≥ 0.7) in priority/id order; ≥ 0.9 → matched, < 0.9 → uncertain; matched correction provides entity, location, tags, transaction_type and short-circuits the ladder.
- [x] Type-only transfer/income corrections terminate as `matched` with no entity and count toward affected/affectedCount.
- [x] Alias / exact / prefix / contains / punctuation-strip stages run in order, return on first hit, and stamp the correct `matchType`; contains enforces the 4-char minimum and longest-name-wins.
- [x] AI fallback is reached only after all deterministic stages miss, is gated by `FINANCE_AI_CATEGORIZER_ENABLED`, and returns `{ entityName, tags }`; existing entity → matched, new name → uncertain.
- [x] AI `entityName` is sanitized (placeholders + store codes → null); only the merchant description is sent; 429s retry with backoff up to 5 times.
- [x] AI failure (`AiCategorizationError`) is non-fatal: the row becomes uncertain with reason `AI categorization unavailable` (the batch `aiError` flag is set, which drives that reason).
- [x] Per-batch AI usage/cost is surfaced on the import result and reported to the `ai` pillar via telemetry; no PII in the telemetry context.
- [x] Tag suggestions are deduplicated and source-attributed in order correction → tag-rule → AI → entity-default; AI tags outside vocabulary flagged `isNew`.
- [x] AI-cache maintenance endpoints (`GET`/`POST prune`/`DELETE` on `/ai-usage/cache`) return entry/size stats and removal counts.

## Out of scope

- Import wizard UI (see `import-wizard-ui`).
- Deduplication (see `import-dedup-csv`).
- Learning corrections from user edits (see `ai-rule-creation`, `correction-proposal-engine`).
