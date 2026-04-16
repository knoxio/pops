# US-06: tRPC API Procedures

> PRD: [PRD-077: Engram File Format & Directory Structure](README.md)
> Status: Not started

## Description

As a client application, I need tRPC procedures that expose all engram and template operations so that I can create, read, update, delete, list, link, and manage engrams through a typed API.

## Acceptance Criteria

- [ ] A tRPC router at `src/modules/cerebrum/engrams/router.ts` exposes procedures under the `cerebrum.engrams` namespace: `create`, `get`, `update`, `delete`, `list`, `link`, `unlink`
- [ ] A tRPC router exposes template procedures under the `cerebrum.templates` namespace: `list`, `get`
- [ ] `create` accepts `{ type, title, body, scopes?, tags?, template?, customFields? }`, calls `createEngram`, and returns `{ engram: Engram }`
- [ ] `list` accepts `{ type?, scopes?, tags?, status?, search?, limit?, offset?, sort? }`, queries the index tables (not the filesystem), and returns `{ engrams: Engram[], total: number }` with correct pagination
- [ ] `delete` calls `archiveEngram` (not a physical delete) and returns `{ success: boolean }`
- [ ] `link` and `unlink` accept `{ sourceId, targetId }` and delegate to `linkEngrams` / `unlinkEngrams` respectively, returning `{ success: boolean }`
- [ ] All procedure inputs are validated with Zod schemas that match the PRD's API Surface table — invalid input returns a typed tRPC error, not an unhandled exception
- [ ] `templates.list` returns all registered templates with their metadata (name, description, required fields, custom fields) and `templates.get` returns a single template by name or throws a `NOT_FOUND` error

## Notes

- The router should delegate all business logic to the service layer from US-05 — no file I/O or direct database queries in the router.
- The `list` procedure's `search` parameter performs a case-insensitive substring match on `title` in the index.
- The `sort` parameter should support `created_at`, `modified_at`, and `title` with ascending/descending direction.
- Follow existing tRPC router patterns in the POPS codebase for error handling and context usage.
