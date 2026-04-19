# POPS – Copilot Instructions

## What This Repository Is

POPS (Personal Operations System) is a self-hosted personal command center for finance, media, inventory, and AI operations. It is a pnpm/Turborepo monorepo running on Node.js (24 locally via `mise`, 22 in CI/production) with SQLite (Drizzle ORM), tRPC + Express, React 19 + Vite, and Tailwind v4. AI categorization and entity matching use the Claude API; embeddings use an OpenAI-compatible client (configurable via `EMBEDDING_API_URL`, defaulting to `https://api.openai.com/v1`). Jobs run on BullMQ + Redis. The system deploys via Docker Compose + Ansible to a home server behind Cloudflare Tunnel.

**Monorepo layout:**
- `apps/pops-api/` — Express + tRPC backend
- `apps/pops-shell/` — React PWA shell (React Router 7)
- `apps/moltbot/` — Telegram bot
- `packages/app-{finance,media,inventory,ai}/` — Domain UI packages
- `packages/db-types/` — Drizzle schema + all database types
- `packages/ui/` — Shared component library (shadcn/Radix primitives + composites)
- `packages/api-client/` — tRPC client setup
- `infra/` — Ansible playbooks + Docker Compose
- `docs/` — PRDs, epics, user stories, ADRs, roadmap

**Documentation hierarchy (strictly maintained):** Theme → Epic → PRD → User Story (status flows upward: US done → PRD → Epic → Theme → `docs/roadmap.md`)

---

## Build, Test, and Validate

Prefer `mise` for cross-package tasks. Some checks have no `mise` wrapper and must be run directly with `pnpm`. All of the following must pass before a PR can merge:

```bash
# Via mise (run from repo root)
mise lint          # oxlint (type-aware) — zero tolerance for warnings
mise typecheck     # Full TypeScript strict check across all packages
mise test          # Vitest unit tests
mise build         # Turbo build — must produce zero errors

# Via pnpm (no mise wrapper — run from repo root or package dir)
pnpm format:check                                    # oxfmt formatting check
cd apps/pops-api && pnpm openapi:validate            # Required after any API changes
cd apps/pops-api && pnpm test:integration            # Integration tests (also run in CI)
cd apps/pops-shell && pnpm test:e2e                  # Playwright E2E (also run in CI)
```

Git hooks (enforced via Husky): pre-commit runs `lint-staged` (oxlint + oxfmt on staged files) and `pnpm typecheck`; pre-push checks for merge conflicts with `origin/main`. Recommended to also run `mise lint && mise typecheck && mise test` manually before pushing.

GitHub Actions runs: lint, typecheck, format, unit tests, integration tests, E2E, OpenAPI validation, and Docker build — all must be green.

---

## Code Review Standards

### The Reviewing Mindset

Every issue in a review is a **blocker**. There are no "non-blocking", "nit:", "optional:", or "minor:" issues. If something is wrong, insufficient, inconsistent, or incomplete, it must be fixed before the PR merges. There is no LGTM with caveats.

Do not soften or hedge. Do not say "you might want to consider" or "this is just a suggestion". State what is required and why.

### What to Check — Always

**1. Documentation sync (zero drift tolerated)**

- Every code change that touches a feature, API surface, data model, or behavior must have corresponding updates in `docs/`. Check: the relevant user story (`us-NN-*.md`), PRD (`docs/themes/NN-*/prds/NNN-*/README.md`), and epic.
- Update status fields to reflect the current state: `Done` when all acceptance criteria in the US are met; `Partial` when some criteria are intentionally deferred (with the missing items explicitly documented in the US); `In progress` otherwise. Marking `Partial` without documenting what remains is a blocker.
- `docs/roadmap.md` must reflect the current state of any phase or PRD that changed.
- API changes must update or maintain the OpenAPI spec. Run `pnpm openapi:validate`.
- Schema changes must have a Drizzle migration generated via `mise drizzle:generate`.
- Any behavior documented in `AGENTS.md`, `CONVENTIONS.md`, or `docs/CLAUDE.md` that changes must be updated in those files too.
- Design system changes must be reflected in `.impeccable.md` if applicable.

