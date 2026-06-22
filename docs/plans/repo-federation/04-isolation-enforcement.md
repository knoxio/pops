# 04 — Isolation Enforcement + Extract-Readiness

> Makes the **isolation rule** and the **extract-to-own-repo litmus test** _enforced in CI_, not aspirational.
> Target layout: `pillars/` + `libs/`. Task IDs here use the analysis-family aliases (**`ISO-*`**, `EX-*`, `RUST-*`). **These are aliases for the canonical `P6-T*` tasks defined in `03-execution-phases.md`** — resolve via the crosswalk in `00-architecture.md` §7.1: `ISO-R1..R4`=`P6-T01`, `ISO-EXPORTS`/`ISO-SCOPE`=`P6-T02`, `EX-1..3`/`ISO-CMD`=`P6-T03`, `RUST-1..3`=`P6-T04`. Cross-referenced from `00-architecture.md`, `03-execution-phases.md` (relocation), `02-build-system.md`, `05-cicd-deployment.md`, `06-registry-decoupling.md`, `07-risks.md`.

## 0. The rule, reduced to one mechanical statement

> A unit may import another unit **only** via a path that resolves through that unit's `package.json#exports` map (TS) or its crate root `pub` surface (Rust). Any import that resolves to a file **not reachable from the contract surface** is a _behind-the-contract reach_ and is forbidden.

Two corollaries the whole chapter enforces:

| Corollary                                                          | Direction                                 | Enforced by                          |
| ------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------ |
| **lib never imports a pillar**                                     | `libs/* → pillars/*` forbidden            | dep-cruiser `ISO-R1` + Rust `RUST-2` |
| **pillar consumes another pillar only via its published contract** | `pillars/x → pillars/y` only as `@pops/y` | dep-cruiser `ISO-R2` + `ISO-R3`      |

The contract surface already exists in code and is the model to enforce everywhere:

| Unit kind                        | Ships          | exemplar                                                                                                                                     |
| -------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| compiled lib / pillar contract   | `dist/**` only | `@pops/finance` → `"files": ["dist/contract/**", "openapi/finance.openapi.json"]` (`src/api`, `src/db`, `migrations/` physically unpackaged) |
| source lib (bundled by consumer) | `src/**`       | `@pops/ui` (`./primitives/*` wildcard = the one audited intentional wide surface)                                                            |

---

## 1. Task index

| ID          | Title                                                                                               | Scope                                                                                     | depends-on                                                   | parallel-group       |
| ----------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------- |
| ISO-R1      | dep-cruiser: lib-no-pillar-import                                                                   | `.dependency-cruiser.cjs`                                                                 | reshuffle done (`libs/` exists)                              | PG-ISO-rules         |
| ISO-R2      | dep-cruiser: pillar-no-cross-internal                                                               | `.dependency-cruiser.cjs`                                                                 | reshuffle done                                               | PG-ISO-rules         |
| ISO-R3      | dep-cruiser: no-deep-internal-import                                                                | `.dependency-cruiser.cjs`                                                                 | reshuffle done                                               | PG-ISO-rules         |
| ISO-R4      | dep-cruiser: no-circular + lib-layering                                                             | `.dependency-cruiser.cjs`                                                                 | reshuffle done                                               | PG-ISO-rules         |
| ISO-SCOPE   | retarget `lint:boundaries` to `pillars libs scripts` **+ first-light reconnaissance & triage** (§5) | `package.json`, `.dependency-cruiser-known-violations.json`, any code fixed during triage | ISO-R1..R4                                                   | (serial after rules) |
| ISO-EXPORTS | per-unit `exports`+`files` normalization + `check-exports.mjs`                                      | every `package.json`, `scripts/check-exports.mjs`                                         | reshuffle done                                               | PG-ISO-exports       |
| EX-1        | declared-deps completeness (depcheck per changed unit)                                              | `scripts/extractability/check-unit.sh`, `depcheck.mjs`                                    | ISO-EXPORTS                                                  | PG-ISO-ex            |
| EX-2        | true sandbox extraction (pack + isolated build)                                                     | `scripts/extractability/sandbox.sh` + helpers                                             | ISO-EXPORTS, build-system (`tsc -b`)                         | PG-ISO-ex            |
| EX-3        | baseline monotonicity guard                                                                         | `scripts/extractability/baseline-guard.sh`                                                | ISO-SCOPE                                                    | PG-ISO-ex            |
| ISO-CMD     | `isolation:check` aggregate script                                                                  | `package.json`, wire into `quality.yml`                                                   | EX-1, EX-3, ISO-EXPORTS                                      | (serial)             |
| ISO-REG     | module-registry de-pillaring (delete `registry:build`/`generated.ts` pillar deps)                   | `libs/module-registry/*`                                                                  | ISO-R1 (as baseline), RD-3 (see `06-registry-decoupling.md`) | (serial, late)       |
| RUST-1      | `deny.toml` + `cargo deny` step                                                                     | `Cargo.toml`-root `deny.toml`, `rust-quality.yml`                                         | reshuffle done                                               | PG-ISO-rust          |
| RUST-2      | `check-cargo-deps.mjs` (lib≠>pillar, pillar≠>pillar)                                                | `scripts/extractability/check-cargo-deps.mjs`, `rust-quality.yml`                         | reshuffle done                                               | PG-ISO-rust          |
| RUST-3      | `cargo-sandbox.sh` + `cargo-extract.mjs` (nightly)                                                  | `scripts/extractability/*`                                                                | RUST-1                                                       | PG-ISO-rust          |

