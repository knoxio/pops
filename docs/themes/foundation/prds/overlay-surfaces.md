# Overlay Surfaces + Ego Dual-Surface

> Theme: [Foundation](../README.md)
> Status: Done

## Overview

Modules expose one or more **surfaces** to the shell. Beyond the page-routed `app` surface, a module may declare an `overlay` surface: a floating panel summoned from any page by a shortcut or icon, mounted into a named shell chrome slot. The mount is driven entirely by the module manifest — the shell never hard-imports an overlay component.

Ego is the canonical dual-surface module: it keeps its `/cerebrum/chat` page **and** is summonable as a floating panel from any shell page. Both surfaces share conversation data through the same React Query keys over the cerebrum pillar's REST API, so a message sent on one surface appears on the other after the next refresh — no duplicate store.

## Surface Category

A module declares its surfaces on the manifest as `surfaces: readonly ModuleSurface[]` (`ModuleSurface = 'app' | 'overlay'`, in `@pops/types`). The array must be non-empty and every entry must be `'app'` or `'overlay'` — both checked at runtime by `assertSurfaces`.

| Surface   | Mounted as                                                                                   |
| --------- | -------------------------------------------------------------------------------------------- |
| `app`     | Page-routed module with its own navigation and `/path` routes. Filled via `frontend.routes`. |
| `overlay` | Floating panel rendered into a shell chrome slot; summoned by shortcut/icon; no `/path`.     |

A dual-surface module declares both. Ego's manifest (`libs/overlay-ego/src/manifest.ts`):

```
surfaces: ['overlay', 'app']
frontend.overlay = { chromeSlot: 'assistant', shortcut: 'mod+i', component: () => import('./EgoOverlay')… }
```

When `surfaces` includes `'overlay'`, the manifest must carry a `frontend.overlay` object; `assertFrontend` enforces this and validates that `chromeSlot` is a string, `shortcut` (when set) is a string, and `component` (when set) is a function.

## Mount Contract

The shell exposes named **chrome slots**. The known set is defined once in the shell (`KNOWN_CHROME_SLOTS = ['assistant', 'notification', 'command']`); `RootLayout` renders one `OverlayHost` per slot. Today only `assistant` is occupied — by the ego overlay.

The mount is manifest-driven and lazy:

1. The shell's overlay registry (`pillars/shell/src/app/overlays/registry.ts`) joins the build-time install set (`INSTALLED_MODULES` from `@pops/module-registry`, which re-evaluates `POPS_APPS`/`POPS_OVERLAYS` at load) with the live overlay manifests known to the shell build (`SHELL_OVERLAY_MANIFESTS`). It projects each into an `InstalledOverlay` (`{ moduleId, chromeSlot, shortcut, loader }`), dropping any whose manifest lacks a `frontend.overlay.component` loader.
2. `OverlayHost` buckets the installed overlays by slot. For its `slot` prop it wraps each overlay's `loader` in `React.lazy` and renders it inside a `Suspense` boundary. Because the component is reached only through the lazy loader — there is no eager re-export from the manifest — an uninstalled overlay never enters the shell bundle.
3. Each mount reads its open state from `useUIStore.overlays[moduleId]` and passes `{ open, onClose }` to the overlay component.

The overlay component contract is `OverlayComponentProps = { open: boolean; onClose: () => void }`. The shell owns open/close state; overlays stay agnostic of the persistence mechanism.

## State Model

### Open/close — generic overlay map

The shell's UI store (`pillars/shell/src/store/uiStore.ts`) holds a single `overlays: Record<string, boolean>` keyed by module id, with `toggleOverlay(moduleId)` and `setOverlayOpen(moduleId, open)`. There is no per-module flag — any registered overlay is driven through this one map. The FAB (`ChatFab` → `EgoFab`) and the `OverlayHost` mount both bind to `overlays['ego']`.

### Keyboard shortcuts — manifest-driven

`useOverlayShortcuts` (mounted once in `RootLayout`) compiles every installed overlay's `frontend.overlay.shortcut` into a `KeyboardEvent` predicate and installs one document-level listener that toggles the matching overlay. `compileShortcut` supports `mod` (Cmd on macOS, Ctrl elsewhere), `ctrl`, `meta`, `alt`/`option`, `shift`; the last `+`-segment is the key (case-insensitive). It **fails closed**: an unknown modifier token, a modifier in the key position, or an empty string yields a predicate that never matches, rather than silently binding the wrong key. More-specific bindings are not swallowed by less-specific ones (`mod+shift+i` does not trigger a `mod+i` binding).

