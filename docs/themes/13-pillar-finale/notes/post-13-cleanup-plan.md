# Post-Theme-13 Cleanup Plan

> Parked: not actionable now. Read before kicking off cleanup work in 1-2 days (for #1) or at Theme 14 boundary (for #2 + #3).

Three separate cleanups, at different times. Captured here so they don't get forgotten while the Wave 5 / Wave 6 / Wave 7 implementations are in flight.

## Cleanup #1 — PRD status audit + dead PRD removal

**When:** after the next coherent merge point. Specifically, once the in-flight Wave 6 implementations (PRD-228 US-02 heartbeat, PRD-230, PRD-231 US-03, PRD-218 batch 3) land and the architecture stabilises. Cleaning during active migration creates churn.

**Trigger:** roughly when the open PR queue spends a full day at ≤3 PRs without churn.

**Effort:** ~1 day of agent work, mostly mechanical.

### What it covers

- **Status correctness.** Many PRDs say "Not started" but the work shipped elsewhere or in a different shape. Concrete examples:
  - PRD-217 (nginx config generator) — README says Not started; #3110 shipped the static-pillar version, dynamic deferred to PRD-228. Should be `Partial — static done, dynamic in PRD-228`.
  - PRD-195 (type generation pipeline) — was reported Not started in the audit, then found Done across all 7 contracts. README should match reality.
- **Dead PRDs.** Some PRDs document work that turned out to be unnecessary or impossible:
  - PRD-178 (warranties) — audit found no warranties table exists; the PRD has no implementation surface.
  - PRD-203 (ai-orchestrator-relocation) — blocked indefinitely by Issue #2965. Either land the issue or close the PRD.
  - PRD-174 (inventory-reports) — redesigned mid-way; original spec is stale.
- **Stale framing.** Anything authored before ADR-032 / ADR-035 still talks about pillars as data domains only. A language pass should:
  - Replace "pillar" assumptions where the broader definition (data + UI + bridge) is now correct.
  - Update cross-references to the right ADR.
  - Audit READMEs that reference Waves 1-5 as the goal — Wave 6-8 extension should be discoverable from each Wave-3 PRD's status block.
- **Acceptance criteria drift.** AC written for the original wave plan may be obsolete. Specific cases:
  - Anywhere AC says "all 22 slice cutover PRs (PR3) merged" — already covered by Theme 13's actual outcome of 6/7 pillars exited.
  - "AI orchestrator container deployed" (PRD-209) — blocked on PRD-203; status should reflect that, not "Not started."

### Shape of the work

Single super-PR by a "PRD status audit + sync" agent. Process per PRD:

1. Compare README status against actual code state on `main`.
2. Update status / AC checkboxes.
3. Add a "Status notes" block citing the PR or ADR that changed the picture.
4. Close PRDs that no longer have a buildable surface.

Should NOT touch PRD content beyond status + framing. Domain redesigns are separate work.

## Cleanup #2 — Doc topology reorg (split to per-pillar greenfield)

**When:** at Theme 14 boundary. Not before. Requires Theme 13 to be declared Done first.

**Why wait:** the current topology (everything under `docs/themes/13-pillar-finale/`) is correct for the migration phase. Agents currently know where to look. Restructuring mid-migration disrupts that. Wait until the migration is a historical artifact, then reorg.

**ADR target:** ADR-036 doc-topology — write this as the first PRD of Theme 14, or as a standalone ADR before Theme 14 starts.

### Proposed shape (subject to ADR-036 review)

- **`docs/architecture/`** stays for platform-level ADRs only.
  - Registry, SDK, federation, contract semver, positioning, cross-language, sinks, pillar redefinition. The platform invariants.
  - Existing ADRs 026 / 027 / 030 / 032 / 033 / 034 / 035 stay here.
- **Theme 13 docs (`docs/themes/13-pillar-finale/`)** stay where they are.
  - Read as a historical migration record, not living docs.
  - Status frozen at the cleanup-#1 pass.
- **Going forward**, new pillar-specific PRDs live in their pillar package:
  - `packages/<pillar>-contract/docs/prds/` or `apps/pops-<pillar>-api/docs/`.
  - Each pillar owns its own design history.
- **Some existing pillar-specific ADRs** get moved as a one-off curation:
  - ADR-008 media-split-tables → `packages/media-contract/docs/` (or `apps/pops-media-api/docs/`).
  - ADR-022 unified-recipe-as-ingredient + ADR-023 recipe-DSL + ADR-024 substitution-single-hop + ADR-025 food-doc-protocol → food's docs.
  - ADR-018 sqlite-vec-vector-storage → cerebrum's docs.
- **External pillars (PRD-233 Rust example, future ones)** are self-contained:
  - They ship their own docs in their own repo.
  - The registry only sees the manifest.

### Why this shape

- Matches the BE-lego vision: external pillar = self-contained doc + code unit.
- Preserves Theme 13 as historical artifact (don't rewrite past decisions).
- Keeps platform decisions discoverable centrally.
- Pillar-specific ADRs were always conceptually owned by their pillar — this is just making it filesystem-visible.

### What this is NOT

- It is NOT a request to renumber ADRs. ADR numbers stay stable. The move is filesystem-only.
- It is NOT a request to rewrite content. The reorg is structural.
- It is NOT a Theme 13 deliverable. Theme 13 finishes first.

## Cleanup #3 — Code topology reorg (`/pillars/<name>/` flat layout)

**When:** at Theme 14 boundary. Not before. Same gating as Cleanup #2; runs as the sibling code-side companion to the doc reorg.

**Why wait:** the cost is huge and the win is purely structural. ~50 packages move, every import path changes, every tsconfig path mapping, every Vite alias, every Dockerfile `COPY`, every CI workflow build list, dependency-cruiser rules, ESLint configs — all of it. Any PR open at the moment of the move eats merge conflicts. The federation already works; this is rearrangement, not capability.

**ADR target:** ADR-037 code-topology — pairs with ADR-036 doc-topology so the layouts mirror each other.

### Proposed shape (subject to ADR-037 review)

- **`/pillars/<name>/`** for in-repo pillars — each pillar groups everything it owns:
  - `pillars/food/contract/` ← was `packages/food-contract/`
  - `pillars/food/db/` ← was `packages/food-db/`
  - `pillars/food/api/` ← was `apps/pops-food-api/`
  - `pillars/food/app/` ← was `packages/app-food/`
  - and so on per pillar (core / inventory / finance / cerebrum / media / lists / ha-bridge / ai)
- **`/platform/`** for cross-pillar shared code that doesn't belong to any one pillar:
  - `platform/pillar-sdk/`, `platform/types/`, `platform/db-types/`, `platform/module-registry/`, `platform/widgets/`, `platform/ui/`, `platform/wire-conformance/`, `platform/api-client/` (during deprecation)
- **`/apps/`** retained for non-pillar applications:
  - `apps/pops-api/` (orchestrator/router), `apps/pops-mcp/` (tool surface), `apps/pops-shell/` (UI pillar — debatable; could also live under `pillars/shell/`)
- **External pillars** stay in their own repos. The registry only sees their manifest. The Rust example at `examples/pops-pillar-rust-example/` is a hint at the external-repo shape.

### Why this shape

- Matches the BE-lego vision: a pillar is a self-contained unit, code + db + api + UI grouped.
- Makes it obvious what code belongs to a pillar (cd `pillars/food/` and read).
- Mirrors the doc reorg shape (Cleanup #2) so the codebase and docs stay coherent.
- Forces a clear answer to "is this code pillar-specific or platform?" — every package gets reclassified, ambiguous cases get resolved at the boundary.

### What this is NOT

- It is NOT a rename of any package — `@pops/food-contract` stays as `@pops/food-contract`, just lives at `pillars/food/contract/`.
- It is NOT a rewrite — file contents are unchanged.
- It is NOT a Theme 13 deliverable. Theme 13 finishes first.

### Trial run before committing

Before doing the in-repo reorg, validate the layout on the next *external* pillar:
- If the HA bridge container moves into the homelab repo, ship it with `pillars/ha-bridge/` shape locally.
- Or promote PRD-233 Rust pillar to its own repo with the same layout.
- That gives a working precedent. If the layout creates friction in a self-contained external pillar, it'll create more friction in the monorepo — back off.

## Anti-action: things explicitly NOT in scope here

- Renaming "pillar" to anything else (ADR-035 settled this — name stays).
- Adding a `kind` field to `pillar_registry` (ADR-035 settled this — kinds are descriptive).
- UI federation (ADR-032 settled this — out of scope for Theme 13 + Theme 14).
- Forking HassOS or any other platform (ADR-032 settled this — positioning is additive).
- Renaming any package as part of the code reorg (Cleanup #3 — moves only).

## Status

Parked. Re-read before kicking off any cleanup.
