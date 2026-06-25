# Ingestion Pipeline

Status: **Partial** — the REST pipeline, async enrichment worker, scope reconciliation, capture-first shell surface, bulk paste, and global hotkey are all built. Missing: agent-facing MCP `ingest`/`quick_capture` tools, a `pops cerebrum capture` CLI, JSON-body metadata lifting, and configurable confidence thresholds — see [ideas/agent-and-cli-capture-channels.md](../ideas/agent-and-cli-capture-channels.md).

The single path from raw input to a stored engram. Content enters Cerebrum's own SQLite-backed engram store through one pipeline: normalise → classify → match template → extract entities → infer scopes → dedup → write. Engrams (and their scopes, tags, suggestions) live in the cerebrum pillar's own database.

**Capture-first principle.** Manual ingest defaults to a single body input — no type, template, or tag decisions upfront. The user types or pastes, submits, and the curation worker infers structure asynchronously. Explicit metadata lives behind an "Advanced" disclosure. The bar is "as fast as a sticky note"; up-front classification is an anti-pattern here.

## Data Model

**Ingestion request** (`submit`): `body` (required, non-empty), `title?`, `type?`, `scopes?` (string[]), `tags?`, `template?`, `source?` (free string validated server-side against the engram source grammar; defaults to `manual`), `customFields?`.

**Quick capture request**: `text` (required), `source?`, `scopes?` (suggestions).

Engram enrichment state is carried in engram `customFields`:

- `_enrichedHash` — body hash of the last enrichment run (idempotency guard).
- `_reconcile_scopes: true` — opt-in flag set on quick-capture-with-suggested-scopes so the worker reconciles rather than re-infers.
- `_scope_suggestions` — `Array<{ original, canonical, confidence, reason }>` proposed by reconciliation.
- `_scope_suggestions_dismissed` — segment-set keys (sorted segments joined by `|`) the user dismissed; suppresses re-proposal.
- `referenced_dates` — ISO-8601 dates extracted from the body, beyond the engram's creation date.

## REST API Surface

Served under the cerebrum contract (`rest-ingest.ts`, `rest-scopes.ts`). All ingest procedures are POST (bodies, not query strings).

| Endpoint                         | Purpose                                                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `POST /ingest/submit`            | Full pipeline; returns `{ engram, classification, entities, scopeInference }`. Dedups by body hash.             |
| `POST /ingest/preview`           | Dry run — returns normalised body, classification, entities, referenced dates, scope inference; writes nothing. |
| `POST /ingest/classify`          | Classification only — `{ type, confidence, template, suggestedTags }`.                                          |
| `POST /ingest/extract-entities`  | Entity extraction only — `{ entities, tags, referencedDates }`.                                                 |
| `POST /ingest/infer-scopes`      | Scope inference only — `{ scopes, source, confidence }`.                                                        |
| `POST /ingest/quick-capture`     | Store raw capture, enqueue async enrichment; returns `{ id, path, type, scopes, requeued }`.                    |
| `POST /ingest/enrichment-status` | Poll enrichment state — `{ enriched, type, template, scopes, tags, scopeSuggestions }`.                         |
| `POST /ingest/retry-enrichment`  | Re-enqueue the `classifyEngram` job — `{ engramId, requeued }`.                                                 |
| `POST /scopes/reconcile`         | Reconcile suggested scopes against the vocabulary — `{ reconciled: ScopeSuggestion[] }`.                        |

The full engram write happens through the engrams service inside the pipeline (not a separate HTTP hop). The async enrichment job is the `classifyEngram` curation job consumed by the cerebrum worker.

## Business Rules

