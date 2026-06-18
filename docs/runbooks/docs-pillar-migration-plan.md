# Docs → Pillar Migration Plan

Move greenfield, pillar-scoped documentation out of central `docs/` and into
`pillars/<pillar>/docs/`. Cross-cutting docs stay central. Optimised for
parallel execution: one independent work package per pillar, then a single
coordinated seam pass.

## Decisions (locked)

| #   | Decision       | Choice                                                                                                                                                                                                      |
| --- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Docs shape     | Theme tree lands in `pillars/<p>/docs/`. The theme `README.md` becomes `pillars/<p>/docs/README.md`. The existing technical package README (`pillars/<p>/README.md`, e.g. `# @pops/food`) is **untouched**. |
| 2   | ADRs           | Move the ~11 clearly single-pillar ADRs into `pillars/<p>/docs/architecture/`. Genuinely cross-cutting ADRs stay in `docs/architecture/`.                                                                   |
| 3   | Satellite docs | Move pillar-specific `ideas/`, `issues/`, `superpowers/` plans+specs, and `runbooks/` into the owning pillar's `docs/`. Cross-cutting satellites stay central.                                              |

## Target layout (per pillar)

```
pillars/<p>/
  README.md            ← existing @pops/<p> package readme (KEEP)
  docs/
    README.md          ← from docs/themes/NN-<p>/README.md
    epics/             ← from docs/themes/NN-<p>/epics/
    prds/              ← from docs/themes/NN-<p>/prds/
    architecture/      ← single-pillar ADRs (only where applicable)
    runbooks/          ← pillar-specific runbooks
    ideas/             ← pillar-specific ideas (only where applicable)
    issues/            ← pillar-specific issues (only where applicable)
    plans/  specs/     ← from docs/superpowers (only where applicable)
```

## Why this parallelises cleanly

- Each theme tree is **self-contained**: `epics ↔ prds ↔ us ↔ README` use
  internal relative links (`../`, `../../`) that survive a whole-directory
  move. No internal-link rewrites needed if the tree moves as one unit.
- The **only** links escaping a theme are ADR references
  (`../../architecture/adr-*`). Counts: food ~13, media ~11, cerebrum ~6,
  finance 0, inventory 0.
- Inbound references into moved content are a **small, enumerable set** (the
  "seam" — see below). If Phase A packages never touch seam files, the
  packages mutate disjoint file sets and cannot conflict.

---

## Master mapping — what moves

| Pillar        | Theme tree (file count)     | Single-pillar ADRs → `docs/architecture/`                                                                                                         | Runbooks → `docs/runbooks/`                                                       | Other                                                                                                                                                                                   |
| ------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **finance**   | `themes/02-finance/` (114)  | none (verify: 004/028/030/036 are cross-cutting → stay)                                                                                           | `finance-api-pillar-verification`, `finance-rest-migration`                       | `issues/finance-import-correction-proposal-engine.md` → `docs/issues/`; all 4 `superpowers/{plans,specs}/*` (transfer-only-rules, finance-imports-2077) → `docs/plans/` + `docs/specs/` |
| **media**     | `themes/03-media/` (170)    | `adr-008-media-split-tables`, `adr-009-metadata-sources`, `adr-010-pairwise-elo-ratings`, `adr-011-local-image-cache`                             | `media-api-pillar-verification`, `media-rest-migration`                           | `ideas/media-ideas.md` → `docs/ideas/`                                                                                                                                                  |
| **inventory** | `themes/04-inventory/` (63) | none (verify: 012-universal-object-uri is cross-cutting → stay)                                                                                   | `inventory-api-pillar-verification`                                               | —                                                                                                                                                                                       |
| **cerebrum**  | `themes/06-cerebrum/` (92)  | `adr-019-engram-storage-model`, `adr-020-hierarchical-scope-model`, `adr-021-glia-trust-graduation`                                               | `cerebrum-api-pillar-verification`, `cerebrum-rest-migration`                     | —                                                                                                                                                                                       |
| **food**      | `themes/07-food/` (56)      | `adr-022-unified-recipe-ingredient-model`, `adr-023-recipe-markdown-dsl`, `adr-024-substitution-single-hop`, `adr-025-theme-07-food-doc-protocol` | `food-api-pillar-verification`, `food-rest-migration`, `instagram-cookie-refresh` | `ideas/food-app-spike.md` → `docs/ideas/`                                                                                                                                               |
| **core**      | none                        | none                                                                                                                                              | `core-api-pillar-verification`, `core-rest-migration`                             | create `pillars/core/docs/` (core has no README/docs yet)                                                                                                                               |
| **lists**     | none                        | none                                                                                                                                              | `lists-api-pillar-verification`                                                   | —                                                                                                                                                                                       |

