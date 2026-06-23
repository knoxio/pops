# Contextual Intelligence

> Pillar: [@pops/shell](../../README.md)
> Status: Done

## Purpose

The shell tracks what the user is doing — active pillar, current page, the
entity being viewed, active filters — and exposes it as a consumable
`AppContext`. Search uses it to prioritise the current pillar's results; the AI
overlay uses it to scope prompts ("help me with _this_"); breadcrumbs enrich
labels with entity titles. The provider and hooks live in `@pops/navigation` so
the shell, every app pillar, and `@pops/ui` can read context without depending
on the shell (avoiding circular deps).

## Context shape

```ts
interface AppContext {
  app: PillarId | null; // active pillar, or null at root / unmatched
  page: string | null; // page id set by the active page, or null
  pageType: 'top-level' | 'drill-down';
  entity?: { uri: string; type: string; title: string }; // set on a drill-down
  filters?: Record<string, string>; // active list-page filters
}
```

`app` is the open `PillarId` — a registry-discovered pillar can be the active
surface even though it is not one of the built-in default routes. The default
context (no pillar matched, e.g. `/`) is `{ app: null, page: null, pageType:
'top-level' }` with `entity` and `filters` undefined.

## How it is set

- **App** — detected from the URL path by `AppContextProvider` (mounted in
  `RootLayout`), matching at a path-segment boundary so `/finances` does not
  match `/finance`. Updates on every navigation.
- **Page-level** — each page calls `useSetPageContext({ page, pageType, entity?,
filters? })` once in its body. The hook sets context on mount and clears it on
  unmount; the provider also resets page-level context on navigation, so stale
  context from the previous page never leaks.

## Consumer API

All exported from `@pops/navigation`:

| Hook                      | Returns                                              |
| ------------------------- | ---------------------------------------------------- |
| `useAppContext()`         | the full `AppContext`                                |
| `useCurrentApp()`         | the active pillar id, or null                        |
| `useCurrentEntity()`      | the entity when on a drill-down page, else null      |
| `useSetPageContext(opts)` | (setter) registers a page's context for its lifetime |

| Consumer    | Uses context to                              |
| ----------- | -------------------------------------------- |
| Search      | order result sections — current pillar first |
| AI overlay  | scope prompts to the current view            |
| Breadcrumbs | enrich labels with the entity title          |

## Business rules

- Context always reflects the current navigation state.
- Page-level context clears on navigation and on page unmount.
- Consumers own what they do with context — this provider only exposes it.
- Components that do not consume context do not re-render on context change.

## Edge cases

| Case                                         | Behaviour                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Root `/` or unmatched path                   | `app: null`, default context                                            |
| Path like `/finances`                        | Does not falsely match `/finance` (segment-boundary match)              |
| Navigate between pages                       | Previous page's entity/filters cleared before the new page sets its own |
| Registry-discovered (external) pillar active | `app` carries that pillar id even though it is not a built-in route     |

## Acceptance criteria

Context provider (folded from us-01):

- [x] `AppContextProvider` wraps the app in `RootLayout`'s tree.
- [x] The active pillar is detected from the URL path and updates on navigation.
- [x] `useAppContext()` returns the current context; the default (no match) is
      `{ app: null, page: null, pageType: 'top-level' }` with entity/filters
      undefined.
- [x] Components that do not consume context do not re-render on context change.

Page context hooks (folded from us-02):

- [x] `useSetPageContext({ page, pageType, entity?, filters? })` sets context on
      mount and clears it on unmount.
- [x] Drill-down pages set entity context; list pages set filter context.
- [x] Stale context from the previous page is cleared on navigation.

Consumer API (folded from us-03):

- [x] `useAppContext()`, `useCurrentApp()`, `useCurrentEntity()` exported from
      `@pops/navigation` with their TypeScript types.
- [x] Hooks work from any component (shell, app pillars, `@pops/ui`) without
      depending on the shell.