### Conversation data — shared via REST + React Query

Conversation list and message history are sourced from the cerebrum pillar's REST API through the generated `ego-api` client (`@hey-api`, base URL `/cerebrum-api`). Both surfaces consume the same `useChatPageModel` hook, which reads from React Query keys:

- `['ego', 'conversations', 'list', body]` — `useConversationList`
- `['ego', 'conversations', 'get', { id }]` — `useConversationDetail`

React Query's per-key cache is the synchronisation layer. No Zustand or React Context "chat store" exists in the shell or in app-cerebrum. Sending uses the SSE endpoint `POST /api/ego/chat/stream` for token-by-token rendering (`useStreamingChat`); on the stream's `done` event the list and the affected conversation thread are invalidated, so a message sent from one surface is visible on the other on the next refresh.

The **selected conversation id** is local component state inside `useChatPageModel` (`useState<string | null>`). Each surface starts with its own `null` selection — data is shared, active selection is not.

## Package Layout

`libs/overlay-ego` (`@pops/overlay-ego`) owns all ego chat UI and the manifest. Exports from the package root:

| Export                                                  | Purpose                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `manifest`                                              | `ModuleManifest` with `surfaces: ['overlay', 'app']`          |
| `EGO_OVERLAY_CHROME_SLOT` / `EGO_OVERLAY_SHORTCUT`      | `'assistant'` / `'mod+i'` constants                           |
| `EgoOverlay`                                            | Floating panel (header + close + settings link + `ChatPanel`) |
| `EgoFab`                                                | FAB that toggles the overlay                                  |
| `ChatPanel`                                             | Embeddable chat panel (used by `/cerebrum/chat` too)          |
| `useChatPageModel`                                      | Hook driving `ChatPanel`; bound to ego REST queries           |
| `ChatMessage` / `ChatPageModel` / `ConversationSummary` | Chat-page types                                               |

Internal structure: `chat-components/` (`ChatPanel`, `ChatInput`, `MessageThread`, `ConversationList(Body|Item)`, `ContextIndicator`, `CitationLink`), `chat-hooks/` (`useChatPageModel`, `useChatMutations`, `useStreamingChat`, `useConversationDetail`, `useConversationList`, shared `types`), `ego-api/` (generated REST client), `EgoOverlay.tsx`, `EgoFab.tsx`, `manifest.ts`.

`@pops/app-cerebrum` keeps the `/cerebrum/chat` route (`ChatPage`) but sources `ChatPanel` and `useChatPageModel` from `@pops/overlay-ego`. `overlay-ego` is a leaf lib (`libs/overlay-ego`, depending on no pillar), so a pillar app consuming it is allowed under the `lib-no-pillar-import` boundary rule (libs facilitate pillars; the reverse — a lib importing a pillar or any `@pops/app-*` — is the forbidden direction).

## Shell Wiring

| Concern           | Where                                                      |
| ----------------- | ---------------------------------------------------------- |
| FAB               | `ChatFab.tsx` — binds `EgoFab` to `overlays['ego']`        |
| Overlay mount     | `overlays/OverlayHost.tsx` — one per slot, lazy + Suspense |
| Slot anchors      | `RootLayout.tsx` — `data-overlay-slot` div per known slot  |
| Shortcut listener | `overlays/useOverlayShortcuts.ts` — one global handler     |
| Install/registry  | `overlays/registry.ts` — manifests × install set           |

`ChatFab` renders only when ego is installed (`EGO_OVERLAY_INSTALLED` gate in `RootLayout`).

## Edge Cases

