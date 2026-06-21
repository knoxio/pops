# Plan `ai-ops` — AI Ops pillar extraction + real telemetry (FINAL)

> Authored 2026-06-21 17:26 AEST; FINALIZED after review (verdict was `needs-work`). Grounded against the live tree on branch `fix/pillar-vitest-exclude-colocated-app`. Every claim below was re-verified with grep/Read before writing. The three review mustFix items are resolved in §4.3 (ingest never calls `recordInferenceDaily`), §4.4 + §5/Phase 2 (a real streaming entrypoint `callWithLoggingStream`), and §5/Phase 5 + §7 (explicit per-consumer `AI_API_URL` env wiring). Sound shouldFix items applied; rejections noted inline. All crossPlanConflicts resolved in §10.

---

## 0. Review fold-in summary (what changed from the prior draft)

**mustFix (all applied):**

1. **Ingest no longer calls `recordInferenceDaily`.** Verified `pillars/core/src/db/services/ai-usage-retention.ts:122` — `recordInferenceDaily(db, agg)` takes an `InferenceDailyAggregate` (`{date,totalCalls,totalInputTokens,totalOutputTokens,totalCostUsd,avgLatencyMs,errorCount,timeoutCount,cacheHitCount,budgetBlockedCount}`), NOT a per-record `InferenceRecord`. The prior draft's `recordInferenceDaily(db, body)` was a guaranteed TS type error AND semantically wrong (the daily table is fed by the retention aggregator from BATCHES of aged rows, `retention-db.ts:18-22 fetchAgedInferenceLogs → recordInferenceDaily`). **Fix: the ingest handler does ONLY `createInferenceLog`. The observability scheduler keeps `ai_inference_daily` hot** (it already runs the aggregator). See §4.3.
2. **Streaming callers get a real entrypoint.** Verified 2 streaming sites that CANNOT be expressed as `Promise<CallResult<T>>`: `pillars/cerebrum/src/api/modules/ego/llm.ts:129` (`async *stream`, usage only at `messageStream.finalMessage()`), and `pillars/cerebrum/src/api/modules/query/llm.ts:142` (`client.messages.stream`). **Fix: `@pops/ai-telemetry` ships a second entrypoint `callWithLoggingStream` (§4.4) that wraps a generator + a usage-extractor and fires the report from the terminal event** — designed here, not deferred. Rust gets the streaming variant too.
3. **Per-consumer `AI_API_URL` env wiring enumerated.** Verified `infra/docker-compose.yml`: `food-worker`/`food-api` set `POPS_API_URL: http://food-api:3005` (themselves, line 321), `cerebrum` sets `POPS_API_URL: http://cerebrum-api:3007` (itself, line 620), finance has NO `POPS_API_URL`. After repointing the sink at `/ai-usage/record`, none of these reach the ai pillar → zero production telemetry. **Fix: §5/Phase 5 + §7 enumerate adding `AI_API_URL: http://ai-api:3008` + `POPS_API_INTERNAL_TOKEN` to every reporting service** (food-api, food-worker, cerebrum, finance-api) in BOTH `docker-compose.yml` and `docker-compose.dev.yml`. The sink reads `AI_API_URL` FIRST (so it never collides with the existing self-pointing `POPS_API_URL`).

**shouldFix (applied):**

- **Shared wrapper renamed `@pops/ai` → `@pops/ai-telemetry`.** Verified `packages/pillar-sdk/src/manifest-schema/validate.ts` enforces `contract.package === '@pops/ai'` for pillar id `ai`; the pillar npm package is `@pops/ai-pillar`. Three names claiming `@pops/ai` is confusing for client-gen/humans. The shared wrapper is now `@pops/ai-telemetry`; the pillar's manifest `contract.package` stays the validator-required `@pops/ai`; the pillar npm package stays `@pops/ai-pillar`.
- **Pricing HTTP field mapping stated.** Verified `pillars/core/src/contract/rest-ai-providers.ts:29-30` exposes `models[].{inputCostPerMtok,outputCostPerMtok}` over HTTP, whereas the in-process `createPricingCache.lookup()` returns `{input,output}`. §3 + §4.4 now specify the HTTP `lookupPricing` adapter maps `inputCostPerMtok→input, outputCostPerMtok→output` before `computeCostUsd`. Open Decision 8 recommends a dedicated `GET /ai-pricing/:provider/:model → {input,output}` read so callers don't re-derive.
- **Corrections error-telemetry placement spelled out per caller.** §5/Phase 3 now states: `callWithLogging` wraps the `client.messages.create(...)` INSIDE the existing `try`, so the error row is scheduled (fire-and-forget) BEFORE the outer `catch` swallows and returns null. Placement table added.
- **KnownPillarId doc comment fixed.** `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:11` ("AI Ops is intentionally NOT a pillar — it lives inside core") is updated in the SAME edit that adds `'ai'` to `PILLARS`.
- **Count corrected.** `ai_inference_log` has **15 columns + 6 indexes** (verified `ai-inference-log.ts:5-29`), not 17. §1.2 corrected.
- **Ingest operationId pinned.** Pinned to `aiIngest.record` (deterministic for the drift gate). NOT load-bearing for client resolution — `reportInference` POSTs a hardcoded `/ai-usage/record` URL via raw fetch, never the generated SDK. Noted in §4.3.

**shouldFix (none rejected)** — all five were sound.

**crossPlanConflicts (all resolved):** port → ai=3008 (free), contacts=3010 (3009 is orchestrator); settings → interim local table is ratified transitional state; crates workspace → `crates/Cargo.toml` ROOT is OWNED BY CONTACTS (plan 01); ai-ops only ADDS `pops-ai` to `[workspace].members`. See §10.

---

## 1. Goal & scope

### 1.1 What changes

1. **Extract the entire AI-ops backend out of `core` into a NEW `ai` pillar.** All 8 `ai_*` tables (modulo `ai_usage`, which goes to finance — Open Decision 1), their services, the five `ai-*` API modules, the five `rest-ai-*` contracts + handlers, the two schedulers, and the AI-usage frontend move from `pillars/core` → `pillars/ai`. The `ai` module id is already reserved in `packages/module-registry` (`hasBackend:false`); this plan flips it to a first-class backed+fronted pillar.
2. **Make telemetry REAL by adding the ingest path.** Add `POST /ai-usage/record` (internal-only) on the ai pillar — the FIRST production write path into `ai_inference_log` (today `createInferenceLog` has zero production callers — verified).
3. **Ship a shared `@pops/ai-telemetry` TS package** (the battle-tested food wrapper, generalized + de-React-coupled, with BOTH a request/response and a streaming entrypoint) and a **`crates/pops-ai` Rust crate** (1:1 over the same wire contract). EVERY pillar that calls Claude routes through it and reports usage/cost/latency/cache/error.
4. **Migrate all 11 direct-Anthropic callers** (finance ×2, cerebrum ×6, food worker ×3) to report through the shared wrapper.
5. **Reconcile food's per-pillar log:** repoint food's sink at the ai pillar's `/ai-usage/record`, delete food's local `ai_inference_log` table + `/ai/log-inference` route, backfill historical rows.
6. **Budgets + alerts act on real ingested data** — once every pillar reports, the existing budget/alert/observability surfaces (now in the ai pillar) compute against a federation-wide `ai_inference_log` instead of an empty table.
7. **Strip PII per repo rules** at every report site (only merchant descriptions reach Claude; the telemetry store NEVER carries prompts/responses/raw rows).

### 1.2 What explicitly does NOT change

- **The telemetry schema columns** — `ai_inference_log`'s **15 columns + 6 indexes** (verified `ai-inference-log.ts:5-29`: `id,provider,model,operation,domain,input_tokens,output_tokens,cost_usd,latency_ms,status,cached,context_id,error_message,metadata,created_at`) are carried verbatim into the ai pillar. No column renames (we map wrapper field names to existing columns, not the reverse).
- **The daily-rollup write path** — `ai_inference_daily` is populated by the retention/observability aggregator from batches of aged log rows, NOT per-record at ingest. Ingest writes ONLY `ai_inference_log`. Unchanged.
- **Budget pre-call enforcement** stays server-side in the ai pillar (it is NOT folded into the cross-pillar wrapper in v1 — matches current finance/cerebrum behavior of zero enforcement). Tracked follow-up only.
- **`ai_usage` table** (finance-categorizer per-description usage) and `ai-usage/cache.ts` (`ai_entity_cache.json`) — PII-bearing finance-categorizer state, NOT AI-ops telemetry. They do NOT move to the ai pillar; they go to finance (Open Decision 1).
- **Core's registry handshake** — the ai pillar registers via the existing `/core.registry.*` envelope like every other pillar; this plan does not touch the registry rename (that is the registry-rename plan).
- **`crates/pops-ai` has no in-tree consumer yet** (no Rust pillar — verified `find . -name Cargo.toml` empty). Ships tested-but-unused until the contacts Rust pillar consumes it.

---

## 2. PRD / US mapping

### 2.1 Theme + epic home

Theme `docs/themes/05-ai/` (verified present). Epic `docs/themes/05-ai/epics/00-ai-operations-app.md`. Existing PRDs in `docs/themes/05-ai/prds/`: `052-ai-usage-cost-tracking` (Done), `053-ai-configuration-rules` (Done), `055-ai-inference-monitoring` (Not started / NOT READY), `092-ai-observability` (In progress).

### 2.2 PRDs to create / update

