# POPS Pillar-Finale Program — Master Sequencing Document

> Lead-architect sequencing of the four interdependent POPS efforts (`contacts`, `settings`, `ai-ops`, `registry-cleanup`) plus the capstone `core`→`registry` rename. Time captured: 2026-06-21 17:49 AEST, branch `fix/pillar-vitest-exclude-colocated-app`. All paths absolute. This document is the program spine: it owns the cross-plan dependency graph, the shared-infrastructure build order, the parallelizable-vs-sequential matrix, the global GATE-fenced execution order, and the consolidated risk register. The capstone rename is in the separate `05-core-to-registry-rename.md` plan and is sequenced strictly LAST.

---

## 0. The five workstreams and what each owns

| Plan                                                             | Owns (authored here)                                                                                                                                                                                                                      | Consumes (must exist first)                                                                                                                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **contacts** (Rust pillar + entity extraction)                   | `crates/Cargo.toml` workspace ROOT + Rust CI/mise lane; the OpenAPI-3.0-forcing utoipa solution; the Rust pillar reference skeleton; contacts entities CRUD + bulk-lookup + `search.search` wire; `pops:contacts/contact/<id>` URI shapes | `@pops/pillar-settings` Rust crate `crates/pops-settings` (soft); `crates/pops-ai` (soft, readiness-only in v1); the registry handshake dual-serve window covering a Rust image |
| **settings** (federation, RU+reset)                              | `@pops/pillar-settings` (shared TS module); `crates/pops-settings` (Rust crate, co-owned w/ contacts); the federated RU+reset wire contract; capability plumbing through `PillarSnapshot`; aggregator `/settings/aggregate`               | the `crates/` workspace (from contacts); the registry-rename dual-alias window (for `core-api` literals); ai-ops ownership decision for `ai.*` keys                             |
| **ai-ops** (AI pillar extraction + telemetry)                    | `@pops/ai-telemetry` (TS wrapper, req+stream); `crates/pops-ai` (Rust crate); `POST /ai-usage/record` wire; `GET /ai-pricing/:p/:m`; the `ai` pillar (port 3008)                                                                          | `@pops/pillar-settings` (soft — interim local settings table until it lands); the `crates/` workspace ROOT (owned by contacts — ai-ops only adds `pops-ai` as a member)         |
| **registry-cleanup** (dot-routes → slash + compat)               | `REGISTRY_PATHS`/`LEGACY_REGISTRY_PATHS`; the self-healing path resolver (cache-invalidation-on-404); core dual-serve; SDK 404-fallback                                                                                                   | nothing as a hard precondition                                                                                                                                                  |
| **registry-rename** (capstone — `05-core-to-registry-rename.md`) | `pillars/core`→`pillars/registry`, image/DNS/env/nginx/CI/litestream/docs rename + DNS dual-alias window                                                                                                                                  | ALL THREE extractions complete (entities, ai-\*, settings left core) AND registry-cleanup's path rename settled                                                                 |

---

## 1. Cross-plan dependency graph (text)