**Parallel groups:** `PG-ISO-rules` (R1–R4 all edit one file → land as **one PR**, not concurrent), `PG-ISO-exports` (per-unit, file-disjoint → wide), `PG-ISO-ex` (new script files, disjoint → wide), `PG-ISO-rust` (rust lane, independent of TS lanes).

**Hard ordering note:** every `ISO-*` task **depends on the directory reshuffle barrier** (`03-execution-phases.md` Phase 2 relocation). The rules key on `^libs/` / `^pillars/` path prefixes; running them before the move would match nothing. Do not start `PG-ISO-rules` until `libs/` and the app→pillar moves have landed on `main`.

---

## 2. ISO-R1..R4 — dep-cruiser rules retargeted to `pillars/ + libs/`

The current `.dependency-cruiser.cjs` (verified) has **one structural rule** (`no-cross-app-import`, scoped to `pillars/<x>/app/src`) plus 9 tombstone rules (dead-package guards keyed on `@pops/*` names). The tombstones are **orthogonal — keep verbatim**. The four rules below are _added_; `no-cross-app-import` is **superseded by ISO-R2** (R2 covers app _and_ backend cross-pillar reaches) and is deleted in the same PR.

### ISO-R1 — lib must never import a pillar (the canonical module-registry rule)

```js
{
  name: 'lib-no-pillar-import',
  severity: 'error',
  comment:
    'A lib facilitates pillars; it must never depend on one. Importing a pillar (by path under pillars/, or by its @pops/<pillar> contract package) inverts the dependency and blocks extraction: the lib could not build in its own repo without dragging a pillar in. If a lib needs a pillar capability at runtime it takes it via injection/discovery, not a compile-time import. See module-registry (canonical violation).',
  from: { path: '^libs/' },
  to: {
    pathNot: '^libs/',
    path: [
      '^pillars/',
      // KNOWN_PILLAR_IDS — generated from disk by scripts/gen-pillar-ids.mjs, never hand-edited:
      '^@pops/(ai|cerebrum|contacts|core|docs|finance|food|inventory|lists|mcp|media|moltbot|orchestrator|shell)(/|$)',
    ],
  },
},
```

The `@pops/<pillar>` alternation is **generated**, not hand-maintained — see §6 (`scripts/gen-pillar-ids.mjs`), which walks `pillars/*` at lint time and writes the regex fragment. This closes the audit's "static-list rot" finding at the lint layer (the same disease as the stale `POPS_PILLARS` default). A lib importing `@pops/finance` (even the _contract_) is forbidden: a lib has no business knowing finance exists.

### ISO-R2 — cross-pillar imports allowed only via published contract (supersedes `no-cross-app-import`)

```js
{
  name: 'pillar-no-cross-internal',
  severity: 'error',
  comment:
    'A pillar may consume another pillar ONLY through its published contract package (@pops/<other>, resolved via that package exports map). Reaching into pillars/<other>/src|app|db|migrations is reaching behind the contract and breaks black-box isolation + extraction. Same-pillar imports are fine.',
  from: { path: '^pillars/([^/]+)/' },
  to: { path: '^pillars/(?!\\1/)[^/]+/' },   // another pillar, by filesystem path
},
```

