# US-07: Overlay mounting from the registry

> PRD: [Plugin Contract](README.md)
> Status: Not started

## Description

As a platform engineer, I want the shell to mount overlays into chrome slots declared in manifests so that adding a new overlay (or replacing ego) doesn't require editing `RootLayout`.

## Acceptance Criteria

- [ ] `RootLayout` no longer imports any overlay component directly. `<ChatOverlay />` is removed from the layout.
- [ ] `RootLayout` exposes named chrome slots (e.g. `assistant`, `notification`, `command`) and renders the overlay component declared by each installed module whose `frontend.overlay.chromeSlot` matches a known slot.
- [ ] Each module's `frontend.overlay` declaration includes a lazy component reference (e.g. `component: () => import('./Overlay').then(m => m.Overlay)`); shell `Suspense`-wraps the mount.
- [ ] Overlay shortcuts (`frontend.overlay.shortcut`) are bound centrally in the shell from the registry; per-module shortcut wiring is removed.
- [ ] Unknown `chromeSlot` values produce a build-time warning from the registry generator (not a hard error — slot names are conventional, not enumerable from the type system).
- [ ] PRD-099 acceptance criteria (ego is dual-surface: `/cerebrum/chat` page + floating panel) remain satisfied — only the mounting mechanism changes.
- [ ] When `POPS_OVERLAYS` excludes `ego`, no overlay component is loaded by the shell and no `<ChatOverlay />` markup appears in the DOM.

## Notes

- `chromeSlot` is a free-form string today; if the catalogue stabilises, promote to a string-literal union in a follow-up.
- The overlay component is loaded lazily so absent overlays don't bloat the shell bundle.