```
                        ┌──────────────────────────────────────────────────────────┐
                        │  SHARED INFRA (must be built before its consumers)        │
                        └──────────────────────────────────────────────────────────┘

  contacts.Phase0 ─────────────► crates/Cargo.toml  (WORKSPACE ROOT, OWNED BY CONTACTS)
   (contacts Stage 1d / plan 01      │        │
    authors the root; ai-ops +       │        │
    settings ADD members — §1.3)     ▼        ▼
                       crates/pops-ai     crates/pops-settings
                       (ai-ops owns)      (settings owns; contacts co-mounts)
                            ▲                   ▲
                            │ wire parity       │ wire parity
                            │                   │
   ai-ops.N4 ──► @pops/ai-telemetry (TS)    settings.S0 ──► @pops/pillar-settings (TS)
        │  POST /ai-usage/record wire            │  RU+reset wire + capability plumbing
        │                                        │
        ▼                                        ▼
  ┌─────────────────────── contacts (Rust pillar) ────────────────────────┐
  │  CONSUMES: crates/pops-settings (settings surface, soft → []  fallback) │
  │  CONSUMES: crates/pops-ai (readiness-only in v1, no runtime Claude call) │
  │  CONSUMES: the OpenAPI-3.0 utoipa solution it ITSELF proves (G1)        │
  │  CONSUMES: registry handshake dual-serve covering a Rust image          │
  └────────────────────────────────────────────────────────────────────────┘

  registry-cleanup (path rename + compat) ──── INDEPENDENT of the three extractions
        │   exposes REGISTRY_PATHS + self-healing resolver contract
        │   contacts' Rust transport MUST implement the SAME cache-invalidation-on-404
        ▼
  ┌──────────── registry-rename CAPSTONE (separate artifact) ───────────────┐
  │  HARD GATE: runs ONLY after contacts(entities)+ai-ops(ai-*)+settings     │
  │             have left core AND registry-cleanup path rename is settled    │
  │  Renames container/DNS core-api→registry-api with its OWN dual-alias win  │
  └──────────────────────────────────────────────────────────────────────────┘
```

### 1.1 The load-bearing ordering constraint (explicit, per the prompt)

**contacts (Rust) consumes interfaces OWNED by settings and ai-ops.** Three concrete couplings:

1. **`crates/pops-settings`** (owned by `settings`, S6) — the Rust settings surface contacts mounts to serve a byte-identical RU+reset `/settings/*`. The `settings` plan MUST author this crate with a surface that OMITS `DELETE` and `ensure`-write-once (locked decision 4 forbids create/delete). If `settings` ships first, contacts mounts it; if contacts ships first, it ships `settings.manifests: []` and adds the panel when the crate lands. **Soft dep — contacts is first-class without it.**
2. **`crates/pops-ai`** (owned by `ai-ops`, N8) — the Rust telemetry crate. Contacts declares it as a workspace dependency for readiness but ships ZERO Claude calls in v1. **Soft dep.** (Locked decision 1 still mandates that ANY Claude call contacts later makes routes through this crate; the golden-fixture parity test is the cross-language guard.)
3. **The OpenAPI-3.0-forcing solution** — utoipa 5 defaults to 3.1 but `@hey-api/openapi-ts` targets 3.0. This is **proven in contacts itself (Gate G1)** and is a CROSS-PLAN BLOCKER: `ai-ops` and `settings` MUST NOT commit Rust crates that emit OpenAPI consumable by hey-api until contacts G1 proves the 3.0 emission. So while contacts _consumes_ `pops-settings`/`pops-ai` surfaces, it _produces_ the 3.0 solution those crates depend on. This is a mutual handshake resolved by sequencing: the `crates/` workspace + the 3.0 proof land in contacts' early phases (N0→N1); the OpenAPI-emitting Rust crates (`pops-settings` S6, `pops-ai` N8 if it emits OpenAPI) land after.

### 1.2 Port allocation (cross-plan conflict — RESOLVED)

Verified `infra/docker-compose.yml`: cerebrum=3007 (highest pillar), **3008 free**, **3009 = pops-orchestrator** (compose `:459-463`). Resolution:

- **ai = 3008** (ai-ops claims it).
- **contacts = 3010** (3009 is taken; contacts takes the next free after ai).
  Both register their entry in `PILLAR_UPSTREAMS` + `PILLAR_RENDER_ORDER` (`apps/pops-shell/scripts/generate-nginx-conf.ts:67-90`). Whichever pillar's PR lands second reads the first's entry and takes the next free port. The `assertRenderOrderCoversAllPillars` typecheck fails if either omits its entry.

### 1.3 Crates-workspace single-owner (cross-plan conflict — RESOLVED)

Both `contacts` (Phase 0) and `ai-ops` (N8) need `crates/Cargo.toml` + a Rust CI/mise lane. **LOCKED decision: `contacts` (Stage 1d / plan 01) OWNS `crates/Cargo.toml` + the Rust CI/mise lane.** Contacts authors the workspace root and the lane as part of its Phase 0 scaffold (it is the first Rust pillar and the reference implementation). `ai-ops` and `settings` ONLY add their crates (`pops-ai`, `pops-settings`) to `[workspace].members` afterward and reuse the lane. Exactly one plan authors the root — contacts — and ai-ops/settings never create it.