**2. Implementation gaps — no partial work**

- If a PR implements part of a feature but leaves gaps (TODOs, stubs, placeholder logic, skipped edge cases), either: (a) the gaps must be closed in this PR, or (b) a GitHub issue must exist that explicitly tracks each gap before the PR merges. A gap without a tracking issue is a blocker.
- `// TODO`, `// FIXME`, `// HACK`, `// TEMP`, `// placeholder`, or any similar marker introduced by this PR is a blocker unless it references an open GitHub issue by URL or number.
- Commented-out code is a blocker.

**3. Correctness**

- Verify all acceptance criteria in the referenced user story are fully satisfied.
- Drizzle queries must use parameterized inputs — never string interpolation.
- All external inputs (user input, webhook payloads, imported CSV data) must be validated with Zod at the boundary.
- No secrets, `.env` values, or credentials may be hardcoded or committed.
- PII (names, emails, account numbers) must be stripped before logging.

**4. Type safety**

- TypeScript `strict` mode is always on. No `any`, no `as unknown as X`, no `@ts-ignore` without a comment explaining an upstream library bug.
- Every tRPC procedure input must have a Zod schema. Every response must be typed.
- No implicit `any` from missing type annotations on function parameters.

**5. Conventions (from `CONVENTIONS.md`)**

- API modules: `router.ts` + `service.ts` + `types.ts` + `index.ts`. Business logic lives in `service.ts` only.
- Frontend: one route = one page. Page components use shell + sections + hooks pattern for complex UIs.
- Styling: Tailwind only. No arbitrary values without a design token reason. Use `app-accent` for domain color. No `style={{}}` except for dynamic runtime values (e.g., progress bar widths computed at runtime); `w-[var(--radix-*)]` bindings are also permitted.
- Components: all new UI components must have a Storybook story.
- Icons: Lucide only. No other icon libraries.
- Database: integer PKs for domain tables, UUID text for cross-domain FKs. Timestamps as ISO 8601 `TEXT`. All schema changes via Drizzle migrations.
- Tests: alongside source as `*.test.ts`. No test file placed in a separate top-level `tests/` directory.

**6. Security**

- Never read, log, or pass `.env` values to untrusted surfaces.
- No raw SQL string concatenation. Drizzle ORM for all database access.
- Webhook handlers must verify signatures before processing.
- Cloudflare Access headers must not be trusted from internal traffic.

**7. Size and scope**

- A PR must do one thing. Mixed concerns (feature + refactor + docs) must be separated unless inseparable.
- Dead code introduced by a refactor must be deleted, not commented out.
- If a file grows beyond ~300 lines due to this PR, flag it as a concern and require a plan to split it.

### How to Report Issues

Report every issue as a required change. Use direct language:

> "This procedure lacks a Zod input schema. Add one before merging."
> "The user story us-04-transactions.md acceptance criteria item 3 is not satisfied by this implementation."
> "There is no migration for the new `tags` column. Run `mise drizzle:generate` and commit the result."
> "This TODO at line 47 has no tracking issue. Either resolve it or open a GitHub issue and reference it here."

Do not batch small issues into a single comment. File a separate review comment per issue so each can be resolved independently and tracked.

---

## Key Files for Context

| Purpose | Path |
|---|---|
| Agent guidance (primary) | `AGENTS.md` |
| Coding conventions | `CONVENTIONS.md` |
| Design system | `.impeccable.md` |
| Documentation standards | `docs/CLAUDE.md` |
| Roadmap & phase tracker | `docs/roadmap.md` |
| DB schema | `packages/db-types/src/schema/` |
| tRPC routers | `apps/pops-api/src/modules/*/router.ts` |
| Business logic | `apps/pops-api/src/modules/*/service.ts` |
| UI components | `packages/ui/src/components/` |
| Task runner | `mise.toml` |
| CI workflows | `.github/workflows/` |

Trust these instructions. Only search the codebase when information here is incomplete or appears incorrect.