A filesystem-path cross-pillar import is _always_ a behind-the-contract reach (you cannot reach another pillar's `dist/contract` by relative path without `../../`). Legitimate consumption goes through the package name `@pops/<other>`, which dep-cruiser resolves through the `exports` map (only ever landing in `dist/contract/**`), so it is allowed by construction. This single rule subsumes the old `no-cross-app-import` _and_ extends the boundary to backends and `app↔backend` cross-pillar reaches.

### ISO-R3 — no deep import past any exports map

```js
{
  name: 'no-deep-internal-import',
  severity: 'error',
  comment:
    'Importing a subpath of a @pops/* package that its exports map does not declare is a behind-the-contract reach (e.g. @pops/finance/src/db, @pops/pillar-sdk/dist/internal). Consume only declared subpaths. Add an exports entry if the surface is meant to be public.',
  from: {},
  to: { path: '^@pops/[^/]+/(src|dist|lib|internal)/' },
},
```

Belt-and-suspenders with §3: a correct `exports` map makes such an import _fail to resolve_ (`ERR_PACKAGE_PATH_NOT_EXPORTED`); this rule makes it _fail to lint_ even before resolution, with a readable message.

### ISO-R4 — acyclic + leaf-libs stay leaf

```js
{
  name: 'no-circular',
  severity: 'error',
  comment: 'Cyclic dependency between units — a cycle means neither can be extracted independently.',
  from: {},
  to: { circular: true },
},
{
  name: 'lib-layering',
  severity: 'error',
  comment:
    'Leaf libs (types, db-types, sdk, settings, ai-telemetry) must not import any other @pops/* lib. They are the extraction floor.',
  from: { path: '^libs/(types|db-types|sdk|settings|ai-telemetry)/' },
  to: { path: '^@pops/', pathNot: '^@pops/(types|db-types|pillar-sdk|pillar-settings|ai-telemetry)(/|$)' },
},
```

> Dir name ≠ npm name: dirs are `libs/sdk` / `libs/settings`, npm names stay `@pops/pillar-sdk` / `@pops/pillar-settings` (`03-execution-phases.md` relocation decision — no rename). The `from` clause keys on **dir** (`^libs/sdk/`), the `to` exclusion keys on **npm name** (`@pops/pillar-sdk`). Both forms appear above deliberately.

### Options block — retain verbatim (already correct)

The existing `options` block stays as-is; the load-bearing line is `enhancedResolveOptions.exportsFields: ['exports']`, which makes dep-cruiser resolve workspace imports through the `exports` map exactly as a published consumer would. One tightening once frontends settle: add `'app/dist', '\\.vite'` to `options.exclude.path` (currently `node_modules,build,\.next,coverage,/migrations/,drizzle\.config\.`).

### Acceptance — ISO-R1..R4 (one PR)

- [ ] `no-cross-app-import` removed; ISO-R1..R4 present in `.dependency-cruiser.cjs`.
- [ ] `pnpm lint:boundaries` (post ISO-SCOPE) exits 0 OR only the **triaged** pre-existing baseline violations remain (expected: module-registry — but verify via §5's reconnaissance run; do not assume it is the only entry, see §4 + §5).
- [ ] A planted violation (`import {x} from '@pops/finance'` added to `libs/types/src/index.ts`) makes `pnpm lint:boundaries` exit non-zero with the `lib-no-pillar-import` message; revert the plant.
- [ ] A planted `import x from '@pops/finance/src/db'` trips `no-deep-internal-import`; revert.

**verify:**

```bash
pnpm lint:boundaries
# plant-test (must fail), then revert:
node -e "require('fs').appendFileSync('libs/types/src/index.ts','\nimport \"@pops/finance\";')" \
  && ! pnpm lint:boundaries ; git checkout libs/types/src/index.ts
```

**rollback:** `git revert <sha>` — pure config, no runtime impact.

---

## 3. ISO-EXPORTS — exports-map discipline (resolution-time enforcement)

dep-cruiser rules are advisory unless the package _physically cannot_ be imported wrong. The `exports` map + `files` field enforces the contract at resolution time, identically in-workspace and post-extraction. Mandatory per-unit invariants:

| Invariant                                                                 | compiled lib / pillar contract         | source lib                                                             |
| ------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `exports` declares **every** public subpath                               | yes (`./dist/...`)                     | yes (`./src/...`)                                                      |
| no `"./*"` catch-all exposing the whole tree                              | required                               | required (the `@pops/ui` `./primitives/*` is the one narrow exception) |
| `"files"` whitelists only shipped artifacts (`dist/**`, `openapi/*.json`) | **required — the extraction firewall** | n/a (source ships whole)                                               |
| `main`/`types` point at `dist`, never `src`                               | required                               | source libs point at `src` (correct)                                   |
| internal-only modules **absent** from `exports`                           | required                               | required                                                               |
| `"./package.json": "./package.json"` present                              | yes                                    | yes                                                                    |

`@pops/finance`'s `"files": ["dist/contract/**", "openapi/finance.openapi.json"]` (verified) is the gold standard — **every pillar contract package must add this `files` whitelist.** A consumer that writes `import x from '@pops/finance/src/db'` then gets `ERR_PACKAGE_PATH_NOT_EXPORTED`: the `exports` map turns the isolation rule into a hard build error, not a lint opinion.

### Self-consistency gate — `scripts/check-exports.mjs`

Per unit, assert: (a) every `exports` target exists after build; (b) no `exports` target points outside `files`/`dist`; (c) compiled units never export `./src/*`; (d) `version` is a real semver (workspace deps use `workspace:*` but the version must be publishable). Repo-meta tooling → lives in root `scripts/` (alongside `check-pillar-schema-coverage.mjs`). Wire into `quality.yml` via `isolation:check`.

### Acceptance — ISO-EXPORTS

- [ ] Every pillar contract `package.json` has a `files` whitelist excluding `src`/`migrations`.
- [ ] `node scripts/check-exports.mjs` exits 0 across all units after a full build.
- [ ] No `package.json` has a `"./*"` catch-all except `@pops/ui`'s audited `./primitives/*`.

**verify:**

```bash
mise run build        # or: pnpm -r build / tsc -b tsconfig.build.json
node scripts/check-exports.mjs
```

**rollback:** `git revert` per unit (file-disjoint, safe to revert individually).

---

## 4. module-registry — the canonical ISO-R1 violation

`libs/module-registry` `dependsOn` `@pops/types` only in _source_, but `package.json` **devDependencies pin all 8 backend pillars** (verified: `@pops/ai`…`@pops/media`, `@pops/core`). These are **vestigial workspace edges** — the build no longer imports pillars in source (it disk-walks `pillars/*` manifests and dynamic-`import()`s them, per `06-registry-decoupling.md`). It is nonetheless a **lib that declares dependencies on every pillar** — the textbook ISO-R1 violation and the static coupling the runtime-discovery north-star kills.

### What the rule says about it: **no exception.**

ISO-R1 fires on `libs/module-registry` importing any `pillars/**` or `@pops/<pillar>`. There is **no allow-list entry, no severity downgrade**. The fix is architectural (sequenced in `06-registry-decoupling.md` as RD-1..RD-9), not a rule carve-out:

| Aspect           | today (violation)                                         | target (rule-compliant)                                 |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| source of truth  | static `MODULES` array, `registry:build` → `generated.ts` | runtime self-registration via core `/registry` snapshot |
| pillar identity  | `KnownPillarId` union baked from imports                  | `string` ids resolved at runtime (RD-9)                 |
| lib's deps       | 8 pillar devDeps                                          | `@pops/types` only                                      |
| `registry:build` | emits `generated.ts`                                      | deleted (RD-5)                                          |

### Migration sequencing so CI stays green (cross-ref `06-registry-decoupling.md`)

1. **Grandfather, don't carve out.** Keep module-registry's existing edges in the dep-cruiser **baseline** (`.dependency-cruiser-known-violations.json`, a JSON array — verified present, currently `[]`) while the runtime path is finished. ISO-R1 is `error` for _new_ code immediately; the baseline only grandfathers the existing edges. **Caveat:** module-registry is the expected — not assumed — sole baseline entry; ISO-SCOPE's reconnaissance run (§5) is what confirms it, since this is the first time backends/libs are cruised. Any _other_ edge that run surfaces is triaged per §5 (fixed or escalated), never silently baselined.
2. **RD-1** drops the 8 vestigial pillar devDeps (zero behavior change — source disk-walks, doesn't import the graph). After RD-1, re-run `pnpm lint:boundaries:baseline` and confirm the module-registry baseline entries can be **removed**.
3. **RD-3/RD-4** flip the shell + API off the static `generated.ts` onto the runtime snapshot. **RD-5** deletes `registry:build`/`generated.ts`. **RD-9** widens `KnownPillarId → string`.
4. `baseline-guard.sh` (EX-3) then prevents re-adding the edges.

> The only place a pillar list is hand-touchable is ISO-R1's `to.path` regex, and that is **generated from disk** (§6) — closing the "static-list rot" at the lint layer too.

### Acceptance — ISO-REG (the lint half; arch half lives in `06-registry-decoupling.md`)

- [ ] After RD-1, `libs/module-registry/package.json` has zero `@pops/<pillar>` deps (`@pops/types` only).
- [ ] module-registry baseline entries removed from `.dependency-cruiser-known-violations.json`.
- [ ] `pnpm lint:boundaries` exits 0 with no grandfathered module-registry violations remaining.

**verify:** `grep -c '@pops/\(ai\|cerebrum\|core\|finance\|food\|inventory\|lists\|media\)' libs/module-registry/package.json` → `0`; `pnpm lint:boundaries`.

---

## 5. ISO-SCOPE — `lint:boundaries` scope expansion (fixes audit finding)

`lint:boundaries` today scans **only** `pillars/<x>/app/src` (7 enumerated dirs — verified). It misses every backend and every lib, so ISO-R1..R4 would not even run against the units they target. Retarget to the **two roots** (disk-discovery, same virtue as the pillar matrices):

```jsonc
// package.json
"lint:boundaries": "depcruise --config .dependency-cruiser.cjs --ignore-known --output-type err pillars libs scripts",
"lint:boundaries:baseline": "depcruise --config .dependency-cruiser.cjs --output-type baseline --output-to .dependency-cruiser-known-violations.json pillars libs scripts"
```

Passing roots (not enumerated dirs) means new units are gated automatically. The baseline shrinks toward empty as migration completes; EX-3 asserts it only ever shrinks.

### Mandatory triage step — the widened scope is a first-light scan, not a no-op

Today `lint:boundaries` cruises **only** the 7 `app/src` dirs and its baseline is **empty (`[]` — verified)**. The moment ISO-SCOPE widens to `pillars libs scripts`, dep-cruiser cruises **every backend `src` and every lib for the first time ever** against ISO-R1..R4. That first cruise will almost certainly surface pre-existing edges that were never linted — not only module-registry: any latent cross-pillar `../../` reach, any deep `@pops/x/dist/internal` import, any cycle in backend/lib source that predates these rules. **Do not assume the only grandfathered entry is module-registry.** That single-entry assumption (shared by §4, `06-registry-decoupling.md` §6, `07` RK-09) is a _hypothesis to verify_, not a given.

Therefore ISO-SCOPE is not "swap two script lines." Its ordered procedure is:

1. **Reconnaissance first (before writing any acceptance criterion).** On the `03-execution-phases.md` relocation result, run the widened cruise against `main` _raw_ (no `--ignore-known`) to enumerate the true violation set:
   ```bash
   depcruise --config .dependency-cruiser.cjs --output-type err pillars libs scripts | tee /tmp/widened-cruise.txt
   ```
2. **Triage every entry, do not blanket-grandfather.** For each violation: if it is a **real** isolation breach (a fixable cross-pillar reach, deep import, or cycle), **fix it in this PR** (or a same-group sibling PR) — bring the code into compliance. Only the **module-registry pillar edges** (whose fix is architectural and sequenced in `06-registry-decoupling.md` RD-1/RD-3/RD-4) may be grandfathered into the baseline. If reconnaissance surfaces an edge that is _neither_ trivially fixable _nor_ module-registry, escalate it as a new task in `03-execution-phases` before this phase can be declared green — never silently baseline it.
3. **Generate the baseline only from the triaged remainder:**
   ```bash
   pnpm lint:boundaries:baseline   # writes .dependency-cruiser-known-violations.json from the post-fix tree
   ```
4. **Write the acceptance criterion against the verified set**, not the assumption. If reconnaissance proved module-registry is the sole remaining entry, state that; if not, the criterion must list exactly the triaged-and-justified entries.

> **Cross-ref correction:** the "module-registry is the only baseline entry" claim in §4, `06-registry-decoupling.md` §6, and `07` RK-09 holds **only if step 1 confirms it on the post-reshuffle tree.** Treat it as the expected — not guaranteed — outcome; the reconnaissance run is the gate that makes it true (or forces fixes that make it true).

### Acceptance — ISO-SCOPE

- [ ] `lint:boundaries` + `:baseline` scripts pass `pillars libs scripts` (not enumerated app dirs).
- [ ] Reconnaissance run (`depcruise ... pillars libs scripts` raw, no `--ignore-known`) captured; every surfaced violation triaged — real ones fixed in-PR, only module-registry pillar edges grandfathered, anything else escalated as a task.
- [ ] `.dependency-cruiser-known-violations.json` contains **only** the triaged-and-justified entries (verified against the reconnaissance output, not assumed to be module-registry alone).
- [ ] `pnpm lint:boundaries` exercises backends + libs (planted lib→pillar import is caught; cf. ISO-R1 verify).
- [ ] CI gate green on a fresh checkout (`pnpm install --frozen-lockfile && pnpm lint:boundaries`).

**rollback:** revert the two script lines (and any code fixes made during triage, if the whole phase is rolled back).

---

## 6. Generated pillar-id list — `scripts/gen-pillar-ids.mjs`

So ISO-R1's `@pops/<pillar>` alternation never goes stale. Walks `pillars/*` at lint time, emits the regex fragment consumed by `.dependency-cruiser.cjs`.

```js
// scripts/gen-pillar-ids.mjs — invoked from the dep-cruiser config require()
import { readdirSync, existsSync } from 'node:fs';
export function knownPillarIds() {
  return readdirSync('pillars', { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        (existsSync(`pillars/${d.name}/package.json`) || existsSync(`pillars/${d.name}/Cargo.toml`))
    )
    .map((d) => d.name)
    .sort();
}
```

`.dependency-cruiser.cjs` then builds ISO-R1's `to.path` alternation via `` `^@pops/(${knownPillarIds().join('|')})(/|$)` ``. Single source of truth, disk-derived — same pattern as `pillar-quality.yml`.

**Acceptance:** adding a new `pillars/<x>` directory automatically appears in the ISO-R1 regex with no config edit (verify: `node -e "import('./scripts/gen-pillar-ids.mjs').then(m=>console.log(m.knownPillarIds()))"`).

---

## 7. CI extractability check — the litmus test, mechanized

Static rules can't prove a unit _builds alone_. Three layers, cheap → thorough.

### EX-1 — declared-deps completeness (fast, every PR, per changed unit)

Phantom-dependency detection: a unit must declare in its own `package.json` everything it imports. pnpm hoisting hides missing deps ("workspace bleed").

```bash
# scripts/extractability/check-unit.sh <unit-dir>
set -euo pipefail
unit="$1"
tsc -b "$unit/tsconfig.build.json" 2>/dev/null || pnpm --filter "...{$unit}^..." run build
node scripts/extractability/depcheck.mjs "$unit"   # fail on used-but-undeclared @pops/* import
```

`depcheck.mjs` (wrapping `depcheck`/`knip`) treats any `@pops/*` import absent from the unit's `dependencies`/`peerDependencies` as a hard error — the cheap proxy for "could it build in its own repo".

### EX-2 — true sandbox extraction (nightly + on units touching `exports`/deps)

The real litmus test: copy the unit out, `pnpm pack` its declared `@pops/*` deps, install **only** declared deps, build with no workspace path resolution.

```bash
# scripts/extractability/sandbox.sh <unit-dir>
set -euo pipefail
unit="$1"; work="$(mktemp -d)"
node scripts/extractability/pack-deps.mjs "$unit" "$work/.deps"      # pnpm pack each @pops dep -> tgz
cp -R "$unit" "$work/u"
node scripts/extractability/rewrite-deps.mjs "$work/u/package.json" "$work/.deps"  # workspace:* -> file:.deps/<pkg>.tgz
cd "$work/u" && pnpm install --ignore-workspace --frozen-lockfile=false
pnpm run build && pnpm run typecheck                                  # the proof
```

If a unit secretly reaches behind a contract, the build fails: the reached file is **not in the packed `dist`** (because `files` excluded it). This is exactly the "changing only where shared deps come from" clause — workspace path swapped for packed tarball, nothing else. Driven by a disk-discovered matrix (`find pillars libs -maxdepth 2 -name package.json` → changed-unit subset → one sandbox job each).

### EX-3 — baseline monotonicity (every PR, instant)

```bash
# scripts/extractability/baseline-guard.sh
set -euo pipefail
git show origin/main:.dependency-cruiser-known-violations.json > /tmp/base.json
node -e '
  const b=require("/tmp/base.json"), h=require("./.dependency-cruiser-known-violations.json");
  if (h.length > b.length) { console.error(`baseline grew ${b.length}->${h.length}; no new boundary violations`); process.exit(1); }
'
```

Grandfathered violations may only decrease — forbids regressions mid-migration.

### ISO-CMD — the one gate

```jsonc
// package.json
"isolation:check": "pnpm lint:boundaries && node scripts/check-exports.mjs && bash scripts/extractability/baseline-guard.sh && bash scripts/extractability/check-changed-units.sh"
```

`isolation:check` = the fast PR gate (R-rules + exports + EX-1 + EX-3), added to `quality.yml` and runnable locally before commit (per HARD CONSTRAINTS). EX-2 (full sandbox) runs in the disk-discovered matrix + nightly — too slow per-push, decisive when it runs.

### Acceptance — EX-1/EX-2/EX-3/ISO-CMD

- [ ] `scripts/extractability/{check-unit,sandbox,baseline-guard}.sh` + `{depcheck,pack-deps,rewrite-deps}.mjs` present and executable.
- [ ] `pnpm isolation:check` exits 0 on `main`.
- [ ] EX-2 sandbox builds at least the 5 leaf libs (`types,db-types,sdk,settings,ai-telemetry`) in isolation.
- [ ] A planted deep-reach (`@pops/finance/src/db`) fails EX-2 (build) **and** ISO-R3 (lint); revert.
- [ ] EX-3 fails a PR that adds a baseline entry; passes one that removes entries.

**verify:**

```bash
pnpm isolation:check
bash scripts/extractability/sandbox.sh libs/types
```

**rollback:** these are new files + one script key — `git revert`; no production surface touched.

---

## 8. Rust crate boundaries (RUST-1..RUST-3)

Rust is structurally _stronger_ than TS (no path-import escape hatch — crates see only each other's `pub` API), but the single-workspace shape needs the same litmus discipline. Verified shape: one workspace, `crates/Cargo.toml`, `members = ["../pillars/contacts", "pops-ai", "pops-settings"]`, one lockfile, `[workspace.dependencies]`. After `03-execution-phases.md` relocation, members become `["pillars/contacts", "libs/pops-ai", "libs/pops-settings"]` and the workspace root relocates to repo root. Taxonomy: `contacts` = **pillar**, `pops-ai`/`pops-settings` = **libs**. Keep the single workspace (one lockfile, one CI lane — `02-build-system.md` (d)).

### Crate-boundary rules

| Rule    | Statement                                                                                              | Enforced by                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RUST-2a | a lib crate (`pops-ai`/`pops-settings`) must not `[dependencies]` a pillar crate                       | `check-cargo-deps.mjs` (cargo won't stop it)                                                                                                                                                                                 |
| RUST-2b | a pillar crate must not `[dependencies]` another pillar crate (cross-pillar = REST or shared lib only) | `check-cargo-deps.mjs`                                                                                                                                                                                                       |
| (free)  | no reaching behind a crate                                                                             | Rust itself — only `pub` items reachable. Discipline: thin `pub` surface; `#![warn(missing_docs)]` on the contract module; **no `pub use internal::*` blob** (the Rust `"./*"` catch-all) — clippy at `-D warnings` + review |

### RUST-2 — `check-cargo-deps.mjs`

Parses each member's `Cargo.toml`, classifies by dir (`pillars/*` = pillar, `libs/*` = lib), fails if a lib `[dependencies]` references a pillar crate or any crate `[dependencies]` a sibling pillar crate.

### RUST-1 — `deny.toml` + `cargo deny` (no `deny.toml` exists yet — verified)

```toml
# deny.toml (repo root after reshuffle; or crates/ pre-move)
[bans]
multiple-versions = "warn"
wildcard = "deny"                 # no `*` specs — every dep pinned, extraction-safe (the Rust mirror of "exports declares every subpath")
[licenses]
allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "Unicode-3.0"]
confidence-threshold = 0.9
[advisories]
yanked = "deny"
```

`rust-quality.yml` (already disk-agnostic — adding a crate needs no workflow edit) gains one step:

```yaml
- name: Boundaries + supply chain
  run: |
    cargo install cargo-deny --locked
    cargo deny check
    node scripts/extractability/check-cargo-deps.mjs
```

### RUST-3 — `cargo-sandbox.sh` (nightly, cargo analogue of EX-2)

```bash
# scripts/extractability/cargo-sandbox.sh <crate-dir>
set -euo pipefail
crate="$1"
node scripts/extractability/cargo-extract.mjs "$crate" /tmp/crate-out   # inline [workspace.package] + {workspace=true} deps → pinned
cd /tmp/crate-out && cargo build --all-targets
```

`cargo-extract.mjs` materializes `[workspace.package]` (`edition`, `license`) and every `{ workspace = true }` dep inline from the workspace `[workspace.dependencies]` — the "changing only where shared deps come from" mutation. If it builds, the crate is extraction-ready. Matrix discovered from the workspace `members` list, nightly alongside EX-2.

### Acceptance — RUST-1..RUST-3

- [ ] `deny.toml` present; `cargo deny check` exits 0 (no wildcard specs, allowed licenses only).
- [ ] `node scripts/extractability/check-cargo-deps.mjs` exits 0; a planted `contacts` dep in `libs/pops-ai/Cargo.toml` makes it fail; revert.
- [ ] `rust-quality.yml` runs the boundaries+supply-chain step.
- [ ] (nightly) `cargo-sandbox.sh libs/pops-ai` builds in isolation.

**verify:**

```bash
cargo deny check
node scripts/extractability/check-cargo-deps.mjs
```

**rollback:** revert `deny.toml` + the `rust-quality.yml` step; new script is inert.

---

## 9. Artifact summary

| ID          | Artifact                                                 | Kind                                        | Gate                             |
| ----------- | -------------------------------------------------------- | ------------------------------------------- | -------------------------------- |
| ISO-R1..R4  | rules in `.dependency-cruiser.cjs`                       | edit                                        | `pnpm lint:boundaries`           |
| ISO-SCOPE   | `lint:boundaries` → `pillars libs scripts`               | edit `package.json`                         | every PR                         |
| ISO-EXPORTS | per-unit `exports`+`files` + `scripts/check-exports.mjs` | edit + new                                  | `isolation:check`                |
| §6          | `scripts/gen-pillar-ids.mjs`                             | new                                         | dep-cruiser config require       |
| EX-1        | `check-unit.sh` + `depcheck.mjs`                         | new                                         | `isolation:check` (PR)           |
| EX-2        | `sandbox.sh` + `pack-deps`/`rewrite-deps.mjs`            | new                                         | disk-discovered matrix + nightly |
| EX-3        | `baseline-guard.sh`                                      | new                                         | every PR                         |
| ISO-CMD     | `isolation:check` in `package.json`                      | new                                         | local + `quality.yml`            |
| ISO-REG     | module-registry de-pillaring                             | architectural (`06-registry-decoupling.md`) | ISO-R1 + EX-3                    |
| RUST-1      | `deny.toml` + `cargo deny` step                          | new                                         | `rust-quality.yml`               |
| RUST-2      | `check-cargo-deps.mjs`                                   | new                                         | `rust-quality.yml`               |
| RUST-3      | `cargo-sandbox.sh` + `cargo-extract.mjs`                 | new                                         | nightly matrix                   |

### Files of record (absolute)

- `/Users/joao/dev/personal/pops/.dependency-cruiser.cjs` (ISO-R1..R4; delete `no-cross-app-import`)
- `/Users/joao/dev/personal/pops/.dependency-cruiser-known-violations.json` (JSON array baseline; EX-3 + ISO-REG)
- `/Users/joao/dev/personal/pops/package.json` (`lint:boundaries`, `lint:boundaries:baseline`, `isolation:check`)
- `/Users/joao/dev/personal/pops/pnpm-workspace.yaml` (`packages/*`,`apps/*` → `libs/*`; resolution backing for exports checks)
- `/Users/joao/dev/personal/pops/pillars/finance/package.json` (`files` whitelist exemplar)
- `/Users/joao/dev/personal/pops/libs/module-registry/{package.json,src/generated.ts}` (canonical violation; RD-1 drops 8 pillar devDeps)
- `/Users/joao/dev/personal/pops/Cargo.toml` (post-reshuffle root) + `/Users/joao/dev/personal/pops/deny.toml` (new)
- `/Users/joao/dev/personal/pops/.github/workflows/rust-quality.yml` (extend: cargo-deny + check-cargo-deps)
- `/Users/joao/dev/personal/pops/scripts/` + `/Users/joao/dev/personal/pops/scripts/extractability/` (all new check tooling)
