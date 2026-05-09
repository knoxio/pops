# PRD-099: Overlay Surfaces + Ego Dual-Surface

> Epic: [Modular Module Runtime](../../epics/10-modular-module-runtime.md)
> Status: In progress

## Overview

Formalise the **overlay** surface category and extract `packages/overlay-ego` as the first dual-surface module. Ego retains its `/cerebrum/chat` route AND becomes summonable from any shell page via a floating panel + keyboard shortcut. Both surfaces share conversation state through the existing tRPC `ego.*` queries — no duplicate stores.

## Surface Category

A module exposes one or more surfaces:

| Surface   | Mounted as                                                                                 |
| --------- | ------------------------------------------------------------------------------------------ |
| `app`     | Page-routed module with its own navigation and `/path` routes (existing).                  |
| `overlay` | Floating panel rendered into a shell chrome slot; summoned by a shortcut/icon; no `/path`. |

The set of surfaces is encoded as `surfaces: readonly ModuleSurface[]` on the manifest (PRD-098). A dual-surface module declares both, with the `app` route(s) and the `overlay` config both supplied.

## Mount Contract

The shell exposes named **chrome slots** (e.g. `'assistant'`). Overlay modules register the slot they mount into via `frontend.overlay.chromeSlot`. The runtime loader (PRD-100) reads each installed module's manifest and renders the overlay component into the matching slot. At PRD-099 time, the shell wires the ego overlay directly (`apps/pops-shell/src/app/layout/ChatOverlay.tsx`); the manifest-driven mount lands with PRD-100.

## Package Layout

`packages/overlay-ego/` becomes the home for all ego UI logic:

- `chat-components/` — `ChatPanel`, `ChatInput`, `MessageThread`, `ConversationList(Body|Item)`, `ContextIndicator`, `CitationLink`.
- `chat-hooks/` — `useChatPageModel`, `useChatMutations`, `useStreamingChat`, `useConversationDetail`, `useConversationList`, plus shared types.
- `EgoOverlay.tsx` — the floating panel component (header with close + settings link, embedded `ChatPanel`).
- `EgoFab.tsx` — the FAB component that toggles the overlay.
- `manifest.ts` — `ModuleManifest` with `surfaces: ['overlay', 'app']`.

`packages/app-cerebrum` keeps the `/cerebrum/chat` route but sources `ChatPanel` and `useChatPageModel` from `@pops/overlay-ego`. PRD-097's lint rule still passes — `app-cerebrum → @pops/overlay-ego` is allowed (the boundary forbids `app-* → app-*`, not `app-* → overlay-*`).

## Shared State

Conversation **data** lives in tRPC queries (`ego.conversations.list`, `ego.conversations.get`, `ego.chat`). React Query's per-key cache keeps the conversation list and message threads in sync across overlay and route without a duplicate Zustand store: both consume the same `useChatPageModel` hook which reads from those queries.

The **selected conversation id** is local component state inside `useChatPageModel`, so each surface starts with `null` selection independently. A new message sent from one surface is visible in the other on the next React Query refresh (the conversation list and the per-conversation message thread are both invalidated by `chat.useMutation.onSuccess`). Sharing the active selection across surfaces — via URL params or a persisted preference — is a follow-up; today the model is "shared data, independent selection".

## Settings Link

The overlay header includes a `<Link to="/settings/ego" />` button so users can jump to ego settings (PRD-093) without leaving the panel context.

## Edge Cases

| Case                                       | Behaviour                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Ego module not installed (POPS_APPS gate)  | The shell does not render the FAB or overlay; routes for `/cerebrum/chat` redirect to "not installed" (PRD-100).   |
| User has overlay open and navigates routes | Overlay stays mounted; conversation state persists because tRPC cache is keyed by `conversationId`, not by route.  |
| Keyboard shortcut conflict                 | Manifest declares the default (`mod+i`); operator can rebind via settings (out of scope for PRD-099).              |
| Multiple overlays per slot                 | Only one overlay can declare a given `chromeSlot`; the loader (PRD-100) errors at boot when two manifests collide. |

## User Stories

| #   | Story                                                               | Summary                                                                                          | Parallelisable |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------- |
| 01  | [us-01-overlay-package-scaffold](us-01-overlay-package-scaffold.md) | Create `packages/overlay-ego` with manifest declaring `surfaces: ['overlay', 'app']`             | Yes            |
| 02  | [us-02-floating-panel](us-02-floating-panel.md)                     | Summonable chat panel component + keyboard shortcut + top-bar entry                              | Blocked by 01  |
| 03  | [us-03-shell-chrome-slot](us-03-shell-chrome-slot.md)               | Shell renders registered overlays into a chrome slot (pattern shared with future search overlay) | Blocked by 02  |
| 04  | [us-04-state-sharing](us-04-state-sharing.md)                       | Overlay and `/cerebrum/chat` share conversation state via tRPC                                   | Blocked by 02  |
| 05  | [us-05-settings-link](us-05-settings-link.md)                       | `/settings/ego` reachable from overlay header                                                    | Blocked by 02  |

## Out of Scope

- Removing the `/cerebrum/chat` page (the dual-surface model retains the route).
- Migrating `search` to the overlay model (separate future PRD when search has its own driver).
- Tier 1 runtime loader (PRD-100) — manifest-driven mount lands there.
- A separate `ego` i18n bundle. Existing strings in the `cerebrum` namespace continue to work; ego namespace migration is a follow-up.
- Per-user shortcut rebinding.
