# Epic 03: Draft Review & Approval

> Theme: [Food](../README.md)

## Scope

Build the review surface that consumes Epic 02's output. An `/food/inbox` page (the email-triage metaphor) lists ingest-originated drafts; a per-draft inspector pairs `dsl-editor`'s editor with an ingest-provenance pane so the user can compare what the pipeline extracted against the source (URL preview, transcript, vision keyframes, raw LLM output) before approving. Approval promotes the draft to `current` (via `recipe-crud-pages`'s existing `promote` pipeline); rejection archives the draft and tags a reason. A "Rejected" tab supports undo; a "Failed ingests" tab surfaces no-draft ingest failures and exposes `ingest-api`'s `retry`. A deterministic "review quality" heuristic sorts the queue so visibly-clean drafts float to the top without claiming to predict correctness.

After this epic, the user can paste an Instagram URL into pops-shell (Epic 02), open the inbox 30-60 seconds later, see the draft scored against the source, hit Approve, and the recipe appears in the canonical library at `/food/recipes`. Manually-authored drafts (created via `/food/recipes/new`, `recipe-crud-pages`) are NOT in the inbox — the inbox is ingest-originated only.

This epic is review-loop only. The planning, batch, and cook-event surfaces that consume promoted recipes are Epics 05+.

## PRDs

| #   | PRD                                                                  | Summary                                                                                                        | Status      |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 134 | [Review Queue Page](../prds/review-queue-page/README.md)             | `/food/inbox` with Drafts / Rejected / Failed tabs; heuristic-sorted rows; filter chips; cursor pagination     | Not started |
| 135 | [Per-Draft Inspector](../prds/draft-inspector/README.md)             | `/food/inbox/:sourceId` three-pane view: provenance + DSL editor + approve/reject controls; auto-create banner | Not started |
| 136 | [Approval & Rejection Flow](../prds/approve-reject-flow/README.md)   | Server mutations (`approve` / `reject` / `unreject`); new `recipe_version_rejections` table; FK transitions    | Partial     |
| 137 | [Review Quality Heuristic](../prds/quality-heuristic/README.md)      | Deterministic scoring function over compile_status + proposedSlugs + partialReason + kind + age; four bands    | Not started |
| 138 | [Rejected & Failed Tabs](../prds/rejected-and-failed-tabs/README.md) | Rejected tab with undo; Failed-ingest tab wired to `ingest-api` `retry`; reject-reason capture + filter        | Partial     |

### Build order

```
136 ──► (137, 138 in parallel)
            │
            ▼
       134 ──► 135
```

- **`approve-reject-flow`** (server flow + schema delta) lands first because `review-queue-page`/135/138 all query against `recipe_versions.source_id` (`recipe-model`) joined with the new `recipe_version_rejections` table, and call `approve`/`reject`/`unreject`. Pure server / migrations — no UI.
- **`quality-heuristic`** (heuristic) is a pure function on inputs `approve-reject-flow` surfaces; built in parallel with `rejected-and-failed-tabs`.
- **`rejected-and-failed-tabs`** (rejected + failed tabs) is a separable UI slice that lands on top of `approve-reject-flow`'s APIs and slots into `review-queue-page`'s tab shell.
- **`review-queue-page`** (the queue page itself) consumes `quality-heuristic`'s heuristic for sort/badge and exposes the tab shell `rejected-and-failed-tabs` fills.
- **`draft-inspector`** (inspector) is the deepest UI slice and lands last; it embeds `dsl-editor`'s editor and depends on `approve-reject-flow`'s mutations.

## Dependencies

- **Requires:** Epic 00 (`recipe_versions` from `recipe-model`; `ingest_sources` from `ingest-sources`; DSL compile path PRDs 114-117).
- **Requires:** Epic 01 (`recipe-crud-pages`'s `food.recipes.promote` / `archiveVersion` / `listProposedSlugs`; `dsl-editor`'s `DslEditor` component; `dsl-renderer`'s renderer for the read-only "compare" view; `data-page`'s `/food/data` page for auto-create refinement links; `app-shell`'s `app-food` shell-module mounting).
- **Requires:** Epic 02 (`ingest-api`'s `food.ingest.list` / `status` / `cancel` / `retry` + `IngestStatus` / `PartialReason` types; `worker-container`'s worker writes to ingest_sources; `ai-usage-prompts`'s `ai_inference_log` rows for the inspector to surface per-LLM-call cost).
- **Unlocks:** End-to-end multimodal recipe ingest. After this epic the user can run an IG URL → review → approve cycle that lands in the canonical library.
- **Unblocks:** Epic 04 (lists & shopping consumes promoted recipes; not blocked by this epic per se but the value loop only closes once drafts can flow through review).

## Key Decisions

| Decision                   | Choice                                                                                                                                         | Rationale                                                                                                                                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inbox URL                  | `/food/inbox`                                                                                                                                  | Email-triage metaphor is the intended UX. `/food/recipes` (`recipe-crud-pages`) stays for the canonical library so the two surfaces never blur                                                    |
| Queue origin               | Ingest-originated drafts only (rows where `recipe_versions.source_id IS NOT NULL` per `recipe-model`)                                          | Manually-authored drafts are reachable via `recipe-crud-pages`'s `/food/recipes/:slug/drafts`; mixing them into the inbox dilutes the "stuff the pipeline produced" surface                       |
| Approve / reject UX        | Per-draft only (no multi-select bulk approve)                                                                                                  | Drafts demand individual eyeballs; bulk approve invites rubber-stamping. Kept simple: open inspector → decide → next                                                                              |
| Rejected drafts            | Hidden from default queue; separate "Rejected" tab with undo                                                                                   | Default surface stays focused on pending work; undo path lets the user recover from "rejected by mistake" without rooting through `/food/recipes/:slug/drafts`                                    |
| Auto-create refinement     | Inspector shows a banner with links into `data-page`'s `/food/data?focus=<slug>`; approval is NOT gated on refinement                          | Avoids duplicating `data-page`; auto-created entities are valid (just under-named); refinement is a separate, async activity                                                                      |
| Review quality model       | Deterministic heuristic (compile_status + proposedSlugs count + partialReason + kind + age) emitting one of 4 bands                            | Reliable, testable, no LLM self-reporting. Sort signal only — never claims to predict ground truth. `quality-heuristic` owns the scoring function                                                 |
| Heuristic storage          | Computed on-demand in `food.inbox.list`; no column on `ingest_sources`                                                                         | Single-user POPS; ingest volume is hundreds, not millions. Storing it would create a refresh-staleness problem; on-demand is simpler                                                              |
| Ingest→version link        | Use the existing `recipe_versions.source_id` FK (defined by `recipe-model`); no new column                                                     | `recipe-model` already links each ingest-born version to its `ingest_sources` row. The Rejected tab joins `archived AND source_id IS NOT NULL`; nothing more is needed                            |
| Reject metadata            | New `recipe_version_rejections` table (FK to `recipe_versions`; reason tag + optional note + timestamp)                                        | `recipe-crud-pages`'s "Discard a draft" also archives a version; storing reject metadata in a separate table cleanly separates inbox-rejects from manual discards without touching `recipe-model` |
| Reject capture             | Required structured tag (`wrong-recipe` / `low-quality-extraction` / `duplicate` / `not-a-recipe` / `other`) + optional free-text note         | Tag drives the Rejected-tab filter and future quality analytics; the note covers the long tail. Mandatory tag prevents "reject without thinking"                                                  |
| Failed-ingest handling     | Separate "Failed ingests" tab inside `/food/inbox`; per-row retry button calls `ingest-api`'s `food.ingest.retry`                              | No draft was created so a recipe-shaped row would be misleading; users still need a triage surface and a one-click retry path                                                                     |
| Server-side approve/reject | New `food.inbox.*` namespace composed on top of `recipe-model`'s `promoteVersion` / `archiveVersion` services with ingest-source state updates | Keeps the inbox-vs-recipes domain boundary obvious; consolidates the "approve" action's side-effects (promote + meta update + reviewed_at) into one transactional mutation                        |

## Risks

- **Inspector data shape sprawl** — The inspector needs ingest meta, DSL, compile errors, proposedSlugs, auto-created entities, ingest cost from `ai_inference_log`, source media (URL/screenshot/transcript), AND `dsl-editor`'s editor state. One omnibus query risks slow loads. Mitigation: `draft-inspector` splits into two queries (`food.inbox.getForReview` for meta + DSL, plus the editor's existing `listProposedSlugs` from `recipe-crud-pages`); incremental loading where useful.
- **Heuristic drift** — Anything that's "computed from N signals" tends to grow. Mitigation: `quality-heuristic` fixes the scoring function with explicit signal weights and pure-function tests; changes require an ADR.
- **Auto-create surfaces grow stale** — A draft proposes ingredient `bok-choy`; user approves; later renames it `bok-choi` in `/food/data`. `data-page` owns this and the rename propagates via slug_registry. Inbox doesn't need to know.
- **Promote into a published slot fails after the user clicked Approve** — race with another tab promoting a different draft, or a slug-rename invalidated the URL. Mitigation: `approve-reject-flow`'s `approve` is transactional and returns a structured error the inspector renders inline; the draft stays in queue if approve failed.
- **Rejected-with-meaning vs archived-by-edit** — `recipe-crud-pages`'s "Discard a draft" archives it via `archiveVersion` too. We can't tell the two apart on `recipe_versions.status='archived'` alone. Mitigation: `approve-reject-flow` introduces the `recipe_version_rejections` table populated only on inbox rejects (presence of a row distinguishes "rejected via inbox" from "discarded via `recipe-crud-pages`"); leaves `recipe-crud-pages`'s discard path untouched.
- **Failed-ingest tab clutter** — A flaky network produces dozens of failed-and-retried rows. Mitigation: `rejected-and-failed-tabs`'s tab default-filters to "failed AND not superseded by a successful retry with same sourceId" — a retried-successful ingest hides the original failed attempt.
- **Inspector "compare to source" UX has heterogeneous source media** — IG reels have video + transcript + keyframes; web URLs have an HTML snapshot; screenshots have a single image. Mitigation: `draft-inspector` specifies per-kind provenance components; a small adapter pattern.

## Out of Scope

- Bulk approve / bulk reject — explicit no-go per the Key Decisions table.
- Inline auto-create refinement (rename slug / set default unit inside the inspector) — deferred. Refinement happens at `/food/data` (`data-page`).
- "Smart suggestions" (LLM proposes a better title, a better recipe_type, a tag set) inside the inspector beyond what Epic 02's handlers already produce in the DSL — out of scope; future PRD if needed.
- Diff view between draft revisions while reviewing — each ingest produces one draft version; subsequent saves overwrite it. There's nothing to diff yet.
- Comment threads / review notes per draft beyond the reject-reason note — single-user.
- Per-source notifications (push, email) when an ingest completes — explicit theme decision (no notifications in v1).
- Re-running the LLM extraction without a fresh ingest — out of scope. To re-extract, the user runs `ingest-api`'s `retry` (Epic 02), which reuses the existing input and overwrites `extracted_json`.
- Cross-ingest dedup ("this looks like the same recipe as draft #12") — deferred.
- Approving a draft that produces a "merged" recipe (e.g. update an existing canonical recipe instead of creating new) — out of scope; v1 always promotes to a new `recipes` row.
- Bulk-purge of archived rejects (housekeeping) — deferred to operator scripts.