## What stays central (cross-cutting)

- `themes/00-platform/`, `themes/01-foundation/`, `themes/05-ai/`, `themes/13-pillar-finale/`
  (no dedicated pillar / shared foundation / cross-pillar architecture)
- `architecture/` — every ADR except the 11 moved above
- `ideas/app-ideas.md`, `ideas/feature-toggles-spike.md`, `ideas/modular-apps-spike.md`
- `runbooks/cut-release.md`, `runbooks/go-live.md`, `runbooks/uri-layer.md`
- `_templates/`, `README.md`, `CLAUDE.md`, `roadmap.md`, `vision.md`
- This plan (`runbooks/docs-pillar-migration-plan.md`)

---

## The seam — central/shared files pointing INTO moved content

These reference moved paths and must be fixed. They are **shared** (multiple
pillars or central), so they are handled in the single **Phase B** pass — not
inside per-pillar packages — to avoid merge conflicts.

| File                      | References                                                         | Owner   |
| ------------------------- | ------------------------------------------------------------------ | ------- |
| `docs/themes/README.md`   | 5 rows linking app-theme READMEs (`02/03/04/06/07`)                | Phase B |
| `docs/README.md`          | link to `06-cerebrum`; theme index link                            | Phase B |
| `docs/roadmap.md`         | 2 links to `07-food/README.md` (+ tracker rows)                    | Phase B |
| `docs/ideas/app-ideas.md` | `adr-010` (→ media)                                                | Phase B |
| `docs/CLAUDE.md`          | folder-structure / standards — add "pillar-scoped docs" convention | Phase B |
| `AGENTS.md`               | `docs/themes/02-finance/prds/021-…` (≥1 path)                      | Phase B |
| `README.md` (root)        | runbook/ideas paths — verify moved ones                            | Phase B |
| `.dependency-cruiser.cjs` | comment refs `docs/themes/` — verify if moving                     | Phase B |

### Code/README references to moved content (folded into the owning pillar's package)

| File                                | References                                    | Fold into                                          |
| ----------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `pillars/food/src/domain/slug.ts`   | comment → food theme path                     | food package                                       |
| `pillars/food/src/contract/rest.ts` | comment → food runbook                        | food package                                       |
| `packages/app-food/README.md`       | food theme paths                              | food package                                       |
| `packages/app-lists/README.md`      | `themes/07-food/…/139-app-lists-shell-module` | food package (lists shell PRD lives in food theme) |
| `apps/moltbot/README.md`            | a moving theme path                           | seam (Phase B — not pillar-owned)                  |
| `pillars/cerebrum/README.md`        | a runbook path                                | cerebrum package                                   |

> Cross-pillar links that will legitimately exist _after_ the move (fix the
> relative path, don't remove): food `adr-023` → cerebrum `adr-019`; central
> `ideas/app-ideas.md` → media `adr-010`.

---

## Execution model

### Isolation

Run the 7 pillar packages in **parallel git worktrees** (one branch each,
e.g. `lake-migration-docs-food`), or sequentially in this tree if preferring
one PR per pillar. Parallel agents in the _same_ working tree will clobber
each other's `git mv`/staging — use worktrees for true parallelism.

### Ordering

```
Phase A  (parallel, independent)        Phase B (single owner, last)
┌─ finance ─┐                           ┌─ seam pass ─┐
├─ media   ─┤                           │ themes/README, docs/README,
├─ inventory┤  ── all disjoint ──►      │ roadmap, app-ideas, CLAUDE,
├─ cerebrum ┤   file sets, any order    │ AGENTS, root README, moltbot,
├─ food    ─┤                           │ .dependency-cruiser
├─ core    ─┤                           └─────────────┘
└─ lists   ─┘                           merges LAST
```

Phase A branches touch disjoint files and may merge in any order. Phase B
merges last (it points at final locations). Until Phase B lands, the central
theme index has transient broken links on-branch — acceptable.

### Use `git mv`

Every file move uses `git mv` to preserve history/blame. Do **not**
copy-delete.

---

## Per-pillar work package (the parallel unit)

Each package is self-contained. An agent reads this section + its row in the
master mapping. Steps:

1. **Create** `pillars/<p>/docs/`.
2. **Move theme tree** (where one exists):
   `git mv docs/themes/NN-<p>/README.md pillars/<p>/docs/README.md`
   `git mv docs/themes/NN-<p>/epics pillars/<p>/docs/epics`
   `git mv docs/themes/NN-<p>/prds  pillars/<p>/docs/prds`
   then `rmdir docs/themes/NN-<p>`.
3. **Move single-pillar ADRs** (per mapping) into
   `pillars/<p>/docs/architecture/`. Before moving each ADR, confirm it is
   genuinely single-pillar: `grep -rl adr-NNN docs pillars` should show only
   this pillar's tree + at most a cross-cutting central doc (record the latter
   as a seam item if found).
