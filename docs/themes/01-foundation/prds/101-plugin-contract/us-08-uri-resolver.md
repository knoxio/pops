# US-08: URI resolver as a registry consumer

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a system component (AI overlay, universal search, deep links), I want a single function that resolves a `pops:{module}/{type}/{id}` URI to its underlying object, returning a typed placeholder when the owning module is not installed instead of throwing.

Closes the URI half of #2522. Implements ADR-012.

## Acceptance Criteria

- [ ] New procedure `core.uri.resolve` accepts a URI string and returns `UriResolution`: `{ kind: 'object', moduleId, type, data }` | `{ kind: 'not-found', moduleId, type, id }` | `{ kind: 'module-absent', moduleId }` | `{ kind: 'malformed', uri, reason }`.
- [ ] Resolver parses the URI per ADR-012, looks up the owning module in `MODULES` by id, and dispatches to that module's `uriHandler.resolve(type, id)` if the module is installed and declares a handler for the type.
- [ ] If the module is not installed: returns `{ kind: 'module-absent', moduleId }` — no exception, no `NOT_FOUND` round-trip.
- [ ] If the module is installed but doesn't declare a handler for the requested type: returns `{ kind: 'not-found' }`.
- [ ] If the URI is malformed (wrong prefix, missing parts, lowercase violation): returns `{ kind: 'malformed', uri, reason }`.
- [ ] Each module that owns objects referenced cross-module declares a `uriHandler` in its manifest. Initial coverage: `finance` (transaction, entity, budget), `media` (movie, tv-show), `inventory` (item, location).
- [ ] Frontend helper component `<UriCard uri={...} />` calls `core.uri.resolve` and renders: object-specific card on `object`; "not found" card on `not-found`; "module not installed" card on `module-absent` (matches PRD-100's NotInstalledPage tone); "broken link" card on `malformed`.
- [ ] Test: with `POPS_APPS=finance`, resolving `pops:media/movie/42` returns `{ kind: 'module-absent', moduleId: 'media' }` and `<UriCard>` renders the placeholder.

## Notes

- The resolver is the first real consumer of ADR-012; expect to evolve `UriHandlerDescriptor` once Cerebrum's engram referencing exercises it more fully.
- Closing #2522 in two halves is intentional — search and URI resolution share a registry but have different consumer shapes.