### 1.4 `ai.*` settings-key ownership (cross-plan conflict — RESOLVED)

`settings` keeps `ai.*` on core/registry by default (derives core's enum from `[aiConfigManifest, coreOperationalManifest]`). `ai-ops` moves the entire `ai-*` surface (incl. `aiConfigManifest`) out of core. **Resolution: the ai-ops key-move is a SINGLE ATOMIC node** that (i) adds `ai.*` to the new `ai` pillar's manifest via `@pops/pillar-settings`, AND (ii) in the SAME change drops `aiConfigManifest` from core's `coreManifests` so `deriveKeySet` stops emitting `ai.*` from core. Until that node runs, `ai.*` stays in core's manifest+enum. The two plans never both own `ai.*`. `settings` OWNS deleting the 11 `ai.*` key strings from `packages/types/src/settings-keys.ts` when its central-enum dismantling (Phase 4) lands. **Interim ratified state:** the `ai` pillar carries a local `settings`/`user_settings` table mirroring core's until `@pops/pillar-settings` lands — ai-ops is NOT blocked on settings.

### 1.5 `ai_usage` table re-home (cross-plan conflict — RESOLVED)

`ai-ops` DELETES the `ai_usage` table + `ai-usage/cache.ts` (`ai_entity_cache.json`) from core (PII-bearing finance-categorizer state, not AI-ops telemetry). The **finance plan** (a sub-scope of contacts' finance touchpoints, or a tracked standalone) re-homes them. A gap issue is filed if finance declines (ai-ops Open Decision 1). This is a delete-here/re-home-there handoff, sequenced so ai-ops' core de-AI does not strand finance reads.

---

## 2. Shared-infrastructure build order (the must-exist-before chain)

The prompt's explicit constraint: **the settings shared TS module + Rust crate AND the @pops/ai-telemetry wrapper + Rust crate must exist BEFORE the contacts Rust pillar implements them; registry-cleanup compat shims must land before the rename.** Concrete build order:

```
TIER 0 — workspace + wrappers (no pillar consumes yet)
  [0a] crates/Cargo.toml workspace root           (contacts owns, §1.3)
  [0b] @pops/ai-telemetry  (ai-ops.N4)            req+stream wrapper, InferenceRecordSchema
  [0c] @pops/pillar-settings (settings.S0)        schema/service/contract/redact/deriveKeySet
       └─ these three have NO pillar dependency; build first, in parallel

TIER 1 — Rust crates (depend on TIER 0 wire shapes + the 3.0 proof)
  [1a] crates/pops-ai      (ai-ops.N8)            mirrors @pops/ai-telemetry over the wire
  [1b] crates/pops-settings (settings.S6)         mirrors @pops/pillar-settings, dot-form opIds
       └─ BOTH gated on contacts G1 proving the OpenAPI-3.0 utoipa emission (§1.1.3)
          if either emits OpenAPI; pops-ai (telemetry-only, no OpenAPI surface) can precede G1,
          pops-settings (emits /settings/* OpenAPI) MUST follow G1.

TIER 2 — the Rust pillar that mounts TIER 1
  [2 ] contacts pillar                            mounts crates/pops-settings (soft),
                                                  declares crates/pops-ai (soft, readiness)

TIER R — registry-cleanup compat shims (independent track, gates the capstone)
  [R0] REGISTRY_PATHS + self-healing resolver     (registry-cleanup.Phase0)
  [R1] core dual-serve old+new paths              (registry-cleanup.Phase1)  ← MUST land+roll out
  [R2] SDK 404-fallback w/ cache-invalidation     (registry-cleanup.Phase2a)
       └─ R1+R2 are the "compat shims must land before the rename" constraint:
          the capstone's DNS cutover relies on the path rename already being settled.
```

**Why TIER 0 strictly precedes TIER 2:** contacts cannot mount a Rust settings surface that does not exist (`crates/pops-settings`), and cannot declare a telemetry crate dependency that does not exist (`crates/pops-ai`). The TS wrappers (`@pops/ai-telemetry`, `@pops/pillar-settings`) are the _wire-shape authorities_ the Rust crates mirror byte-for-byte; building the TS side first pins the contract the Rust side (and contacts) must satisfy.

**Why R1+R2 precede the capstone:** the rename changes the _container/DNS_ (`core-api`→`registry-api`); the path rename changes the _HTTP path strings_ (`/core.registry.*`→`/registry/*`). Locked decision 6 keeps the two dual-serve windows orthogonal — settle the path rename + its compat window FIRST, then do the DNS cutover. A capstone that fired while the path rename was mid-flight would stack two simultaneous handshake-compat windows on the same surface.

---

## 3. Parallelizable-vs-sequential matrix

Five notional agent lanes (A–E). A cell marks whether the stage can run concurrently with others or must wait on a gate.

| Stage (program node)                                                                                       | Lane  | Can run in parallel with | Hard predecessor (GATE)                                          |
| ---------------------------------------------------------------------------------------------------------- | ----- | ------------------------ | ---------------------------------------------------------------- |
| **P-A0** registry-cleanup Phase 0 (paths+resolver+doc sweep)                                               | A     | everything               | —                                                                |
| **P-B0** ai-ops N4 `@pops/ai-telemetry`                                                                    | B     | A0, C0, D0               | —                                                                |
| **P-C0** settings S0 `@pops/pillar-settings`                                                               | C     | A0, B0, D0               | —                                                                |
| **P-D0** contacts Phase 0 (crate scaffold + closed-set Record updates + `crates/` root — contacts OWNS it) | D     | A0, B0, C0               | — (authors `crates/` root §1.3)                                  |
| **P-A1** registry-cleanup Phase 1 (core dual-serve + metric)                                               | A     | B0–D0, C1, S-pillars     | GATE-0 (A0) **+ DEPLOY-OBSERVE**                                 |
| **P-B1** ai-ops N0–N3 (ai pillar scaffold + extract + ingest)                                              | B     | A1, C-pillars, D1        | GATE-P0                                                          |
| **P-C1** settings S1 (core RU+reset) + S1.5 (capability plumbing)                                          | C     | A1, B1, D-\*             | GATE-G0 (S0)                                                     |
| **P-D1** contacts N1 (entities domain + **OpenAPI-3.0 proof, G1**)                                         | D     | A1, B1, C1               | GATE-G0 (D0)                                                     |
| **P-B2** ai-ops N5–N7 (migrate 11 Claude callers)                                                          | B     | C2, D2, A2               | GATE-P1+P2                                                       |
| **P-C2** settings S2a–d (per-pillar federation, PARALLEL set)                                              | C     | B2, D2, A2               | GATE-G1 (S1) — the 4 pillars run concurrently                    |
| **P-D2** contacts N2–N4 (registry lifecycle, migrator, finance live-fetch)                                 | D     | B2, C2, A2               | GATE-G1+G2+G3                                                    |
| **P-B3** ai-ops N8 `crates/pops-ai` (TIER 1a)                                                              | B     | C3, D2                   | GATE-P2 (wire) + `crates/` root exists                           |
| **P-C3** settings S6 `crates/pops-settings` (TIER 1b)                                                      | C     | B3, D2                   | GATE-G0 (S0) + `crates/` root + **contacts G1 (3.0 proof)**      |
| **P-A2** registry-cleanup Phase 2a (SDK fallback+invalidation)                                             | A     | B2, C2, D2               | GATE-1 (A1 deployed)                                             |
| **P-D3** contacts N5 (delete core entities) — **IRREVERSIBLE JOIN**                                        | D     | — (join point)           | GATE-G4 (all N4\*) + no-reader proof + soak                      |
| **P-B4** ai-ops core de-AI complete + dashboard move + e2e                                                 | B     | —                        | GATE-P3+P4                                                       |
| **P-C4** settings S3 (aggregator + shell repoint) → S4 → S5                                                | C     | —                        | GATE-G3 (S1.5 + ≥2 federated pillars)                            |
| **P-A3** registry-cleanup Phase 3 (remove legacy paths)                                                    | A     | —                        | A2 fully rolled + metric==0 + homelab GAP-3 widened              |
| **CAPSTONE** core→registry rename                                                                          | (all) | —                        | ALL extractions left core + registry-cleanup path rename settled |

### 3.1 What genuinely runs concurrently

- **Day 0 fan-out (4 lanes):** A0 (registry paths), B0 (`@pops/ai-telemetry`), C0 (`@pops/pillar-settings`), D0 (contacts scaffold). Zero cross-deps; one shared touch is the `crates/Cargo.toml` root (contacts owns it, §1.3) and the closed-set Record updates (`PILLARS`, `ALL_MODULE_IDS`, `PILLAR_UPSTREAMS`) — coordinate so `contacts` and `ai` are added to those maps in one merge to avoid typecheck conflicts (both touch `known-pillar-id.ts`, `module-id.ts`, `generate-nginx-conf.ts`, `known-modules.ts`).
- **Per-pillar settings federation (C2)** is itself a 4-way parallel set: finance, media, inventory, cerebrum each federate independently once S0+S1 are done.
- **Caller migration (B2)** is an 11-site fan-out (finance ×2, cerebrum ×6, food ×3) once ingest (N3) + wrapper (N4) exist.
- **Rust crates (B3, C3)** run in parallel with each other and with contacts N2–N4, once the `crates/` root exists and (for `pops-settings`) contacts G1 has proven 3.0.

### 3.2 What is strictly sequential (the spine)

```
crates/ root  →  TS wrappers  →  Rust crates  →  contacts pillar mounts them
core dual-serve (R1, deployed) → SDK fallback (R2) → legacy removal (R3)
ai/settings/entities EXTRACTIONS all complete  →  CAPSTONE rename
contacts N5 (delete core entities) is an irreversible join: all N4* + no-reader proof + soak
```

### 3.3 Closed-set Record merge-conflict hazard (both contacts + ai-ops touch the same files)

Both plans add a pillar id to: `packages/pillar-sdk/src/capabilities/known-pillar-id.ts` (`PILLARS`), `module-id.ts` (`ALL_MODULE_IDS` + `MODULE_PARENT_PILLAR`), `apps/pops-shell/scripts/generate-nginx-conf.ts` (`PILLAR_UPSTREAMS` + `PILLAR_RENDER_ORDER`), and `packages/module-registry/scripts/known-modules.ts` (regen `generated.ts`). **Mitigation:** land a single "register `ai`+`contacts` pillar ids" prep PR (or strictly serialize the two Phase-0 PRs) so the exhaustive `Record<KnownPillarId,…>` maps gain both keys atomically; otherwise the second PR fails `pnpm -w typecheck` and the lock-step `modules.test.ts`. The program tracker owns sequencing these two edits.

---

## 4. Global execution order with verification GATES

Each stage ends with a GATE = the CI-equivalent command set that MUST pass locally before downstream stages start (repo rule 8: CI never fails). DEPLOY-OBSERVE gates additionally require the change to be live in prod and observed before proceeding.

```
STAGE 1  — Shared foundations (parallel)
  1a registry-cleanup Phase 0  ─ GATE-RC0: @pops/pillar-sdk build+test; resolver+map tests; /manifest.json gone
  1b ai-ops N4 @pops/ai-telemetry ─ GATE-AI-W: pnpm --filter @pops/ai-telemetry test (req+stream+sink+pricing+schema)
  1c settings S0 @pops/pillar-settings ─ GATE-S0: pnpm --filter @pops/pillar-settings test+typecheck (reset/redact/deriveKeySet)
  1d contacts N0 scaffold + closed-set Records ─ GATE-G0: pnpm -w typecheck; registry:build clean; cargo build/test -p contacts
       [crates/ root authored here — contacts is the single owner §1.3]

STAGE 2  — Core-side adoption + extraction starts
  2a registry-cleanup Phase 1 core dual-serve ─ GATE-RC1: core test (dual-serve byte-identical + metric); nginx drift  → DEPLOY+OBSERVE
  2b ai-ops N0–N3 ai pillar scaffold+extract+ingest ─ GATE-AI-P0/P1: ai pillar build+test; ingest writes ONLY ai_inference_log; core de-AI typechecks
  2c settings S1 core RU+reset + S1.5 capability plumbing ─ GATE-S1: core test (reset, DELETE alias, ensure internal, redaction, feature-key assertion); discovery capability round-trip
  2d contacts N1 entities domain + OpenAPI-3.0 proof ─ GATE-G1: cargo test -p contacts; openapi 3.0.x + DOTTED operationIds asserted; hey-api smoke

STAGE 3  — Federation fan-out + Rust crates (heavy parallel)
  3a ai-ops N5–N7 migrate 11 Claude callers ─ GATE-AI-P4: per-caller wrapper+PII+error-placement tests; food sink repoint
  3b settings S2a–d per-pillar federation (×4) ─ GATE-S2/pillar: runtime reads local table; media adapter encoding; finance in-process reader
  3c contacts N2–N4 lifecycle+migrator+finance live-fetch ─ GATE-G2/G3/G4: registry mock; row-parity; live-fetch degradation; in-memory entity-usage join
  3d ai-ops N8 crates/pops-ai ─ GATE-AI-P5: cargo test (golden-fixture parity)
  3e settings S6 crates/pops-settings ─ GATE-S6: cargo test; dot-form operationIds  [gated on contacts G1]
  3f registry-cleanup Phase 2a SDK fallback ─ GATE-RC2a: 404→old; cache-invalidation; 5xx-no-fallback  [after RC1 deployed]

STAGE 4  — Joins, cutovers, shim removal
  4a contacts N5 delete core entities (IRREVERSIBLE) ─ GATE-G5: core build+test; no /entities in core OpenAPI; no-reader grep+soak
  4b ai-ops core de-AI finalize + dashboard move + e2e ─ GATE-AI-P6: cross-service ingest lands a dashboard row
  4c settings S3 aggregator+shell repoint → S4 central-enum shrink → S5 shim removal ─ GATE-S3/S4/S5: e2e federation; central object globals-only
  4d registry-cleanup Phase 3 remove legacy paths ─ GATE-RC3: dotted 404; handshake e2e green; doc-debt grep zero  [metric==0 + homelab GAP-3]

STAGE 5  — CAPSTONE (separate artifact, runs ONLY after STAGE 4 extractions are done)
  5  core→registry rename ─ see 05-core-to-registry-rename.md; its own GATEs RN0–RN6 + DNS dual-alias DEPLOY-OBSERVE window
```

**The capstone precondition is checked as a program gate before STAGE 5:** core's tree contains no `ai_*`, no `entities` schema/service/contract/handler, and settings federation has shrunk `settings-keys.ts` to globals — i.e. core is "essentially just the registry". Verified by: `grep -r "from.*schema/entities\|schema/ai-\|aiConfigManifest" pillars/core/src` returns empty, and `pillars/core/src/db/schema.ts` re-exports only registry/settings/global tables.

---

## 5. Consolidated risk register (spanning all plans)

| #    | Risk                                                                                                                                                                       | Plan(s)                                                | Severity     | Mitigation                                                                                                                                                                              | Gate that catches it                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| R-01 | utoipa emits OpenAPI 3.1; hey-api targets 3.0 → every Rust client-gen breaks; blocks ALL Rust pillars                                                                      | contacts (owns), settings/ai-ops (consume)             | **Critical** | Force 3.0 or deterministic downgrade pass; assert `openapi:"3.0.x"` in snapshot; PROVE in contacts G1 before any OpenAPI-emitting Rust crate                                            | G1; S6 gated on G1                              |
| R-02 | operationId drift (camelCase vs DOTTED `<router>.<proc>`) → finance live-fetch contract-mismatch + contacts/settings search never federates + mixed conventions in one doc | contacts, settings, ai-ops                             | **Critical** | Pin every utoipa `operation_id` to dot-form (`entities.create`, `settings.get`, `search.search`); G1/S6 assert exact id set                                                             | G1, GATE-S6                                     |
| R-03 | Closed-set `Record<KnownPillarId,…>` omission when adding `ai`+`contacts` → `pnpm -w typecheck` fails; two PRs collide on the same maps                                    | contacts + ai-ops                                      | High         | Single prep PR (or strict serialization) adds both ids to PILLARS/ALL_MODULE_IDS/PILLAR_UPSTREAMS/known-modules atomically (§3.3)                                                       | G0, GATE-AI-P0, modules.test                    |
| R-04 | Crates-workspace double-authorship (both plans create `crates/Cargo.toml`)                                                                                                 | contacts + ai-ops                                      | High         | LOCKED: contacts owns the root (§1.3); ai-ops/settings add to `[workspace].members` only                                                                                                | G0 / GATE-AI-P5                                 |
| R-05 | Port collision (ai vs contacts) — 3009 is orchestrator                                                                                                                     | contacts + ai-ops                                      | High         | ai=3008, contacts=3010; coordinate in PILLAR_UPSTREAMS (§1.2)                                                                                                                           | typecheck (`assertRenderOrderCoversAllPillars`) |
| R-06 | AI telemetry no-ops in prod (`AI_API_URL` env never wired on reporting services) → zero rows, headline goal fails                                                          | ai-ops                                                 | **Critical** | Enumerate `AI_API_URL` on finance-api/food-api/food-worker/cerebrum in BOTH compose files; e2e asserts a real cross-service POST lands a row                                            | GATE-AI-P6                                      |
| R-07 | Ingest mistakenly calls `recordInferenceDaily` (a batch aggregator over aged rows) → type error + semantic corruption                                                      | ai-ops                                                 | High         | Ingest does ONLY `createInferenceLog`; test asserts `ai_inference_daily` untouched at ingest                                                                                            | GATE-AI-P1                                      |
| R-08 | Streaming Claude callers (ego.stream, cerebrum query) can't fit `Promise<CallResult<T>>`                                                                                   | ai-ops                                                 | High         | `callWithLoggingStream` (TS) + `call_with_logging_stream` (Rust) first-class; re-yield order + terminal-event usage test                                                                | GATE-AI-W, GATE-AI-P4                           |
| R-09 | entity-usage rollup loses orphanedOnly/type-filter if the join is naively dropped                                                                                          | contacts                                               | High         | In-memory join over the fetched contact set (OD-4), NOT "compute from transactions alone"                                                                                               | GATE-G4 (US-06)                                 |
| R-10 | Contacts-down at import/usage time → crash/block                                                                                                                           | contacts                                               | Med          | Branch on SDK `result.kind !== 'ok'` → empty set + warn; never throw                                                                                                                    | GATE-G4                                         |
| R-11 | Import commit transactionality: remote create inside finance SQLite tx + `type` override + 409 on retry                                                                    | contacts                                               | High         | Pre-create before tx carrying `{name,type}`; create-or-fetch-by-name on 409 (OD-8); harmless-orphan documented                                                                          | GATE-G4                                         |
| R-12 | Settings sensitive leak (`plex_token`, encryption seeds) via new collection + aggregator reads                                                                             | settings                                               | High         | `redactSensitive` on all read paths → `'__redacted__'` sentinel; writes persist real value; e2e asserts sentinel                                                                        | GATE-S0, GATE-S3                                |
| R-13 | Shell writes to a pillar that hasn't shipped `/settings` → silent 404 save failure                                                                                         | settings                                               | High         | Capability-gated routing; plumb `capabilities` through `PillarSnapshot` FIRST (S1.5); else fall back to core (rows copied not moved)                                                    | GATE-S1 (S1.5), GATE-S3                         |
| R-14 | Feature-toggle `settingKey` points at a now-federated key → split-brain re-opens                                                                                           | settings                                               | Med          | `assertFeatureKeysAreCoreOwned` boot assertion                                                                                                                                          | GATE-S1                                         |
| R-15 | Finance `pillar('finance')` self-read = self-HTTP loop with cold-start snapshot dependency                                                                                 | settings                                               | Med          | In-process local settings read, not SDK proxy                                                                                                                                           | GATE-S2/finance                                 |
| R-16 | Registry path-cache eviction-on-rollback (cached new path 404s after a core rollback → heartbeat fails → eviction)                                                         | registry-cleanup; INHERITED by contacts Rust transport | High         | Self-healing resolver: 404 on cached path falls through to alternate candidate IN-CALL + `invalidate()`; contacts Rust loop MUST implement the SAME (it's part of the exposed contract) | GATE-RC2a; contacts G2                          |
| R-17 | Premature legacy-path removal strands old-SDK pillars (combo 2)                                                                                                            | registry-cleanup                                       | High         | Phase 3.2 gated on zero-legacy-traffic metric + ordered after 3.1 rollout + homelab GAP-3 widened                                                                                       | GATE-RC3                                        |
| R-18 | Irreversible core-entities deletion before all readers gone                                                                                                                | contacts                                               | **Critical** | Gate N5 behind no-reader grep + core access observation + soak; litestream restore is the only rollback                                                                                 | GATE-G5                                         |
| R-19 | CAPSTONE breaks the register/heartbeat/discovery handshake mid-rollout (DNS cutover)                                                                                       | registry-rename                                        | **Critical** | Run BOTH `core-api` and `registry-api` as network aliases on one container until all baked-in default URLs roll over; SDK default-URL change rides a separate Watchtower cycle          | `05-core-to-registry-rename.md` GATE-RN5        |
| R-20 | Two simultaneous handshake-compat windows (path rename + DNS rename) stacked on one surface                                                                                | registry-cleanup + registry-rename                     | High         | Locked decision 6: settle path rename + window FIRST, then DNS cutover; windows kept orthogonal                                                                                         | program STAGE 4→5 gate                          |
| R-21 | `ai_usage` PII-bearing table mis-routed into the ai pillar                                                                                                                 | ai-ops + finance                                       | Med          | Re-home to finance; ai-ops deletes from core; gap issue if finance declines                                                                                                             | ai-ops Open Decision 1                          |
| R-22 | OpenAPI/registry drift across all pillars (generated docs stale)                                                                                                           | all                                                    | Med          | `generate:openapi && git diff --exit-code` + `registry:build && git diff --exit-code` in every pillar's gate                                                                            | every GATE                                      |

---

## 6. Program-level execution summary

1. **Fan out STAGE 1** across four lanes (registry paths, `@pops/ai-telemetry`, `@pops/pillar-settings`, contacts scaffold). Land the closed-set-Record prep atomically (R-03).
2. **STAGE 2** brings core-side adoption: registry dual-serve (deploy+observe), ai pillar extract+ingest, settings core RU+reset + capability plumbing, contacts entities domain + the OpenAPI-3.0 proof (G1) that unblocks the Rust crates.
3. **STAGE 3** is the heavy parallel band: 11 caller migrations, 4-way settings federation, contacts lifecycle/migrator/finance-cutover, and the two Rust crates (`pops-ai`, `pops-settings` — the latter gated on G1).
4. **STAGE 4** does the joins and cutovers: contacts' irreversible core-entities deletion (soak-gated), ai-ops core de-AI finalize + e2e, settings aggregator+shell+shim removal, registry-cleanup legacy-path removal.
5. **STAGE 5** is the capstone rename — fired ONLY once core is "essentially just the registry" and the path rename has settled. Its full plan, tests, and rolling-deploy compat are in `05-core-to-registry-rename.md`.

The single most important sequencing invariant: **shared infra (TS wrappers + Rust crates) exists before the contacts Rust pillar implements them, registry-cleanup's dual-serve+fallback shims land before the capstone, and the capstone runs strictly last.**