| Case                                     | Behaviour                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ego module not installed (env gate)      | `installedOverlays` excludes ego; the FAB is not rendered and `OverlayHost` mounts nothing. The `/cerebrum/chat` route is gated by the cerebrum app's own install. |
| Overlay open and user navigates          | The overlay stays mounted in chrome; conversation data persists because the React Query cache is keyed by `conversationId`, not route.                             |
| Unknown chrome slot in a manifest        | `OverlayHost` drops the overlay with a one-shot `console.warn`; the shell never crashes.                                                                           |
| Two overlays declare the same known slot | Both currently mount in that slot (last-writer wins visually via z-index). Boot-time collision rejection is **not** built — see idea.                              |
| Misconfigured shortcut string            | `compileShortcut` fails closed: a never-match predicate, so a bad binding does nothing rather than hijacking the wrong key.                                        |

## Acceptance Criteria

### Surface category + manifest

- [x] `ModuleSurface = 'app' | 'overlay'` and `surfaces: readonly ModuleSurface[]` exist on `ModuleManifest`.
- [x] `surfaces` is validated at runtime: non-empty, every entry `'app'`/`'overlay'`.
- [x] When `surfaces` includes `'overlay'`, `frontend.overlay` is required and `{ chromeSlot, shortcut?, component? }` are type-checked at runtime.
- [x] Ego declares `surfaces: ['overlay', 'app']` with `chromeSlot: 'assistant'`, `shortcut: 'mod+i'`, and a lazy `component` loader.

### `@pops/overlay-ego` package

- [x] `libs/overlay-ego` is a workspace package with `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/test-setup.ts`.
- [x] Exports `manifest`, `EgoOverlay`, `EgoFab`, `ChatPanel`, `useChatPageModel`, and the chat-page types from the root.
- [x] Owns `chat-components/` and `chat-hooks/`; `/cerebrum/chat` consumes `ChatPanel` + `useChatPageModel` from it.

### Floating panel

- [x] `EgoFab` and `EgoOverlay` live in `@pops/overlay-ego`; `EgoOverlay` renders `ChatPanel` driven by `useChatPageModel`.
- [x] The overlay closes on `Escape`, on backdrop click, and on the close button.
- [x] The overlay header shows "Ego", a settings link, and a close button — all ≥44×44px touch targets.
- [x] The shell binds open/toggle/close through `useUIStore.overlays[moduleId]` (no per-module flag).

### Chrome slot + manifest-driven mount

- [x] The shell exposes named chrome slots (`assistant`, `notification`, `command`); `RootLayout` renders one `OverlayHost` per slot.
- [x] Overlays declare their slot via `frontend.overlay.chromeSlot`; `OverlayHost` mounts an overlay only into its declared slot.
- [x] Mount is lazy via `React.lazy` over the manifest `component` loader, inside `Suspense`; uninstalled overlays never enter the shell bundle.
- [x] An overlay declaring an unknown slot is dropped with a console warning.
- [x] A second overlay can be added by declaring a slot + registering its manifest, with no change to existing wiring.

### Manifest-driven shortcuts

- [x] `useOverlayShortcuts` binds each overlay's manifest `shortcut` (`mod+i` for ego) through a single global listener that toggles the matching overlay.
- [x] `compileShortcut` supports `mod`/`ctrl`/`meta`/`alt`/`option`/`shift`, is case-insensitive on the key, and fails closed on malformed bindings.

### Shared state

- [x] Both surfaces consume `useChatPageModel`; conversation list and history come from the same React Query keys over the ego REST API.
- [x] No Zustand/Context chat store in the shell or app-cerebrum.
- [x] A message sent from one surface is visible on the other after invalidation on the SSE `done` event.
- [x] Active selection is intentionally per-surface (`selectedConversationId` local state); cross-surface selection sharing is out of scope.

### Settings link

- [x] The overlay header includes a `react-router` `Link` to `/settings/ego`.
- [x] The link is a ≥44×44px target with `aria-label="Open Ego settings"`.

## Out of Scope

- **Per-user shortcut rebinding** — the manifest default (`mod+i`) is the only binding; no settings UI to override it.
- **Cross-surface selection sharing** — active conversation is not shared across overlay/route (URL param or persisted preference).
- **Boot-time slot-collision rejection** — two overlays on the same known slot both mount today; a hard error at registry build is not implemented.
- Removing the `/cerebrum/chat` page (the dual-surface model retains the route).
- A separate `ego` i18n bundle (strings remain in the `cerebrum` namespace).

> Unbuilt follow-ups captured in [docs/ideas/overlay-surfaces.md](../../../ideas/overlay-surfaces.md).
