# Overlay Surfaces — follow-ups

Unbuilt extensions to the shipped overlay-surface model (see [PRD: Overlay Surfaces](../themes/foundation/prds/overlay-surfaces/README.md)). The core surface category, manifest-driven mount, generic overlay state map, manifest shortcuts, and the ego dual-surface are all built. These are the deferred pieces.

## Per-user shortcut rebinding

Today the only summon shortcut is the manifest default (`mod+i` for ego), compiled by `useOverlayShortcuts`. Operators cannot rebind it.

- Surface a settings UI (under unified settings) to override an overlay's manifest `shortcut` per user.
- Resolution order: user override → manifest default. The compiler (`compileShortcut`) and listener already exist; only the source of the shortcut string changes.
- Validate overrides through the same fail-closed parser so a bad rebind disables the shortcut rather than hijacking a key.

## Cross-surface selection sharing

`selectedConversationId` is local component state in `useChatPageModel`, recreated per surface. Data is shared (React Query cache), but the active conversation is not — opening the overlay after picking a conversation on `/cerebrum/chat` starts at `null`.

- Promote selection to a shared source: a URL param on the route surface, or a persisted preference the overlay reads on open.
- Keep the "shared data, independent selection" model as the default; sharing is opt-in so each surface can still diverge.

## Boot-time slot-collision rejection

`OverlayHost` warns on **unknown** slots but does not reject two overlays declaring the same **known** slot — both mount and overlap. With one overlay today this is latent.

- When a second overlay materialises, make the registry build (`selectInstalledOverlays` / `buildSlotMounts`) error when two installed manifests claim the same slot, so misconfiguration fails loud at boot instead of stacking silently.
- Alternatively, define slots that legitimately hold a stack (e.g. `notification`) and reject collisions only on singleton slots.

## Graduating `search` to an overlay

The overlay model was designed to generalise. A natural second consumer is a command/search overlay mounting into the `command` (or a dedicated) slot, proving the pattern with a non-ego module and exercising multi-overlay shortcut routing and slot placement.