- **PRD-055 "AI Inference & Monitoring"** (today _Not started, NOT READY_) → **promote to In progress**; umbrella for the ingest path + shared wrapper. User stories:
  - **US-01** — _AI pillar extraction_: move all `ai_*` backend+frontend out of core into `pillars/ai` with no behavior regression. Acceptance: core builds with zero `ai_*` references; ai pillar self-registers; observability/budgets/alerts/providers REST surfaces respond identically from the new pillar.
  - **US-02** — _Ingest route_: `POST /ai-usage/record` internal-only, best-effort, single-row write (`createInferenceLog` only). Acceptance mirrors GATE-P1.
  - **US-03** — _Shared `@pops/ai-telemetry` wrapper_: one fire-and-forget `callWithLogging` + a streaming `callWithLoggingStream`; both food copies deleted (DRY). Acceptance mirrors GATE-P2.
  - **US-04** — _Caller migration_: all 11 Anthropic sites (incl. 2 streaming) report through the wrapper. Acceptance mirrors GATE-P4; PII assertion + error-placement assertion included.
  - **US-05** — _Rust crate `pops-ai`_: 1:1 over the wire contract (request + streaming), golden-fixture cross-language parity test. Acceptance mirrors GATE-P5.
  - **US-06** — _Food reconciliation_: repoint food sink, delete local table/route, backfill. Acceptance mirrors §6.
- **PRD-092 "AI Observability Platform"** (In progress) — update its US table to note the data source flipped from "empty/test-only" to "live federation-wide ingest"; tick the acceptance criterion that previously could not be met (no production writer).
- **New PRD is NOT needed** — PRD-055 + PRD-092 cover it (DRY at the doc level).

### 2.3 Doc-status flow (AGENTS.md:382-419, verified)

Each US ticks `- [ ]` → `- [x]`; PRD-055/092 README US tables updated; epic `00-ai-operations-app.md` table updated; theme `05-ai/README.md` updated. Status flows US → PRD → Epic → Theme.

### 2.4 Gap-issue policy (AGENTS.md:421-445, verified)

Any acceptance criterion that cannot be ticked → a GitHub issue `drift-check(PRD-055) US-NN — <missing>` BEFORE PR merge, linked in a `## Gaps (tracked)` PR section. Known up-front gaps to file:

- `drift-check(PRD-055) US-02 — pre-call budget enforcement not wired into cross-pillar wrapper (v1 telemetry-only)`.
- `drift-check(PRD-055) US-05 — crates/pops-ai has no in-tree consumer until contacts Rust pillar lands`.
- `drift-check(PRD-055) US-06 — ai_usage table re-home to finance pending finance-plan ratification`.

---

## 3. Current state (grounded, file:line — re-verified this session)

