# US-08: URI resolver as a registry consumer

> PRD: [Plugin Contract](README.md)
> Status: In progress

## Description

As a system component (AI overlay, universal search, deep links), I want a single function that resolves a `pops:{module}/{type}/{id}` URI to its underlying object, returning a typed placeholder when the owning module is not installed instead of throwing.

Closes the URI half of #2522. Implements ADR-012.

## Acceptance Criteria

- [x] New procedure `core.uri.resolve` accepts a URI string and returns `UriResolverResult`: `{ kind: 'object', moduleId, type, id, data }` | `{ kind: 'not-found', moduleId, type, id }` | `{ kind: 'module-absent', moduleId }` | `{ kind: 'malformed', uri, reason }`.
- [x] Resolver parses the URI per ADR-012, looks up the owning module in the registry by id, and dispatches to that module's `uriHandler.resolve(type, id)` if the module is installed and declares a handler for the type.
- [x] If the module is not installed: returns `{ kind: 'module-absent', moduleId }` — no exception, no `NOT_FOUND` round-trip.
- [x] If the module is installed but doesn't declare a handler for the requested type: returns `{ kind: 'not-found' }`.
- [x] If the URI is malformed (wrong prefix, missing parts, lowercase violation): returns `{ kind: 'malformed', uri, reason }`.
- [x] Each module that owns objects referenced cross-module declares a `uriHandler` in its manifest. Initial coverage: `finance` (transaction, entity, budget), `media` (movie, tv-show), `inventory` (item, location).
- [x] Frontend helper component `<UriCard resolution={...} />` renders: object-specific card on `object` (consumer-supplied via `renderObject`, or a generic id+type fallback); "not found" card on `not-found`; "module not installed" card on `module-absent` (matches PRD-100's NotInstalledPage tone); "broken link" card on `malformed`. The component is presentation-only — the consumer calls `core.uri.resolve` and threads the result through.
- [x] Test: with `POPS_APPS=finance`, resolving `pops:media/movie/42` returns `{ kind: 'module-absent', moduleId: 'media' }` and `<UriCard>` renders the placeholder.

## Notes

- The resolver is the first real consumer of ADR-012; expect to evolve `UriHandlerDescriptor` once Cerebrum's engram referencing exercises it more fully.
- Closing #2522 in two halves is intentional — search and URI resolution share a registry but have different consumer shapes.
