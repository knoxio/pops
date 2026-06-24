# Search UI

> Pillar: [@pops/shell](../../README.md)
> Status: Done

## Purpose

The search surface — a top-bar search input that opens a results panel of
context-aware sections. The current pillar's results appear first and are
visually distinct. Each domain renders its own results through a registered
`ResultComponent`, so the search UI carries no knowledge of any domain's
layout. Search itself is federated: the shell `POST`s a query to the search
orchestrator and renders the sections it returns.

The components live in `@pops/navigation` (shared by the shell top bar and the
mobile overlay); the shell mounts them.

## UX flow

1. The user focuses the search input or presses `Cmd+K` / `Ctrl+K`.
2. Types a query; after a debounce the orchestrator query fires.
3. Results render as sections:
   - **Context section** (current pillar): highlighted, shown first;
   - **Other sections**: grouped by domain, ordered by relevance.
4. Each section header shows a domain icon + label + result count.
5. Each result is rendered by the domain's `ResultComponent` (poster thumbnail
   for media, amount+date for finance, asset badge for inventory, …); a generic
   fallback renders title text for unknown domains.
6. "Show more" appears when a section's `totalCount` exceeds the displayed page
   and appends more results.
7. Clicking a result resolves its POPS URI to a route and navigates.
8. Arrow keys move across sections, Enter selects, Escape closes.
9. When the input is empty and focused, recent searches show instead.

## Backend surface

Search is a single federated call to the orchestrator, proxied by the shell:

| Endpoint (shell-relative)  | Method | Purpose                                                                                        |
| -------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `/orchestrator-api/search` | POST   | Federated search; the proxy strips `/orchestrator-api` so the orchestrator sees `POST /search` |

The request carries the query plus the current app context (so the orchestrator
can mark the context section). The response is `{ sections: [...] }`, each
section carrying a `domain`, owning `moduleId`, ranked `hits` (`uri`, `score`,
`matchField`, `data`), an icon/colour, an `isContextSection` flag, and a
`totalCount`. Sections whose owning module is not installed are filtered out.
`POST /search` returns a single capped page — there is no pagination cursor.

## Result-component registry

`@pops/navigation` exposes a frontend registry decoupling the panel from domain
layouts:

- `registerResultComponent(domain, component)` — each pillar registers its
  component at module-load time (same side-effect pattern as route
  registration).
- `getResultComponent(domain)` — returns the registered component, or a generic
  fallback that renders the first string field of `data` as a title.

The panel calls `getResultComponent(section.domain)` per section and renders its
hits through it. The search UI never imports a domain component directly.

## Recent searches

Client-side only (`localStorage`, key `pops:recent-searches`, max 10, deduped,
most-recent-first). A query is recorded on submit. The recents list shows when
the input is focused and empty; clicking a recent populates the input and
re-runs the search; a "Clear recent" button wipes the history. Recents hide once
the user starts typing (the panel switches to live results).

## Business rules

- The search UI is domain-agnostic — all domain rendering goes through the
  result-component registry.
- The current pillar's section is always first and visually distinct.
- Search history is client-side only — no server storage.
- The panel is keyboard-navigable across sections.

## Edge cases

| Case                                      | Behaviour                                        |
| ----------------------------------------- | ------------------------------------------------ |
| Section's owning module not installed     | Section filtered out of the panel                |
| Unknown domain (no registered component)  | Generic fallback renders a title                 |
| Orchestrator returns malformed `sections` | Treated as a failed query — no results rendered  |
| `totalCount` exceeds displayed page       | "Show more" appends the remaining capped results |
| Empty + focused input                     | Recent searches shown                            |

## Acceptance criteria

Search bar (folded from us-01):

- [x] Top-bar search input with `Cmd+K` / `Ctrl+K` focus shortcut, focus
      management, and a debounce before the orchestrator query fires.

Results panel (folded from us-02):

- [x] A dropdown panel renders domain sections with the context section first
      and visually distinct, and closes on outside click / Escape.

Result-component registry (folded from us-02b):

- [x] `registerResultComponent(domain, component)` / `getResultComponent(domain)`
      with a generic title-only fallback for unknown domains.
- [x] Each pillar registers its component at load time.
- [x] The panel renders each section's hits through the looked-up component.
- [x] "Show more" appears when `totalCount` exceeds the page and appends
      results.

Result navigation (folded from us-03):

- [x] Clicking a result resolves its POPS URI to a route and navigates;
      unresolvable URIs are a no-op.

Recent searches (folded from us-04):

- [x] Up to 10 recent queries persisted in `localStorage`, deduped,
      most-recent-first.
- [x] Recents show when the input is focused and empty.
- [x] Clicking a recent populates the input and triggers the search.
- [x] Recents hide once the user starts typing.
- [x] "Clear recent" removes the history.

Keyboard navigation (folded from us-05):

- [x] Arrow keys move the selection across sections, Enter selects the
      highlighted result, Escape closes the panel.