- `body` is required and non-empty after normalisation; everything else is optional and inferred. `source` defaults to `manual`.
- **Normalisation** (first stage): reject whitespace-only input, normalise line endings to `\n`, collapse 3+ blank lines to 2, trim each line and the whole body. A body that is a valid JSON object or array is rendered as a fenced ` ```json ` block.
- **Title derivation**: explicit `title` wins; else first `# H1`; else first line, truncated.
- **Classification** (`submit` when `type` omitted, and the worker for captures): LLM returns `{ type, confidence, template, suggestedTags }`. Type comes from a fixed known set (journal, decision, research, meeting, idea, note, capture, …). Below the **hardcoded** 0.6 confidence threshold (or when the model is unavailable) the type falls back to `capture`. Template is matched by name against the registry; no match → `null`/no scaffolding.
- **Entity extraction**: people, projects, dates, topics, organisations with per-entity confidence. Entities above the **hardcoded** 0.7 threshold become tags, prefixed (`person:alice`, `project:karbon`) for disambiguation; deduped against existing tags. Date entities normalise to ISO-8601 and land in `referenced_dates`.
- **Scope inference** is four-tier: (1) explicit user scopes win (`source: explicit`, confidence 1.0); (2) `scope-rules.toml` pattern matching against `source`/`type`/`tags` (additive, `source: rules`); (3) LLM analysis with the known-scope list to avoid inventing vocabulary (`source: llm`); (4) `defaults.fallback_scope` from `scope-rules.toml` (`source: fallback`). Invalid LLM scopes are silently dropped.
- **Deduplication**: the pipeline hashes the normalised body and skips the write if an engram with that content already exists, returning the existing engram.
- **Quick capture** bypasses classification/extraction/inference: writes `type: capture` immediately with either the user's suggested scopes or the rule-engine fallback, then enqueues `classifyEngram`. `requeued: false` is a soft signal that the queue (Redis) was unavailable — the engram is still written.
- **Scope-as-suggestion**: quick capture with `scopes` writes them to the engram immediately (fast retrieval) and sets `_reconcile_scopes: true`. The worker reconciles against the vocabulary and writes `_scope_suggestions` — it never auto-rewrites the engram's scopes. Hard-explicit Tier-1 scope semantics are reachable only via `submit`.
- **Async enrichment** (`classifyEngram`, cerebrum worker): re-classifies, re-extracts, merges tags, and either reconciles (when `_reconcile_scopes`) or re-infers scopes; writes type/template/tags/scopes/`referenced_dates`/`_scope_suggestions` back to the engram and index. **Idempotent** via `_enrichedHash` (body hash, not engram content hash) — a re-run on unchanged content is a no-op, so retry can fire freely.
- **Scope reconciliation** (`POST /scopes/reconcile`, and in-worker) is purely lexical/structural — no LLM, no I/O. Match types by confidence: 0.95 same segment-set different order; 0.85 user's segments ⊂ canonical (longer canonical); 0.80 single-segment typo (Levenshtein ≤ 2, same layout); 0.70 canonical ⊂ user's segments (shallower, more-used canonical). Highest confidence wins; ties break on canonical usage count then lexically. No suggestion when the scope is already an exact match, when nothing clears 0.6, or when previously dismissed for that engram. Scopes with `count: 0` are excluded as candidates.
- **Bulk paste** (capture surface): a line of only `---` (optional surrounding whitespace) is an engram boundary. The split happens client-side; each non-empty segment becomes its own `quickCapture` (sequential, in order). Empty segments are skipped. The submit button reflects the segment count and a preview shows the first 60 chars of each segment. A failed segment does not block the rest; it shows in the result list with a per-row retry. `Cmd/Ctrl+Shift+Enter` forces the split.

## Capture Surface (shell)

- `/cerebrum` opens a capture surface: a multi-line body editor, an optional title, and a scope autocomplete — nothing else by default. The scope input suggests known scopes from `GET /scopes` (each annotated with its engram count), matched by case-insensitive substring so typing `karbon` matches `work.karbon.fedx.meetings`.
- Empty/whitespace-only bodies are rejected client-side (button disabled). Paste preserves whitespace and line breaks to match the normaliser.
- Submitting with no Advanced fields and no `---` calls `quickCapture` and returns immediately, showing the engram id, path, and type. With `---` it bulk-splits. Opening **Advanced** (collapsed by default) reveals type/template-custom-fields/tags; submitting through Advanced routes to `submit` so explicit values bypass classification. Toggling Advanced never discards the body or scope inputs.
- `Cmd/Ctrl+Enter` submits from anywhere in the body editor.
- **Post-ingest review** (`EnrichmentChips`): after capture, the result subscribes to `enrichment-status` (polling, backing off) and updates in place when the worker finishes — inferred type/template/scopes/tags render as editable chips on the same card (the body is not re-shown). Each chip edits in place via `PATCH /engrams/:id`. A reconciliation suggestion renders as a "Did you mean: `<canonical>`?" affordance: accept replaces the scope via `PATCH /engrams/:id` and clears `_scope_suggestions`; dismiss records the segment-set key in `_scope_suggestions_dismissed` so it is not re-proposed. On enrichment failure, a "retry enrichment" action calls `retry-enrichment`. "Capture another" resets to an empty editor.
- **Global capture hotkey** (shell root): a configurable single key opens a modal rendering the same capture component, regardless of route. The hotkey is suppressed when focus is inside an `input`/`textarea`/`select`/`[contenteditable]` or any `data-capture-hotkey-ignore` element, and while a dialog is open. Focus moves to the body on open and is restored on close; `Esc` confirms-discard when the body is non-empty. `Cmd/Ctrl+Enter` submits and closes on success. Registered exactly once at the shell root.