- **AI-ops lives entirely in core.** Schema barrel `pillars/core/src/db/schema.ts:10-17` re-exports `aiAlertRules, aiAlerts, aiBudgets, aiInferenceDaily, aiInferenceLog, aiModelPricing, aiProviders, aiUsage`. Schema dir has all 8 tables + their `*-row-schemas.ts` siblings. Services `pillars/core/src/db/services/{ai-usage,ai-usage-budgets,ai-usage-dashboard,ai-usage-filters,ai-usage-retention,ai-model-pricing}.ts`. Modules `pillars/core/src/api/modules/{ai-usage,ai-providers,ai-budgets,ai-alerts,ai-observability}/`. Contracts `pillars/core/src/contract/rest-ai-{usage,providers,budgets,alerts,observability}.ts`. Handlers `pillars/core/src/api/rest/ai-*-handlers.ts`.
- **`ai_inference_log` = 15 columns + 6 indexes** (verified `ai-inference-log.ts:5-29`).
- **`recordInferenceDaily` is a BATCH aggregator, not a per-record sink** (verified `ai-usage-retention.ts:47-122` — takes `InferenceDailyAggregate`, fed by `fetchAgedInferenceLogs`). The ingest path MUST NOT call it.
- **REST is READ/config-only — NO ingest.** `createInferenceLog` (`ai-usage.ts:122`) has exactly ONE non-test reference: its own definition (verified grep). No `/ai-usage/record` or `/ai/log-inference` route in any core contract.
- **Wiring to remove from core:** `pillars/core/src/contract/rest.ts:16-20,33-37`, `pillars/core/src/api/rest/handlers.ts:13-17,33-37`, `pillars/core/src/api/server.ts:27-28,82-84,107-108`.
- **Only production writer is food, to its OWN DB.** `pillars/food/src/contract/rest-ai.ts` (`foodAiContract.logInference`, `POST /ai/log-inference`, internal), `pillars/food/src/api/rest/ai-handlers.ts:18-49` writes food's local `ai_inference_log`, `domain='food'` hardcoded, `prompt_version` merged into metadata, best-effort try/catch.
- **Food wrapper is the template** but React-coupled: `pillars/food/app/src/ai/log-inference.ts` (`callClaudeWithLogging`) + `log-inference-sink.ts` (env POST to food's own `/ai/log-inference`, no-ops when `POPS_API_URL`/`POPS_API_INTERNAL_TOKEN` unset) + `log-inference-types.ts`. DUPLICATED backend copy `pillars/food/src/worker/ai/log-inference.ts` (header: "follow-up tracked in PRD-133 will extract it to a backend-only package").
- **11 direct-Anthropic callers** (verified grep `new Anthropic(`): finance `imports/ai-categorizer.ts`, `corrections/ai-runtime.ts`; cerebrum `{ego,ingest,workers,emit,query}/llm.ts` + `nudges/contradiction-analyzer.ts`; food worker `anthropic.ts`/`web-llm-anthropic.ts`/`anthropic-client.ts`. **2 are streaming**: ego `stream` (`ego/llm.ts:129`, usage at `messageStream.finalMessage()` line 163-169) and cerebrum query (`query/llm.ts:142`).
- **corrections `defaultCompleter` swallows errors** (verified `corrections/ai-runtime.ts:40-50`: `try { client.messages.create(...) } catch { return null }` — never throws). Error-telemetry placement matters.
- **No shared `@pops/ai*` package** — `packages/` = `db-types, module-registry, navigation, pillar-sdk, shared-schema, types, ui` (verified).
- **No Rust** anywhere (`find . -name Cargo.toml` empty). No `contacts` pillar.
- **`ai` module reserved** — `packages/module-registry/src/generated.ts:25-34` `{id:'ai',name:'AI Ops',surfaces:['app'],hasBackend:false,hasFrontend:false}`. GENERATED; source `packages/module-registry/scripts/known-modules.ts`; regen `pnpm registry:build`.
- **Core migrations for ai:** `pillars/core/migrations/{0057_ai_usage_baseline,0059_ai_model_pricing,0061_ai_usage,0062_ai_alert_rules,0063_ai_alerts,0064_ai_providers}.sql`. Core keeps these historically; a later PR `DROP TABLE`s post-cutover.
- **Pricing lookup shape:** `pillars/core/src/db/services/ai-model-pricing.ts` `createPricingCache(db).lookup(provider,model) → {input,output}` (per-Mtok USD), fallback `{input:1.0,output:5.0}`. **HTTP `GET /ai-providers` exposes `models[].{inputCostPerMtok,outputCostPerMtok}`** (verified `rest-ai-providers.ts:29-30`) — the cross-pillar caller must map these to `{input,output}`.
- **DB open template:** `pillars/core/src/db/open-core-db.ts` — better-sqlite3 + drizzle, `migrationsDir()` resolves `pillars/core/migrations/meta/_journal.json`, pragmas WAL/foreign_keys=ON/busy_timeout=5000.
- **Pillar id registry:** `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:15-23` `PILLARS = ['core','finance','media','inventory','cerebrum','food','lists']` (NO `ai`; **doc comment line 11 says "AI Ops is intentionally NOT a pillar — it lives inside core"** — must be updated). nginx `PILLAR_UPSTREAMS` (`generate-nginx-conf.ts:67-90`), cerebrum=3007 highest. **Port 3009 is taken by `pops-orchestrator`** (verified `docker-compose.yml:459-463`); 3008 is free.
- **Reporting-service env (verified `docker-compose.yml`):** food-api/food-worker `POPS_API_URL: http://food-api:3005`; cerebrum `POPS_API_URL: http://cerebrum-api:3007`; finance has NONE. **None point at an ai pillar** — must add `AI_API_URL`.
- **Vitest app exclusion** (commit 4b4d99c3): the new ai pillar's `vitest.config.ts` must exclude colocated `app/`.

---

## 4. Target architecture

### 4.1 Topology

```
   every pillar that      ┌──────────────────────────────────────────────┐
   calls Claude  ────────▶│ @pops/ai-telemetry (TS) + crates/pops-ai (Rust)│
   (finance, cerebrum,    │  callWithLogging(opts, deps)        ← req/resp  │
    food, future Rust     │  callWithLoggingStream(opts, deps)  ← streaming │
    contacts)             │   • measure latency                            │
                          │   • lookupPricing → computeCostUsd             │
                          │   • fire-and-forget report()                   │
                          └───────────────────┬──────────────────────────-─┘
                                              │ POST /ai-usage/record (x-pops-internal-token)
                                              │ docker-network internal, NOT public via nginx
                                              │ target URL = $AI_API_URL (http://ai-api:3008)
                                              ▼
        ┌────────────────────────────────────────────────────────────────┐
        │                    ai pillar  (pops-ai-api:3008)                 │
        │  ai.db (own SQLite + litestream/ai.yml)                          │
        │  POST /ai-usage/record ─▶ createInferenceLog  (ONLY; no daily)   │
        │  GET /ai-usage/{stats,history,cache}                             │
        │  GET /ai-observability/{stats,history,latency,quality}          │
        │  GET/POST /ai-providers (+ GET /ai-pricing/:p/:m → {input,output})│
        │  GET/POST /ai-budgets, /ai-budgets/status                       │
        │  /ai-alerts/* (rules CRUD, run, acknowledge)                    │
        │  schedulers: observability(daily rollup) + alerts               │
        │  manifest.settings.manifests: aiConfigManifest                  │
        │  registers via POST /core.registry.register (standard envelope) │
        └────────────────────────────────────────────────────────────────┘
                                              ▲ GET /core.registry.list
                            ┌─────────────────┴────────┐
                            │   core (registry)        │  — NO ai_* tables/routes
                            └──────────────────────────┘
        shell: pillars/ai/app (AiUsagePage) loads via registry-walk; nginx /ai-api/
```

### 4.2 New file layout

```
packages/ai-telemetry/                          # NEW shared TS wrapper (US-03)  [renamed from @pops/ai]
  package.json            (name: @pops/ai-telemetry, type: module,
                           exports ./types ./call-with-logging ./call-with-logging-stream ./report-sink ./record-schema)
  tsconfig.json
  vitest.config.ts
  src/
    types.ts              # InferenceRecord, CallWithLoggingOpts/Deps, StreamOpts, PricingEntry, LookupPricingFn, ReportInferenceFn
    call-with-logging.ts  # callWithLogging<T>, computeCostUsd
    call-with-logging-stream.ts  # callWithLoggingStream<E> (generator-aware)
    report-sink.ts        # reportInference (env-driven POST /ai-usage/record; AI_API_URL first)
    record-schema.ts      # zod InferenceRecordSchema (single source of truth; re-used by ai pillar ingest)
    pricing-http.ts       # httpLookupPricing(baseUrl) -> LookupPricingFn (maps inputCostPerMtok→input)
    index.ts
    __tests__/{call-with-logging,call-with-logging-stream,report-sink,record-schema,pricing-http}.test.ts

crates/                                          # cargo workspace ROOT owned by contacts (plan 01) — §10
  Cargo.toml              # [workspace] members = ["pops-ai"]
  pops-ai/
    Cargo.toml            # serde, serde_json, reqwest, tokio, async-trait, thiserror, anyhow
    src/lib.rs            # InferenceRecord (serde camelCase), call_with_logging, call_with_logging_stream, ReportSink, EnvHttpSink
    tests/contract.rs     # golden-JSON parity against shared fixture
    tests/fixtures/record.json   # shared with packages/ai-telemetry record-schema test

pillars/ai/                                      # NEW pillar (US-01)
  package.json            (name: @pops/ai-pillar — distinct from @pops/ai-telemetry; manifest contract.package = @pops/ai)
  tsconfig.json
  vitest.config.ts        (excludes app/ — mirror core, commit 4b4d99c3)
  Dockerfile              (hand-written, node:22-slim, EXPOSE 3008)
  migrations/             (0000_ai_baseline.sql + meta/_journal.json)
  openapi/ai.openapi.json (committed, served at /openapi)
  scripts/{generate-openapi.ts,generate-api-types.ts}
  src/
    db/
      open-ai-db.ts       (mirror open-core-db.ts; AiDb handle; env AI_SQLITE_PATH default /data/sqlite/ai.db)
      schema.ts           (barrel: aiAlertRules, aiAlerts, aiBudgets, aiInferenceDaily, aiInferenceLog, aiModelPricing, aiProviders + settings/userSettings)
      schema/ai-*.ts      (moved from core, verbatim — NOT ai-usage.ts)
      services/ai-*.ts    (moved; CoreDb→AiDb)
    contract/
      rest.ts             (composes the 5 ai contracts + rest-settings + the new ingest + pricing read)
      rest-ai-*.ts        (moved; coreAi*Contract → ai*Contract)
      rest-ingest.ts      (NEW: POST /ai-usage/record — imports InferenceRecordSchema from @pops/ai-telemetry/record-schema)
      rest-pricing.ts     (NEW: GET /ai-pricing/:provider/:model → {input,output})
    api/
      app.ts              (createAiApiApp; INTERNAL_PATHS gate on /ai-usage/record)
      server.ts           (bootstrapPillar + schedulers)
      ai-manifest.ts      (manifest; contract.package='@pops/ai'; search.adapters:[]; settings.manifests:[aiConfigManifest]; healthcheck:/health)
      rest/{handlers.ts, ai-*-handlers.ts, ingest-handler.ts, pricing-handler.ts}
      modules/ai-*/       (moved verbatim — NOT ai-usage/cache.ts)
  app/                    (colocated FE — moved AiUsagePage; @pops/app-ai)
    package.json, openapi-ts.config.ts (input ../openapi/ai.openapi.json, output src/ai-api/)
    src/{routes.tsx,manifest.ts,pages/AiUsagePage.tsx,pages/ai-usage/*}

infra/
  docker-compose.yml      (+ ai-api service; + AI_API_URL/POPS_API_INTERNAL_TOKEN on finance-api, food-api, food-worker, cerebrum)
  docker-compose.dev.yml  (same)
  litestream/ai.yml       (NEW, per-pillar shape)
```

### 4.3 Wire contracts this plan OWNS

**`POST /ai-usage/record`** (internal-only, `x-pops-internal-token`), the canonical cross-pillar sink. Body = the `@pops/ai-telemetry` `InferenceRecordSchema` (zod), one row per call:

```ts
// packages/ai-telemetry/src/record-schema.ts — SINGLE SOURCE OF TRUTH (imported by ai pillar's rest-ingest.ts)
export const InferenceRecordSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  operation: z.string().min(1), // free-form; each pillar owns its vocabulary
  domain: z.string().min(1), // caller's pillar id; validated against KNOWN_MODULES
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  status: z.enum(['success', 'error', 'timeout', 'budget-blocked']), // widened (Open Decision 3)
  cached: z.boolean(), // stored 0|1
  contextId: z.string().max(128).regex(/^\S+$/).optional(), // opaque low-cardinality key, no whitespace (PII guard)
  promptVersion: z.string().max(64).optional(), // merged into metadata.prompt_version server-side
  errorMessage: z.string().max(1000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(), // caller-supplied, PII-free; server caps JSON length
});
export type InferenceRecord = z.infer<typeof InferenceRecordSchema>;
```

Response: `200 { ok: true }` always (best-effort; even when the DB insert throws). The handler defensively caps `JSON.stringify(metadata)` (truncate > ~4 KB) to block accidental prompt dumping. **The handler does ONLY `createInferenceLog` — it NEVER calls `recordInferenceDaily`** (that is a batch aggregator over aged rows; the observability scheduler owns the daily rollup). OpenAPI `operationId='aiIngest.record'` (pinned; cosmetic for the drift gate only — `reportInference` POSTs a hardcoded URL, not the generated SDK).

**Field → column mapping** (NO column renames): `inputTokens→input_tokens`, `outputTokens→output_tokens`, `cached(bool)→cached(0|1)`, `errorMessage→error_message`, `promptVersion→metadata.prompt_version` (JSON), `contextId→context_id`. `provider, model, operation, domain, costUsd, latencyMs, status, metadata` already match. No `prompt_version` column — lives in `metadata` JSON (food's convention, preserved).

**`GET /ai-pricing/:provider/:model`** (NEW, public-readable) → `{ input: number, output: number }` (per-Mtok USD), backed by `createPricingCache(db).lookup()`. Exists so cross-pillar callers fetch pricing already shaped as `PricingEntry` instead of mapping `inputCostPerMtok`/`outputCostPerMtok` themselves. (Open Decision 8.)

### 4.4 Shared interfaces this plan EXPOSES

```ts
// packages/ai-telemetry/src/types.ts
export interface InferenceRecord {
  /* = InferenceRecordSchema shape */
}
export type ReportInferenceFn = (r: InferenceRecord) => Promise<void>;
export interface PricingEntry {
  input: number;
  output: number;
} // per-Mtok USD
export type LookupPricingFn = (provider: string, model: string) => Promise<PricingEntry | null>;
export interface CallResult<T> {
  response: T;
  usage: { inputTokens: number; outputTokens: number };
}

// ---- request/response entrypoint ----
export interface CallWithLoggingOpts<T> {
  provider: string;
  model: string;
  operation: string;
  domain: string;
  contextId?: string;
  promptVersion?: string;
  metadata?: Record<string, unknown>;
  costCapUsd?: number;
  call: () => Promise<CallResult<T>>;
}
export interface CallWithLoggingDeps {
  report?: ReportInferenceFn; // default: env-driven reportInference
  lookupPricing: LookupPricingFn;
  warn?: (m: string, e: unknown) => void;
}
export async function callWithLogging<T>(
  opts: CallWithLoggingOpts<T>,
  deps: CallWithLoggingDeps
): Promise<T>;

// ---- streaming entrypoint (mustFix #2) ----
// Wraps an async generator. The wrapper RE-YIELDS every event unchanged, accumulates nothing
// itself, and after the generator is fully drained (or throws) extracts usage via the caller's
// extractor and fires the report fire-and-forget. Usage is unknown until the terminal event,
// so extractUsage runs on the LAST observed event (or a caller-tracked accumulator).
export interface CallWithLoggingStreamOpts<E> {
  provider: string;
  model: string;
  operation: string;
  domain: string;
  contextId?: string;
  promptVersion?: string;
  metadata?: Record<string, unknown>;
  costCapUsd?: number;
  stream: () => AsyncGenerator<E>; // the underlying Claude stream generator
  extractUsage: (lastEvent: E | undefined) => { inputTokens: number; outputTokens: number } | null;
  // null => usage unavailable (e.g. early error)
}
export function callWithLoggingStream<E>(
  opts: CallWithLoggingStreamOpts<E>,
  deps: CallWithLoggingDeps
): AsyncGenerator<E>;
// Behavior: yields each event verbatim; tracks the last event; on generator completion →
// extractUsage(last) → lookupPricing → computeCostUsd → fire report (status 'success').
// on generator throw → fire report (status 'error', tokens 0, errorMessage) BEFORE rethrow.
// NEVER buffers the stream; NEVER delays a yield (report is scheduled after the loop, off the hot path).

export function computeCostUsd(
  input: number,
  output: number,
  p: PricingEntry | null
): { costUsd: number; missing: boolean };

// packages/ai-telemetry/src/pricing-http.ts
// Adapter for the cross-pillar HTTP pricing read. Prefers GET /ai-pricing/:p/:m ({input,output});
// falls back to GET /ai-providers and maps models[].{inputCostPerMtok,outputCostPerMtok}->{input,output}.
export function httpLookupPricing(aiApiBaseUrl: string): LookupPricingFn;
```

**Streaming design note (resolves mustFix #2):** ego.stream and cerebrum query both yield a terminal `done` event carrying `finalMessage().usage`. They migrate by passing their generator to `callWithLoggingStream` with `extractUsage = (e) => e?.type === 'done' ? { inputTokens: e.tokensIn, outputTokens: e.tokensOut } : null`. The wrapper re-yields tokens with zero added latency and fires the report after the stream closes. No streaming caller hand-rolls report logic — DRY preserved.

### 4.5 Shared interfaces this plan CONSUMES

- From the **settings plan**: the per-pillar settings RU+RESET protocol. The ai pillar mounts a `coreSettingsContract`-shaped router for its own `ai.*` keys and declares `aiConfigManifest` under `manifest.settings.manifests`. Until that plan lands, the ai pillar owns a local `settings`/`user_settings` table (mirror of core's) so its own keys resolve — NOT blocked (see §10, ratified transitional state).
- From the **contacts/Rust plan**: the `crates/` cargo workspace ROOT scaffold + Rust CI lane (contacts owns it — §10). ai-ops only adds `pops-ai` to `[workspace].members`.

---

## 5. Phased implementation

### Phase 0 — AI pillar scaffold + extraction (US-01)

**Goal:** stand up `pillars/ai` as a byte-identical relocation of core's AI-ops, registering and serving the same READ surfaces, against its own `ai.db`. No new behavior yet.

**New files (scaffold, cloned from core templates):**

- `pillars/ai/package.json` — name `@pops/ai-pillar`, scripts mirror `pillars/core/package.json:29` (`build: tsc && tsx scripts/generate-openapi.ts && tsx scripts/generate-api-types.ts`, `test: vitest run`, `generate:openapi`, `typecheck`). Depends on `@pops/pillar-sdk`, `@pops/types`, `@pops/ai-telemetry`, drizzle, better-sqlite3, express, @ts-rest/\*.
- `pillars/ai/tsconfig.json`, `pillars/ai/vitest.config.ts` (clone core; **exclude `app/`** per commit 4b4d99c3).
- `pillars/ai/scripts/generate-openapi.ts`, `generate-api-types.ts` (clone finance/core; `info.title='AI Ops'`, `setOperationId:'concatenated-path'`).
- `pillars/ai/src/db/open-ai-db.ts` — clone `open-core-db.ts`, rename `CoreDb`→`AiDb`, `migrationsDir()` → `pillars/ai/migrations`, env `AI_SQLITE_PATH` default `/data/sqlite/ai.db`, same pragmas.

**Moved files (git mv, then mechanical rename `CoreDb`→`AiDb`, `coreAi*Contract`→`ai*Contract`):**

- `pillars/core/src/db/schema/ai-{alert-rules,alerts,budgets,inference-daily,inference-log,model-pricing,providers}.ts` (+ `*-row-schemas.ts`) → `pillars/ai/src/db/schema/`. **`ai-usage.ts` + `ai-usage-row-schemas.ts` do NOT move here** (Open Decision 1 — finance).
- `pillars/core/src/db/services/{ai-usage,ai-usage-budgets,ai-usage-dashboard,ai-usage-filters,ai-usage-retention,ai-model-pricing}.ts` → `pillars/ai/src/db/services/`.
- `pillars/core/src/api/modules/{ai-usage,ai-providers,ai-budgets,ai-alerts,ai-observability}/**` → `pillars/ai/src/api/modules/`. **`ai-usage/cache.ts` (finance-categorizer disk cache) does NOT move here** — re-home to finance with `ai_usage`.
- `pillars/core/src/contract/rest-ai-{usage,providers,budgets,alerts,observability}.ts` → `pillars/ai/src/contract/`. Rename consts `coreAi*Contract`→`ai*Contract`.
- `pillars/core/src/api/rest/ai-{alerts,budgets,observability,providers,usage}-handlers.ts` → `pillars/ai/src/api/rest/`.

**New pillar wiring:**

- `pillars/ai/src/db/schema.ts` — barrel re-exporting the 7 moved tables + (local interim) `settings`, `userSettings`.
- `pillars/ai/src/contract/rest.ts`:
  ```ts
  export const aiContract = c.router(
    {
      aiAlerts: aiAlertsContract,
      aiBudgets: aiBudgetsContract,
      aiObservability: aiObservabilityContract,
      aiProviders: aiProvidersContract,
      aiUsage: aiUsageContract,
      aiIngest: aiIngestContract, // Phase 1
      aiPricing: aiPricingContract, // GET /ai-pricing/:p/:m
      settings: coreSettingsShapedContract, // interim local; settings-plan supersedes
    },
    { pathPrefix: '' }
  );
  ```
- `pillars/ai/src/api/rest/handlers.ts` — `makeAi*Handlers(db)` factories (moved), `makeAiApiHandlers(db)` aggregate.
- `pillars/ai/src/api/app.ts` — `createAiApiApp(deps): Express`: `disable('x-powered-by')`, `express.json({limit})`, `GET /health` (`{ok,status:'ok',pillar:'ai',version,ts,contract}`), `GET /pillars`, `GET /openapi` (serve `../../openapi/ai.openapi.json` verbatim), then `createExpressEndpoints(aiContract, makeAiApiHandlers(deps), app)`.
- `pillars/ai/src/api/ai-manifest.ts` — `buildAiManifest(version)`:
  ```ts
  { pillar:'ai', version, contract:{ package:'@pops/ai', version, tag:`contract-ai@v${version}` },  // validator-REQUIRED @pops/ai
    routes:{ queries:['ai.usage.stats','ai.observability.stats', ...],
             mutations:['ai.ingest.record','ai.budgets.upsert', ...], subscriptions:[] },
    search:{ adapters:[] }, ai:{ tools:[] }, uri:{ types:[] },
    consumedSettings:{ keys:[] },
    settings:{ manifests:[aiConfigManifest] },
    nav:{...}, pages:[{ path:'/ai/usage', bundleSlot:'ai-usage' }],
    healthcheck:{ path:'/health' } }
  ```
  All `routes.*` strings satisfy `PROCEDURE_PATH = <pillar>.<router>.<procedure>` (3 segments) — `ai.ingest.record` ✓, `ai.budgets.upsert` ✓.
- `pillars/ai/src/api/server.ts` — `openAiDb()`, start observability + alerts schedulers (moved), `bootstrapPillar({ manifest: buildAiManifest(version), baseUrl: AI_SELF_BASE_URL, ... })` gated on `POPS_REGISTRY_ENABLED==='true'`, SIGTERM/SIGINT → stop schedulers + `pillarHandle.stop()`.

**Edits to core (REMOVE ai):**

- `pillars/core/src/db/schema.ts:10-17` — delete the 8 `ai*` re-exports.
- `pillars/core/src/contract/rest.ts:16-20,33-37` — delete imports + router slots.
- `pillars/core/src/api/rest/handlers.ts:13-17,33-37` — delete factories + slots.
- `pillars/core/src/api/server.ts:27-28,82-84,107-108` — delete scheduler imports + start/stop.
- Confirm no dangling imports via `pnpm --filter @pops/core typecheck`.
- `pillars/core/migrations/` — KEEP `0057/0059/0061-0064` historically; later PR `DROP TABLE`s post-cutover. Document in a comment.

**Pillar id + nginx registration:**

- `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:11-23` — add `'ai'` to `PILLARS` **AND rewrite the doc comment** (line 11 currently asserts "AI Ops is intentionally NOT a pillar — it lives inside core"; replace with "AI Ops is a first-class pillar as of PRD-055"; update "seven pillars" wording to eight).
- `apps/pops-shell/scripts/generate-nginx-conf.ts:67-90` — add `ai: { host:'ai-api', port:3008 }` to `PILLAR_UPSTREAMS` and `'ai'` to `PILLAR_RENDER_ORDER` (else `assertRenderOrderCoversAllPillars` fails typecheck).
- `packages/module-registry/scripts/known-modules.ts` — flip `ai` to `hasBackend:true, hasFrontend:true`, add its settings manifest ref; run `pnpm registry:build`.

**Frontend move:**

- `git mv pillars/core/app/src/pages/AiUsagePage.tsx` + `pages/ai-usage/**` → `pillars/ai/app/src/pages/`. Create `pillars/ai/app/` (`@pops/app-ai`), `openapi-ts.config.ts` (input `../openapi/ai.openapi.json`, output `src/ai-api/`). Move the AiUsage route/nav from `pillars/core/app/src/{routes.tsx,manifest.ts}` to the ai app. Regenerate core's SDK (`pnpm --filter @pops/app-core generate:api`) — `aiUsage*`/`aiObservability*` ops vanish from `core-api/sdk.gen.ts`.

**GATE-P0:** verificationGates[0].

---

### Phase 1 — Ingest route `POST /ai-usage/record` (US-02)

**New files:**

- `pillars/ai/src/contract/rest-ingest.ts`:
  ```ts
  import { InferenceRecordSchema } from '@pops/ai-telemetry/record-schema';
  export const aiIngestContract = c.router({
    record: {
      method: 'POST',
      path: '/ai-usage/record',
      body: InferenceRecordSchema,
      responses: { 200: z.object({ ok: z.literal(true) }) },
      summary: 'Record one AI inference (internal; cross-pillar telemetry sink)',
    },
  });
  ```
- `pillars/ai/src/api/rest/ingest-handler.ts`:
  ```ts
  export function makeIngestHandler(db: AiDb) {
    return {
      record: ({ body }: Req['record']) =>
        runHttp(() => {
          if (!KNOWN_MODULES.includes(body.domain)) {
            return { status: 400 as const, body: { error: 'unknown domain' } }; // loud typo; silent DB hiccup below
          }
          const merged = { ...body.metadata, prompt_version: body.promptVersion };
          const metaJson = capJson(JSON.stringify(merged), 4096); // PII/size guard
          try {
            createInferenceLog(db, {
              provider: body.provider,
              model: body.model,
              operation: body.operation,
              domain: body.domain,
              inputTokens: body.inputTokens,
              outputTokens: body.outputTokens,
              costUsd: body.costUsd,
              latencyMs: body.latencyMs,
              status: body.status,
              cached: body.cached ? 1 : 0,
              contextId: body.contextId ?? null,
              errorMessage: body.errorMessage ?? null,
              metadata: metaJson,
            });
            // NO recordInferenceDaily here — the daily rollup is a BATCH aggregator over aged rows,
            // owned by the observability scheduler (ai-usage-retention.ts). Per-record call would be a
            // type error (it takes InferenceDailyAggregate) and semantically wrong.
          } catch (err) {
            warn('[ai.record] insert failed', err);
          }
          return { status: 200 as const, body: { ok: true as const } };
        }),
    };
  }
  ```
  This gives `createInferenceLog` its FIRST production caller.
- `pillars/ai/src/contract/rest-pricing.ts` + `pillars/ai/src/api/rest/pricing-handler.ts` — `GET /ai-pricing/:provider/:model → {input,output}` via `createPricingCache(db).lookup()`.
- Add `aiIngest: makeIngestHandler(db)` and `aiPricing: makePricingHandler(db)` to handlers.

**Internal-gate (mirror food's `INTERNAL_PATHS`):** in `pillars/ai/src/api/app.ts`, add `const INTERNAL_PATHS = new Set(['/ai-usage/record'])` and a middleware that 403s when the path is internal and `x-pops-internal-token` ≠ `process.env.POPS_API_INTERNAL_TOKEN`. nginx does NOT proxy `/ai-usage/record` (Open Decision 5). `/ai-pricing/*` is NOT internal (callers fetch it cross-pillar).

**OpenAPI:** `record` appears in `pillars/ai/openapi/ai.openapi.json` with `operationId='aiIngest.record'` (pinned). Drift-checked.

**GATE-P1:** verificationGates[1].

---

### Phase 2 — Shared `@pops/ai-telemetry` TS package (US-03)

**New package `packages/ai-telemetry/`** (de-React-coupled generalization of food's wrapper; `string` operations, no `FoodOperation`/`'claude'` literals):

- `packages/ai-telemetry/src/record-schema.ts` — `InferenceRecordSchema` (§4.3). Single source of truth, imported by `pillars/ai/src/contract/rest-ingest.ts`.
- `packages/ai-telemetry/src/types.ts` — §4.4 interfaces (incl. streaming).
- `packages/ai-telemetry/src/report-sink.ts`:
  ```ts
  export const reportInference: ReportInferenceFn = async (record) => {
    const apiUrl = env('AI_API_URL') ?? env('POPS_API_URL'); // AI_API_URL FIRST so it never
    const token = env('POPS_API_INTERNAL_TOKEN'); // collides with self-pointing POPS_API_URL
    if (!apiUrl || !token || typeof globalThis.fetch !== 'function') return; // no-op: browser/dev/vitest
    const res = await fetch(`${apiUrl.replace(/\/+$/, '')}/ai-usage/record`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-pops-internal-token': token },
      body: JSON.stringify(record),
    });
    if (!res.ok) throw new Error(`ai.record HTTP ${res.status}`); // wrapper catches → warn
  };
  ```
- `packages/ai-telemetry/src/call-with-logging.ts`:
  ```ts
  export function computeCostUsd(input: number, output: number, p: PricingEntry | null) {
    if (!p) return { costUsd: 0, missing: true };
    return { costUsd: (input * p.input + output * p.output) / 1e6, missing: false };
  }
  export async function callWithLogging<T>(opts, deps): Promise<T> {
    const report = deps.report ?? reportInference;
    const warn = deps.warn ?? ((m, e) => console.warn(m, e));
    const start = Date.now();
    let result: CallResult<T>;
    try {
      result = await opts.call();
    } catch (err) {
      schedule(
        report({
          ...base(opts),
          status: 'error',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: Date.now() - start,
          cached: false,
          errorMessage: String(err).slice(0, 1000),
        }),
        warn
      );
      throw err; // error row fired, original error rethrown
    }
    const latencyMs = Date.now() - start;
    const p = await deps.lookupPricing(opts.provider, opts.model);
    const { costUsd, missing } = computeCostUsd(
      result.usage.inputTokens,
      result.usage.outputTokens,
      p
    );
    const over = opts.costCapUsd != null && costUsd > opts.costCapUsd;
    schedule(
      report({
        ...base(opts),
        status: 'success',
        cached: false,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd,
        latencyMs,
        metadata: {
          ...opts.metadata,
          ...(missing ? { pricing_missing: true } : {}),
          ...(over ? { over_cost_cap: true } : {}),
        },
      }),
      warn
    );
    return result.response;
  }
  // schedule = (p, warn) => void Promise.resolve().then(() => p).catch(warn);  // fire-and-forget
  ```
- `packages/ai-telemetry/src/call-with-logging-stream.ts` (resolves mustFix #2):
  ```ts
  export async function* callWithLoggingStream<E>(opts, deps): AsyncGenerator<E> {
    const report = deps.report ?? reportInference;
    const warn = deps.warn ?? ((m, e) => console.warn(m, e));
    const start = Date.now();
    let last: E | undefined;
    try {
      for await (const ev of opts.stream()) {
        last = ev;
        yield ev;
      } // re-yield verbatim, zero added latency
    } catch (err) {
      schedule(
        report({
          ...base(opts),
          status: 'error',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs: Date.now() - start,
          cached: false,
          errorMessage: String(err).slice(0, 1000),
        }),
        warn
      );
      throw err;
    }
    const latencyMs = Date.now() - start;
    const usage = opts.extractUsage(last);
    if (!usage) {
      // usage unavailable (early/partial) — still record success w/ 0
      schedule(
        report({
          ...base(opts),
          status: 'success',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          latencyMs,
          cached: false,
          metadata: { ...opts.metadata, usage_missing: true },
        }),
        warn
      );
      return;
    }
    const p = await deps.lookupPricing(opts.provider, opts.model);
    const { costUsd, missing } = computeCostUsd(usage.inputTokens, usage.outputTokens, p);
    const over = opts.costCapUsd != null && costUsd > opts.costCapUsd;
    schedule(
      report({
        ...base(opts),
        status: 'success',
        cached: false,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd,
        latencyMs,
        metadata: {
          ...opts.metadata,
          ...(missing ? { pricing_missing: true } : {}),
          ...(over ? { over_cost_cap: true } : {}),
        },
      }),
      warn
    );
  }
  ```
- `packages/ai-telemetry/src/pricing-http.ts` — `httpLookupPricing(baseUrl)`: GET `/ai-pricing/:p/:m` → `{input,output}`; fallback GET `/ai-providers` mapping `inputCostPerMtok→input, outputCostPerMtok→output`.
- `packages/ai-telemetry/src/index.ts` — re-export all.

**Invariants carried verbatim from food:** fire-and-forget logging (a slow/failing sink never delays or fails the call — proven by test); cost cap only FLAGS `metadata.over_cost_cap`, does NOT abort (v1); `promptVersion` merged into metadata server-side; `metadata` is caller-supplied and PII-free (the wrapper NEVER auto-captures prompt/response).

**Delete both food copies (DRY):** `pillars/food/app/src/ai/log-inference.ts`, `log-inference-sink.ts`, `log-inference-types.ts`, AND `pillars/food/src/worker/ai/log-inference.ts`. Food imports `callWithLogging`/`callWithLoggingStream`/`reportInference` from `@pops/ai-telemetry`.

**GATE-P2:** verificationGates[2].

---

### Phase 3 — Caller migration + food reconciliation (US-04, US-06)

**Migrate all 11 Anthropic sites.** Non-streaming sites wrap `client.messages.create(...)` in `callWithLogging`; the 2 streaming sites use `callWithLoggingStream`. `usage` comes from `response.usage.input_tokens/output_tokens` (already read in every caller); `lookupPricing` = `httpLookupPricing(AI_API_URL)` cached per-process. The wrapper sits INSIDE the default real implementation so existing test seams (`__setClaudeCompleterForTests`, `EgoLlm`/`IngestLlm` ports) still never hit the network; `reportInference` no-ops under vitest (no `AI_API_URL`).

| Site                   | file                                                                   | mode       | domain   | operation                        | error-placement                                                                                                |
| ---------------------- | ---------------------------------------------------------------------- | ---------- | -------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| finance corrections    | `corrections/ai-runtime.ts` (`defaultCompleter`)                       | req/resp   | finance  | `req.operation`                  | **wrap `create()` INSIDE the existing `try`; error row scheduled before the `catch { return null }` swallows** |
| finance categorizer    | `imports/ai-categorizer-api.ts` (`callApi`/`callApiOrThrow`)           | req/resp   | finance  | `imports.categorize`             | wrap the create; `callApiOrThrow` rethrows so error row fires + propagates                                     |
| cerebrum ingest        | `ingest/llm.ts`                                                        | req/resp   | cerebrum | from `IngestLlmRequest`          | wrap create inside try                                                                                         |
| cerebrum ego chat      | `ego/llm.ts` (`chat`)                                                  | req/resp   | cerebrum | `ego.chat`                       | wrap create inside try (chat has its own catch → schedule before it)                                           |
| cerebrum ego stream    | `ego/llm.ts:129` (`stream`)                                            | **stream** | cerebrum | `ego.stream`                     | `callWithLoggingStream`, `extractUsage` on `done` event (`tokensIn/tokensOut` at finalMessage)                 |
| cerebrum ego summarise | `ego/llm.ts:182` (`summarise`)                                         | req/resp   | cerebrum | `ego.summarise`                  | wrap create inside try                                                                                         |
| cerebrum query         | `query/llm.ts:142`                                                     | **stream** | cerebrum | `query.*`                        | `callWithLoggingStream`, extractUsage on terminal event                                                        |
| cerebrum emit          | `emit/llm.ts` (`generate`)                                             | req/resp   | cerebrum | `emit.generate`                  | wrap create inside try                                                                                         |
| cerebrum workers       | `workers/llm.ts`                                                       | req/resp   | cerebrum | `cerebrum.auditor.contradiction` | wrap create inside try                                                                                         |
| cerebrum nudges        | `nudges/contradiction-analyzer.ts`                                     | req/resp   | cerebrum | `nudges.*`                       | wrap create inside try                                                                                         |
| food worker ×3         | `food/src/worker/ai/{anthropic,web-llm-anthropic,anthropic-client}.ts` | req/resp   | food     | `FoodOperation` strings          | replace bespoke wrapper with `@pops/ai-telemetry`                                                              |

**Error-placement rule (resolves the corrections ambiguity):** in every caller, `callWithLogging`/`callWithLoggingStream` wraps the `client.messages.create`/`.stream` call. The wrapper's OWN try/catch schedules the error row (fire-and-forget) and rethrows. The caller's pre-existing outer `try { ... } catch { return null/fallback }` then swallows for control-flow — but the error telemetry has ALREADY been scheduled inside the wrapper, so error-status rows are never lost. A per-caller test asserts a throwing `create` produces an error report even when the caller returns null.

**Food reconciliation (US-06):**

1. **Repoint food's sink** → `@pops/ai-telemetry` `reportInference` POSTing to `{AI_API_URL}/ai-usage/record`. Replace food's wrapper with `callWithLogging`. Food supplies `domain:'food'`, `provider:'claude'`, its operation strings, `promptVersion` from `pillars/food/app/src/ai/prompt-registry.ts`.
2. **Delete food's local table + route:** `pillars/food/src/api/rest/ai-handlers.ts` (`logInference`), `pillars/food/src/contract/rest-ai.ts` (`foodAiContract`), local `ai_inference_log` schema, food OpenAPI `ai.logInference` op. Update `pillars/food/src/api/__tests__/openapi.test.ts:55` assertion. (Dual-serve window — §7.2 — keeps the route alive until both food images roll.)
3. **Backfill** historical food rows (Open Decision 7) — one-shot idempotent job: read food's `ai_inference_log`, POST each through `/ai-usage/record` tagging `metadata.backfilled_from='food'` to prevent double-count on re-run.

**PII enforcement at every report site** (repo rule + grounding §7):

- finance categorizer already strips PII before the model call (`ai-categorizer-api.ts:5-6`, `sanitizeEntityName`, `stripTrailingStoreCodes`). The migration MUST set `contextId='import_batch:<id>'` — NOT the description/sanitizedDescription — and keep raw rows out of `metadata`.
- cerebrum `contextId` = engram/source id, never engram body. `errorMessage` capped 1000 chars (provider transport errors, not echoed prompts).
- The wrapper NEVER auto-captures prompt/response; `metadata` is caller-owned; the server caps its JSON length.

**GATE-P4:** verificationGates[3].

---

### Phase 4 — Rust crate `crates/pops-ai` (US-05)

**Cargo workspace** (ROOT owned by contacts — §10; ai-ops adds its member, does NOT create the root):

- `crates/Cargo.toml` (authored by contacts/plan 01): ai-ops ADDS `"pops-ai"` to `[workspace].members` (root stays `resolver = "2"`).
- `crates/pops-ai/Cargo.toml`: deps `serde = { features=["derive"] }`, `serde_json`, `reqwest = { features=["json"] }`, `tokio = { features=["rt","macros"] }`, `async-trait`, `thiserror`, `anyhow`.

**`crates/pops-ai/src/lib.rs`** (serde camelCase to match the zod body byte-for-byte; enum kebab-case to match `z.enum`):

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InferenceRecord {
    pub provider: String, pub model: String, pub operation: String, pub domain: String,
    pub input_tokens: u32, pub output_tokens: u32, pub cost_usd: f64, pub latency_ms: u32,
    pub status: InferenceStatus, pub cached: bool,
    #[serde(skip_serializing_if = "Option::is_none")] pub context_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub prompt_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub metadata: Option<serde_json::Value>,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "kebab-case")]
pub enum InferenceStatus { Success, Error, Timeout, BudgetBlocked }   // budget-blocked

#[async_trait::async_trait]
pub trait ReportSink: Send + Sync { async fn report(&self, r: InferenceRecord); }

pub struct EnvHttpSink { url: Option<String>, token: Option<String>, client: reqwest::Client }
impl EnvHttpSink { pub fn from_env() -> Self { /* AI_API_URL first, then POPS_API_URL; + POPS_API_INTERNAL_TOKEN */ } }
#[async_trait::async_trait]
impl ReportSink for EnvHttpSink {
    async fn report(&self, r: InferenceRecord) {
        let (Some(url), Some(token)) = (&self.url, &self.token) else { return };   // no-op
        let _ = self.client.post(format!("{}/ai-usage/record", url.trim_end_matches('/')))
            .header("x-pops-internal-token", token).json(&r).send().await;        // swallow errors
    }
}

pub async fn call_with_logging<T, F, Fut>(opts: CallOpts, pricing: PricingEntry, sink: Arc<dyn ReportSink>, call: F)
    -> anyhow::Result<T>
where F: FnOnce() -> Fut, Fut: Future<Output = anyhow::Result<CallResult<T>>> { /* fire-and-forget via tokio::spawn */ }

// Streaming parity with callWithLoggingStream: drive a Stream<Item=E>, extract usage from the terminal item.
pub fn call_with_logging_stream<E, S>(opts: CallOpts, pricing: PricingEntry, sink: Arc<dyn ReportSink>,
    stream: S, extract_usage: impl Fn(&E) -> Option<Usage>) -> impl Stream<Item = E>
where S: Stream<Item = E>;

pub fn compute_cost_usd(input: u32, output: u32, p: &PricingEntry) -> f64 {
    (input as f64 * p.input + output as f64 * p.output) / 1e6
}
```

**`crates/pops-ai/tests/contract.rs`** — golden-JSON parity: serialize a fixed `InferenceRecord`, assert equals `crates/pops-ai/tests/fixtures/record.json`; the SAME fixture is asserted `InferenceRecordSchema.parse()`-clean in `packages/ai-telemetry/src/__tests__/record-schema.test.ts`. Catches camelCase/enum drift across languages.

> NOTE: `crates/pops-ai` has NO in-tree consumer (no Rust pillar yet). Ships tested-but-unused; the contacts Rust pillar consumes it. Gap issue filed. The contacts plan MUST actually call `pops-ai` from its Claude path (locked decision 1) so the crate isn't permanently dead — see §10.

**GATE-P5:** verificationGates[4].

---

### Phase 5 — Infra, CI, e2e (part of US-01/US-02)

- **`infra/docker-compose.yml` + `docker-compose.dev.yml` — ai-api service:** image `ghcr.io/knoxio/pops-ai:${POPS_IMAGE_TAG:-main}`, `PORT:'3008'`, `AI_SQLITE_PATH:/data/sqlite/ai.db`, `AI_SELF_BASE_URL:http://ai-api:3008`, `POPS_API_INTERNAL_TOKEN`, `depends_on: core-api healthy`, healthcheck hitting `/health`, Watchtower label, `volumes:[sqlite-data:/data/sqlite]`. Add `ai:http://ai-api:3008` to `POPS_PILLARS`. Auto-enrolls `ai` in publish-images `discover` (greps compose for `image: ghcr.io/knoxio/pops-ai:` + requires `pillars/ai/Dockerfile`).
- **Per-consumer `AI_API_URL` wiring (resolves mustFix #3) — add to BOTH compose files:**
  - `finance-api`: add `AI_API_URL: http://ai-api:3008` and `POPS_API_INTERNAL_TOKEN` (finance had neither).
  - `food-api`: add `AI_API_URL: http://ai-api:3008` (keep `POPS_API_URL: http://food-api:3005` if other food code needs it; the sink reads `AI_API_URL` first). Ensure `POPS_API_INTERNAL_TOKEN` present.
  - `food-worker`: add `AI_API_URL: http://ai-api:3008`; ensure `POPS_API_INTERNAL_TOKEN` present (the worker's `onLog` now POSTs to ai).
  - `cerebrum`: add `AI_API_URL: http://ai-api:3008` (keep `POPS_API_URL: http://cerebrum-api:3007`); ensure `POPS_API_INTERNAL_TOKEN` present.
    Without this wiring telemetry no-ops in prod → zero rows → the headline goal fails. The e2e gate (GATE-P6) asserts a real cross-service POST lands a row.
- **`pillars/ai/Dockerfile`** — hand-written, clone finance's node:22-slim 2-stage (`pnpm install --frozen-lockfile --filter @pops/ai-pillar...`, copy transitive `@pops/*` incl. `@pops/ai-telemetry`, build, `pnpm deploy --prod`, `EXPOSE 3008`, `CMD ["node","dist/api/server.js"]`).
- **`infra/litestream/ai.yml`** — per-pillar shape (`/data/sqlite/ai.db`, `${AI_LITESTREAM_REPLICA_URL}`, 1s sync, 24h retention, 1h snapshot, 12h validation).
- **mise/turbo** — the ai pillar is a normal pnpm package → auto-discovered by `turbo run --filter='./pillars/*'`. `packages/ai-telemetry` joins the turbo graph normally. `crates/pops-ai` is invisible to turbo's pillar glob; a dedicated `mise` task `ai:rust` runs `cargo test -p pops-ai` + `cargo clippy -p pops-ai -- -D warnings` + `cargo fmt -p pops-ai --check`, plus a CI lane — shared with contacts plan (§10).
- **e2e** — `apps/pops-shell/e2e/ai-ops-dashboard.spec.ts`: boot the stack, POST a record via `/ai-usage/record` (internal token, through the ai-api service URL), open the AI Usage page (served from the ai pillar), assert the row surfaces. No long timeouts — await the network response / `toBeVisible` (repo rule 11).

**GATE-P6:** verificationGates[5].

---

## 6. Data migration & rollback

### 6.1 Source rows

- **ai pillar's `ai.db` is FRESH.** Produce `pillars/ai/migrations/0000_ai_baseline.sql` = union of the CREATE TABLE/INDEX/UNIQUE statements for the 7 moved tables (`ai_inference_log`, `ai_inference_daily`, `ai_providers`, `ai_model_pricing`, `ai_budgets`, `ai_alert_rules`, `ai_alerts` — NOT `ai_usage`) + `meta/_journal.json` (mirror `open-core-db.ts` journal resolution). Drizzle-kit regenerates from the moved schema; the committed SQL is the migration of record.
- **Historical telemetry** lives in (a) core.db (`ai_inference_log`/`ai_inference_daily`/budgets/alerts/providers/pricing); (b) food.db (`ai_inference_log`).

### 6.2 Migration mechanism

1. **core → ai copy** (one-shot, boot-time, mirrors the documented `pops.db → core.db` pattern at `ai-usage.ts:28-31`): `pillars/ai/scripts/backfill-from-core.ts` reads core.db's 7 ai tables and bulk-inserts into ai.db. Run ONCE at cutover (env-gated `AI_BACKFILL_FROM_CORE_DB=/data/sqlite/core.db`). Idempotency: run only when ai.db's `ai_inference_log` is empty (or stamp a sentinel).
2. **food → ai backfill** (Open Decision 7): read food.db's `ai_inference_log`, POST each through `/ai-usage/record` with `metadata.backfilled_from='food'`. Idempotent via that marker.
3. **Config tables** (`ai_providers`, `ai_model_pricing`, `ai_budgets`, `ai_alert_rules`) have natural unique keys → UPSERT-safe.

### 6.3 Rollback

- The ai pillar runs ALONGSIDE core's still-present (read-only) ai tables until cutover is proven. **Core's ai tables are NOT dropped in this plan.** Rollback = revert the caller-migration + sink-repoint PRs (callers fall back to no-telemetry, exactly today's behavior) and re-mount core's ai routes (still in git history). No data lost — core.db retains its tables, food.db retains its table until the explicit drop PR.
- The drop PR (`DROP TABLE ai_*` from core, `DROP TABLE ai_inference_log` from food) is the point of no return — gate behind "30 days of clean ai-pillar ingest", never bundled with the extraction.

---

## 7. Rolling-deploy compatibility (Watchtower, no lockstep)

Every pillar deploys independently; NO atomic flip.

1. **The ingest route is NEW (additive)** — no old caller depends on it. A pillar shipping the `@pops/ai-telemetry` wrapper before the ai pillar exists has `reportInference` no-op (404/connection-refuse → wrapper catches → warn; the Claude call still succeeds). Caller-migration PRs are SAFE to land before the ai pillar is deployed. **Ordering: deploy the ai pillar FIRST, then migrate callers**; reversed it degrades gracefully (telemetry silently dropped, never a broken call). Fire-and-forget doing its job.

2. **Food's sink repoint** — the one cutover with a window. During rollout: (old food image → POSTs food's `/ai/log-inference`) and (new food image → POSTs ai's `/ai-usage/record`). **Strategy: dual-serve on food.** Keep food's `/ai/log-inference` route ALIVE (delete only in a later PR) so an old food worker still has a sink while the app image rolls. At worst a brief double-count, reconciled by the backfill marker. Remove food's route only after both food images (app + worker) are on the new wrapper.

3. **Core de-AI** — removing the `/ai-*` routes breaks any consumer still calling core's `core.aiUsage.*`/`core.aiObservability.*`. The only consumers are the shell's `AiUsagePage` (moving to the ai app) and the generated `core-api` SDK. **Strategy: deploy the ai pillar (serving the same READ routes) BEFORE removing them from core; ship the shell pointing at the ai app's client in the same release train.** Keep core's READ routes one release after the ai pillar is live (dual-serve the reads), then remove.

4. **`AI_API_URL` env rollout** — the env keys (§5) land in compose BEFORE the sink repoint deploys, so a new image always finds the ai-api URL. If a new image rolls before the compose env is applied, the sink no-ops (graceful) — never a broken Claude call. Apply the compose env change first, then let images roll.

5. **Registry handshake** — the ai pillar registers via the existing `/core.registry.register` envelope, identical to every pillar. It must ship the SAME `@pops/pillar-sdk` version (with the 404-fallback shim, once the rename plan lands) as every other pillar, so it is covered transparently. Sequence: extract the ai pillar on the CURRENT handshake FIRST.

6. **Compat-shim removal timeline:** (a) food's `/ai/log-inference` route + local table: remove after both food images on new wrapper (~1 Watchtower cycle + observation). (b) core's `/ai-*` READ routes: remove one release after the ai pillar is live + shell points at the ai client. (c) core's ai\_\* tables (`DROP TABLE`): final PR, gated on 30 days clean ingest.

---

## 8. Test & verification plan

### 8.1 Commands

- AI pillar: `pnpm --filter @pops/ai-pillar build` (tsc + generate-openapi + generate-api-types), `pnpm --filter @pops/ai-pillar test` (Vitest, REAL temp SQLite via `open-ai-db`), `pnpm --filter @pops/ai-pillar typecheck`.
- Shared package: `pnpm --filter @pops/ai-telemetry test`, `pnpm --filter @pops/ai-telemetry build`.
- Core regen: `pnpm --filter @pops/core build && git diff --exit-code pillars/core/openapi/core.openapi.json`; `pnpm --filter @pops/app-core generate:api && git diff --exit-code`.
- Registry: `pnpm registry:build && git diff --exit-code packages/module-registry/src/generated.ts`.
- Rust: `mise run ai:rust` (= `cargo test -p pops-ai` + `cargo clippy -p pops-ai -- -D warnings` + `cargo fmt -p pops-ai --check`).
- Repo-wide: `mise run typecheck`, `mise run test`, `mise run openapi:generate && git diff --exit-code`.
- e2e: `pnpm --filter @pops/pops-shell e2e -- ai-ops-dashboard.spec.ts`.

### 8.2 Tests to ADD

- **Vitest (ai pillar, temp SQLite):** `pillars/ai/src/api/__tests__/ingest-record.test.ts` — auth gate; field mapping incl. cached 0/1 + prompt_version merge; **assert the handler does NOT touch `ai_inference_daily` (only `ai_inference_log` grows)**; best-effort on insert-throw; oversized-metadata cap; unknown-domain 400. Migrate core's existing `ai-usage`/`ai-budgets`/`ai-observability`/`ai-alerts` suites into the ai pillar unchanged.
- **Vitest (`@pops/ai-telemetry`):**
  - `call-with-logging.test.ts` — fire-and-forget never blocks/fails when sink throws; error path tokens 0 + rethrow; computeCostUsd formula; cost-cap flag.
  - `call-with-logging-stream.test.ts` — re-yields every event in order with no added latency; extractUsage on terminal event → success report; generator throw → error report fired before rethrow; usage-missing path records `usage_missing`. (Directly exercises the streaming path the review flagged.)
  - `report-sink.test.ts` — no-op when env unset; `AI_API_URL` preferred over `POPS_API_URL`; exact body + `x-pops-internal-token` header against a fetch mock.
  - `pricing-http.test.ts` — maps `inputCostPerMtok→input, outputCostPerMtok→output`; prefers `/ai-pricing` over `/ai-providers`.
  - `record-schema.test.ts` — parses the shared golden fixture; rejects whitespace `contextId`.
- **Vitest (callers):** per-pillar, assert the wrapper is invoked and `reportInference` no-ops under vitest; **PII test** — finance categorizer report's `contextId`/`metadata` contains no raw description (only `import_batch:<id>`); **error-placement test** — a throwing `create` in corrections produces an error report even though `defaultCompleter` returns null.
- **cargo test:** `crates/pops-ai/tests/contract.rs` — golden-fixture serialize parity (camelCase keys, kebab-case enum), EnvHttpSink no-op, streaming usage extraction.
- **Playwright:** `apps/pops-shell/e2e/ai-ops-dashboard.spec.ts` — end-to-end cross-service ingest → dashboard row. No explicit timeouts.
- **OpenAPI snapshot:** `generate-openapi && git diff --exit-code` is the drift gate for core (ai routes gone) and ai (record + pricing present).

### 8.3 Acceptance criteria

Per phase = the verificationGates entries (P0–P6). Each gate MUST be green before the next phase (see §9).

---

## 9. Agentic execution graph

```
N0  scaffold ai pillar (Phase 0 scaffold+move)           deps: —            GATE-P0
N1  pillar-id(+doc) + nginx + module-registry             deps: N0           (part of GATE-P0)
N2  core de-AI (remove wiring, regen SDK/openapi)         deps: N0           GATE-P3
N3  ingest route POST /ai-usage/record + /ai-pricing      deps: N0           GATE-P1
N4  @pops/ai-telemetry package (req + stream + pricing)   deps: —  (parallel) GATE-P2
N5  caller migration: finance ×2                          deps: N3,N4        part of GATE-P4
N6  caller migration: cerebrum ×6 (incl. 2 streaming)     deps: N3,N4        part of GATE-P4
N7  food reconciliation (sink+delete+backfill)            deps: N3,N4        part of GATE-P4
N8  crates/pops-ai Rust crate (req + stream)              deps: N4 (fixture) GATE-P5
N9  infra/CI/litestream/Dockerfile + per-consumer env     deps: N0,N3        (part of GATE-P6)
N10 frontend move (AiUsagePage → ai app)                  deps: N0,N2        (part of GATE-P0/P3)
N11 e2e dashboard spec (cross-service ingest)             deps: N9,N10,N3    GATE-P6
```

**Parallelizable:** `{N4}` from day 0. After N0: `{N2, N3, N10}`. After N3+N4: `{N5, N6, N7}`. N8 needs only N4's fixture. N9 needs N0+N3 (and the env wiring is in N9). N11 is the final join — and it is the gate that proves the §7/mustFix-#3 env wiring actually lands a row.

**Gates (blocking):** GATE-P0 before N2/N3/N10. GATE-P1 before N5/N6/N7. GATE-P2 before N5/N6/N7/N8. GATE-P3 before N10 finalize + N11. GATE-P4 before N11. GATE-P5 standalone. GATE-P6 terminal.

---

## 10. Cross-plan dependencies & sequencing (conflicts resolved)

**Port allocation (CONFLICT RESOLVED):** `ai` claims **3008** (verified free — cerebrum=3007 highest pillar, orchestrator=3009 already taken per `docker-compose.yml:459-463`). **`contacts` must claim 3010+**, NOT 3009. Both plans coordinate via `PILLAR_UPSTREAMS`/`PILLAR_RENDER_ORDER` in `generate-nginx-conf.ts`; whichever lands second reads the first's entry and takes the next free port.

**Settings plan (soft dep, RESOLVED):** the ai pillar OWNS `ai.model, ai.monthlyTokenBudget, ai.budgetExceededFallback, ai.modelOverrides.*` (7), `ai.logRetentionDays` and implements the per-pillar `/settings/:key` surface, moving `aiConfigManifest` out of core. **NOT blocked:** until the settings plan lands, the ai pillar carries a local `settings`/`user_settings` table (mirror of core's) so its keys resolve. **Both plans ratify this interim local table as acceptable transitional state**, and the settings plan OWNS deleting the 11 `ai.*` keys from `packages/types/src/settings-keys.ts` (the central enum dismantling) when it lands.

**Crates workspace (CONFLICT RESOLVED — contacts owns the root):** this plan SHIPS `crates/pops-ai` and the contacts/Rust plan needs the same `crates/Cargo.toml` + Rust CI lane. **LOCKED owner: contacts (plan 01, Stage 1d / Phase 0) authors `crates/Cargo.toml` + the Rust CI lane; ai-ops ONLY adds `pops-ai` to `[workspace].members` and reuses the lane.** ai-ops MUST NOT author `crates/Cargo.toml` — it depends on contacts' Phase 0 landing the root first. The contacts plan's Rust Claude path MUST call `pops-ai` (locked decision 1) so the crate has a real consumer and is not permanently dead — the golden-fixture parity test is the cross-language guard.

**Registry-rename plan (orthogonal):** the ai pillar registers via the current `/core.registry.*` handshake; when the rename's SDK 404-fallback lands, the ai pillar (shipping the same SDK) is covered transparently. Sequence: ai extraction on current handshake FIRST.

**This plan EXPOSES (consumed by others):** the canonical `POST /ai-usage/record` wire contract + `@pops/ai-telemetry` TS wrapper (req + stream) + `crates/pops-ai`. EVERY pillar that calls Claude — including the new Rust contacts pillar — routes through it. Plus `KNOWN_MODULES` membership for `ai` (orchestrator/shell pick it up generically) and the `GET /ai-pricing/:p/:m` read.

---

## 11. Risks & mitigations

| Risk                                                                                       | Mitigation                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Telemetry no-ops in prod (env wiring missed)** — the original failure the review caught. | §5/§7 enumerate `AI_API_URL` on finance-api/food-api/food-worker/cerebrum in both compose files; GATE-P6 e2e asserts a real cross-service POST lands a row (not just an in-process call).                      |
| **Ingest type/semantic error on `recordInferenceDaily`**                                   | Removed entirely from the ingest path; ingest does ONLY `createInferenceLog`; a test asserts `ai_inference_daily` is untouched at ingest. Daily rollup stays owned by the observability scheduler.             |
| **Streaming callers hand-roll report logic (DRY break)**                                   | `callWithLoggingStream` (TS) + `call_with_logging_stream` (Rust) are first-class entrypoints; ego.stream + cerebrum query consume them; a stream test proves re-yield order + terminal-event usage extraction. |
| **Empty dashboards post-extraction**                                                       | Land ingest (N3) + finance/cerebrum/food callers (N5/N6/N7) in the SAME release train as the dashboard move; backfill core's historical rows (§6.2).                                                           |
| **Double-count during food sink window**                                                   | Backfill marker `metadata.backfilled_from='food'`; dual-serve food's old route briefly; reconcile by marker.                                                                                                   |
| **`reportInference` blocking a Claude call**                                               | Fire-and-forget invariant — `schedule()`/`tokio::spawn`; dedicated tests assert a throwing sink never rejects/delays `callWithLogging` or `callWithLoggingStream`.                                             |
| **PII leaking into `metadata`/`contextId`**                                                | Wrapper never auto-captures prompt/response; `contextId` zod-constrained no-whitespace ≤128; server caps `metadata` JSON ≤4 KB; per-caller PII tests.                                                          |
| **Error-status rows lost where caller swallows**                                           | Per-caller rule: wrapper wraps `create()` INSIDE the existing try so the error row is scheduled before the swallow; corrections test asserts it.                                                               |
| **Pricing mismatch over HTTP**                                                             | `httpLookupPricing` maps `inputCostPerMtok→input`; dedicated `/ai-pricing/:p/:m` returns `{input,output}` directly; a `pricing-http.test.ts` pins the mapping.                                                 |
| **Rust crate rots (no consumer)**                                                          | Golden-fixture cross-language contract test; gap issue; clippy `-D warnings`; contacts plan obligated to consume it (§10).                                                                                     |
| **`assertRenderOrderCoversAllPillars` typecheck failure**                                  | Add `ai` to `PILLARS` + `PILLAR_UPSTREAMS` + `PILLAR_RENDER_ORDER` (and fix the contradicting doc comment) in the SAME PR (N1).                                                                                |
| **OpenAPI drift**                                                                          | `generate-openapi && git diff --exit-code` for both core (ai removed) and ai (record + pricing present); deterministic sort; `aiIngest.record` operationId pinned.                                             |
| **`ai_usage`/cache mis-routed to ai pillar**                                               | Open Decision 1 — finance; this plan deletes from core; flags a gap if finance declines.                                                                                                                       |
| **Port collision with contacts**                                                           | RESOLVED — ai=3008, contacts=3010+ (3009 is orchestrator); coordinate in PILLAR_UPSTREAMS (§10).                                                                                                               |

---

## 12. Open decisions needing ratification

1. **`ai_usage` table + `ai-usage/cache.ts` destination** → RECOMMEND move to FINANCE (PII-bearing finance-categorizer state, not AI-ops telemetry). This plan deletes from core; finance plan re-homes.
2. **Pre-call budget enforcement in the wrapper** → RECOMMEND (b) telemetry-only for v1 (matches current zero-enforcement); option (a) `GET /ai-budgets/check` is a tracked follow-up.
3. **`status` enum width** → RECOMMEND widen to `['success','error','timeout','budget-blocked']`.
4. **Ingest auth** → RECOMMEND `x-pops-internal-token` for v1 (food's pattern); service-account JWT is a hardening follow-up.
5. **Ingest public vs internal** → RECOMMEND strictly internal (docker-network only; nginx does NOT proxy `/ai-usage/record`). `/ai-pricing/*` is cross-pillar-readable (not internal).
6. **AI pillar port** → RATIFIED 3008 (next free; 3009 is orchestrator, contacts takes 3010+).
7. **Food historical backfill** → RECOMMEND one-shot idempotent backfill with `metadata.backfilled_from='food'`; alternative is discard (food's table is young per PRD-133).
8. **Cross-pillar pricing read shape** → RECOMMEND ship `GET /ai-pricing/:provider/:model → {input,output}` so callers don't map `inputCostPerMtok`/`outputCostPerMtok`; the `httpLookupPricing` adapter falls back to `/ai-providers` mapping if the dedicated route is absent.

---

## Appendix — exact net file-touch list

**CREATE:** `packages/ai-telemetry/**` (wrapper: req + stream + pricing-http + record-schema); `crates/Cargo.toml` + `crates/pops-ai/**`; `pillars/ai/**` (scaffold + moved files + `rest-ingest.ts` + `ingest-handler.ts` + `rest-pricing.ts` + `pricing-handler.ts` + `0000_ai_baseline.sql` + `open-ai-db.ts` + `Dockerfile`); `pillars/ai/app/**`; `infra/litestream/ai.yml`; `apps/pops-shell/e2e/ai-ops-dashboard.spec.ts`.
**MOVE (core→ai):** `pillars/core/src/db/schema/ai-{alert-rules,alerts,budgets,inference-daily,inference-log,model-pricing,providers}.ts` (+`*-row-schemas.ts`); `pillars/core/src/db/services/{ai-usage,ai-usage-budgets,ai-usage-dashboard,ai-usage-filters,ai-usage-retention,ai-model-pricing}.ts`; `pillars/core/src/api/modules/{ai-usage,ai-providers,ai-budgets,ai-alerts,ai-observability}/**` (EXCEPT `ai-usage/cache.ts` → finance); `pillars/core/src/api/rest/ai-*-handlers.ts`; `pillars/core/src/contract/rest-ai-*.ts`; `pillars/core/app/src/pages/{AiUsagePage.tsx,ai-usage/**}`.
**EDIT (core, remove ai):** `pillars/core/src/db/schema.ts:10-17`; `pillars/core/src/contract/rest.ts:16-20,33-37`; `pillars/core/src/api/rest/handlers.ts:13-17,33-37`; `pillars/core/src/api/server.ts:27-28,82-84,107-108`; `pillars/core/app/src/{routes.tsx,manifest.ts}`; regen core OpenAPI + SDK.
**EDIT (registration):** `packages/pillar-sdk/src/capabilities/known-pillar-id.ts:11-23` (add `'ai'` + fix doc comment); `apps/pops-shell/scripts/generate-nginx-conf.ts:67-90`; `packages/module-registry/scripts/known-modules.ts` (+ `pnpm registry:build`).
**EDIT (callers):** the 11 Anthropic sites (§5 table, incl. 2 streaming via `callWithLoggingStream`); `pillars/food/app/src/ai/*` (replace w/ `@pops/ai-telemetry`); `pillars/food/src/worker/ai/log-inference.ts` (delete) + worker `anthropic*.ts` (rewire); `pillars/food/src/api/rest/ai-handlers.ts` + `pillars/food/src/contract/rest-ai.ts` (delete in dual-serve-end PR); `pillars/food/src/api/__tests__/openapi.test.ts:55`.
**EDIT (infra/CI):** `infra/docker-compose.yml`, `infra/docker-compose.dev.yml` — ai-api service + `AI_API_URL`/`POPS_API_INTERNAL_TOKEN` on finance-api, food-api, food-worker, cerebrum.
**DELETE (later drop PR, NOT this plan):** core `ai_*` tables; food `ai_inference_log` table.
