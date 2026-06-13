# Post-Theme-13 Cleanup Plan

> Parked: not actionable now. Read before kicking off cleanup work in 1-2 days (for #1) or at Theme 14 boundary (for #2).

Two separate cleanups, at two different times. Captured here so they don't get forgotten while the Wave 5 / Wave 6 / Wave 7 implementations are in flight.

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

## Anti-action: things explicitly NOT in scope here

- Renaming "pillar" to anything else (ADR-035 settled this — name stays).
- Adding a `kind` field to `pillar_registry` (ADR-035 settled this — kinds are descriptive).
- UI federation (ADR-032 settled this — out of scope for Theme 13 + Theme 14).
- Forking HassOS or any other platform (ADR-032 settled this — positioning is additive).

## Status

Parked. Re-read before kicking off either cleanup.