## Edge Cases

- Empty / whitespace-only body → rejected (400) at normalisation.
- Valid-JSON body → rendered as a fenced ` ```json ` block. (JSON keys are **not** lifted into request metadata — see ideas file.)
- Explicit `type` with no matching template → engram created with that type and no scaffolding.
- Classification unavailable / low confidence → `type: capture`.
- Entity extraction returns nothing → explicit tags preserved, no additions.
- Rules + LLM both empty → `defaults.fallback_scope` assigned.
- Duplicate content hash → no new write; the existing engram is returned.
- Quick capture while Redis is down → engram written, `requeued: false`, type stays `capture`; user can re-enqueue from the result view once Redis recovers.
- `---` inside a fenced code block still splits (the splitter operates on raw lines).
- Bulk segment fails one-of-N → remaining segments still process; failed segment shows its error with a per-segment retry.
- User suggests a scope already exactly indexed, or with no candidate above 0.6 → no reconciliation suggestion; vocabulary grows naturally.
- Same canonical reconciliation previously dismissed for an engram → suppressed via `_scope_suggestions_dismissed`.

## Acceptance Criteria

- [x] `POST /ingest/submit` runs normalise → (classify when type omitted) → extract → infer → dedup → write and returns `{ engram, classification, entities, scopeInference }`.
- [x] `POST /ingest/preview` returns the same derived data without writing a file.
- [x] Normalisation rejects whitespace-only input, normalises line endings, collapses blank-line runs, and fences valid JSON.
- [x] Title is derived from explicit title → first H1 → first line.
- [x] Classification returns a calibrated confidence and falls back to `capture` below 0.6 or when the model is unavailable; template matched by name lookup, `null` on miss.
- [x] Entity extraction returns people/projects/dates/topics/organisations with confidence; entities above 0.7 become deduped, optionally-prefixed tags; dates normalise into `referenced_dates`.
- [x] Scope inference applies explicit → rules → LLM → fallback with the documented `source` tags and confidences; invalid LLM scopes dropped.
- [x] `POST /ingest/submit` with explicit `scopes` writes them as-is with no reconciliation (Tier-1 explicit semantics).
- [x] `POST /ingest/quick-capture` writes a `type: capture` engram immediately and returns `{ id, path, type, scopes, requeued }`; `requeued: false` when Redis is unavailable but the engram is still written.
- [x] Quick capture with suggested `scopes` writes them immediately and sets `_reconcile_scopes: true`; the worker writes canonical alternatives to `_scope_suggestions` without overwriting the engram's scopes.
- [x] The `classifyEngram` worker job is idempotent via `_enrichedHash` (body hash) — a re-run on unchanged content is a no-op.
- [x] `POST /scopes/reconcile` and the in-worker reconciliation produce segment-set (0.95), subset (0.85), typo (0.80), and shallower (0.70) matches; no proposal on exact match, below 0.6, or for dismissed segment-sets; ties break by usage then lexically; `count: 0` scopes excluded.
- [x] Submitting identical content twice returns the existing engram and writes no second file.
- [x] The `/cerebrum` capture surface shows a body editor, optional title, and a scope autocomplete (known scopes from `GET /scopes`, substring-matched, count-annotated); empty bodies are rejected client-side; Advanced routes to `submit`, default routes to `quickCapture`.
- [x] Bulk paste splits on `---` lines client-side, submits one `quickCapture` per non-empty segment in order, skips empties, reflects segment count in the button, and offers per-segment retry on failure.
- [x] The post-ingest review polls `enrichment-status`, renders editable chips, surfaces "Did you mean: `<canonical>`?" with one-click accept (`PATCH /engrams/:id`) and dismiss (`_scope_suggestions_dismissed`), and offers retry on enrichment failure.
- [x] The global capture hotkey opens the shared capture modal from any route, is suppressed inside form/editable elements and open dialogs, traps and restores focus, and submits with `Cmd/Ctrl+Enter`.

## Out of Scope

- Plexus integration adapters (email/calendar/GitHub feed the pipeline from outside).
- Voice transcription (pre-processing before ingestion).
- One-time bulk-import migration tooling.
- Semantic embedding generation (Thalamus syncs embeddings after the engram is written).
- Curation/consolidation over stored engrams (Glia).
- Template creation/editing (managed outside this pipeline).