4. **Move runbooks / ideas / issues / superpowers** per mapping into the
   matching `pillars/<p>/docs/<kind>/`.
5. **Fix relative links** that now cross a different distance:
   - ADR links from moved docs to ADRs that **stayed central**: depth changes
     from `../../architecture/…` to the new relative path
     (`pillars/<p>/docs/prds/NNN-x/README.md` → `docs/architecture/…` is
     `../../../../../docs/architecture/…`). Compute per file depth.
   - ADR links to ADRs that **moved into this pillar**: now local
     (`../../architecture/adr-NNN.md` relative to the doc's new home).
   - Runbook → theme links inside moved runbooks (food: instagram PRDs
     `129/130`, food `README#risks`) → repath to the pillar-local doc.
6. **Fold owned code references** (see seam table) — update comment/docstring
   paths in files this pillar owns.
7. **Verify** (see Verification) — no dangling relative links originating in
   this pillar's `docs/`.
8. Commit on the pillar branch. Open PR.

### Link-distance cheat-sheet

From a moved doc, count `../` to reach repo root, then descend:

| Moved doc location                      | → central `docs/architecture/adr-X.md`      |
| --------------------------------------- | ------------------------------------------- |
| `pillars/<p>/docs/README.md`            | `../../../docs/architecture/adr-X.md`       |
| `pillars/<p>/docs/epics/NN.md`          | `../../../../docs/architecture/adr-X.md`    |
| `pillars/<p>/docs/prds/NNN-x/README.md` | `../../../../../docs/architecture/adr-X.md` |
| `pillars/<p>/docs/prds/NNN-x/us-NN.md`  | `../../../../../docs/architecture/adr-X.md` |

---

## Phase B — coordination pass (single owner, after Phase A merges)

1. `docs/themes/README.md`: repoint the 5 app-theme rows to
   `../../pillars/<p>/docs/README.md` (or annotate "moved to pillar").
2. `docs/README.md`: fix the `06-cerebrum` link; review the architecture link.
3. `docs/roadmap.md`: fix 2 food README links; tracker rows unaffected.
4. `docs/ideas/app-ideas.md`: fix `adr-010` link → `../../pillars/media/docs/architecture/adr-010-pairwise-elo-ratings.md`.
5. `docs/CLAUDE.md`: add a "Pillar-scoped docs" subsection documenting that
   pillar-specific themes/ADRs/runbooks now live under `pillars/<p>/docs/`,
   and that the central tree holds only cross-cutting docs.
6. `AGENTS.md`: fix `docs/themes/02-finance/prds/021-…` path(s).
7. Root `README.md`, `apps/moltbot/README.md`, `.dependency-cruiser.cjs`:
   fix any references to moved paths.

---

## Verification (every package + final)

- **Dangling relative links** — for each `*.md` under `pillars/*/docs/` and
  central `docs/`, resolve every `](relative)` target and assert the file
  exists. (Write a small node/grep script; fail on any miss.)
- **Orphaned source refs** — `grep -rn "docs/themes/\(02\|03\|04\|06\|07\)"`
  and `grep -rn "adr-\(008\|009\|010\|011\|019\|020\|021\|022\|023\|024\|025\)"`
  across the whole repo: no hits should point at a path that no longer exists.
- **Git history** — `git log --follow` on a sample moved file returns
  pre-move history (confirms `git mv`).
- **CI green locally** — run the repo's pre-push checks before pushing
  (project rule: CI must never fail). Docs moves shouldn't affect TS, but
  confirm dependency-cruiser and any markdown tooling pass.

## Known pre-existing issues (not caused by this migration)

- `docs/themes/03-media/...` links to `architecture/adr-010-comparison-system.md`
  but the file is `adr-010-pairwise-elo-ratings.md` — already broken. Fix
  opportunistically during the media package.
