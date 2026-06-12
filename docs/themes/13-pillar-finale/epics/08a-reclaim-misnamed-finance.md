# Epic 08a: Reclaim misnamed finance code from `core/`

> Theme: [Pillar finale](../README.md)

## Scope

Mechanical reorganisation, not architectural decision-making. The `commitImport`, `tag-suggester`, `corrections`, and `tag-rules` modules read and write tables that all live in `finance.db` and have only finance-coded callers — but they live at `apps/pops-api/src/modules/core/` because early architecture envisioned them as cross-pillar primitives that never materialised. Move them into `pops-finance-api`, rename their tRPC namespaces from `core.*` to `finance.*`, delete the legacy mounts on `pops-api`.

This is the lower-hanging-fruit half of what M2 PR 3 deferred. Could ship as a Theme 12 postscript before Theme 13 starts proper.

## PRDs

| #   | PRD                                       | Summary                                                                                                       | Status      |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| 203 | Directory move + tRPC namespace rename    | corrections + tag-rules + commitImport + tag-suggester → finance-api; rename namespaces                       | Not started |
| 204 | Shell call-site migration                 | Update every `trpc.core.corrections.*` / `trpc.core.tagRules.*` in `apps/pops-shell` + `packages/app-finance` | Not started |
| 205 | MCP + CLI call-site migration             | Same for pops-mcp + pops-cli; backwards-compat aliases for in-flight clients if needed                        | Not started |
| 206 | Dispatcher update + legacy mount deletion | nginx routes `finance.corrections.*` + `finance.tagRules.*` to finance-api; pops-api mounts gone              | Not started |

PRDs 203 → 204 + 205 (parallel) → 206 (sequencing).

## Dependencies

- **Requires:** Nothing inside Theme 13; this epic is self-contained and could ship today
- **Unlocks:** finance-api is genuinely self-contained; M2 PR 3's deferred-delete becomes a real delete; cleaner baseline for the rest of Theme 13

## Out of Scope

- Genuinely cross-pillar code placement (search, AI ops, worker, URI dispatcher) — Epic 08b
- Frontend hooks rewrite — Epic 10
- Contract package extraction for finance — Epic 00 (separate concern, but easier after 08a)
