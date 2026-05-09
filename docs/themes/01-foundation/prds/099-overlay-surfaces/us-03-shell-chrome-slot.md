# US-03: Shell chrome slot

> PRD: [Overlay Surfaces](README.md)
> Status: In progress

## Description

As a shell author, I want a named **chrome slot** that overlay modules mount into so that the same wiring pattern works for any future overlay (e.g. graduated `search`).

## Acceptance Criteria

- [ ] The shell exposes the `'assistant'` chrome slot via the layout (currently rendered statically in `ChatOverlay.tsx` / `ChatFab.tsx`).
- [ ] Overlay modules declare which slot they mount into via `frontend.overlay.chromeSlot`.
- [ ] Two overlay manifests cannot declare the same slot — collisions error at boot once the loader (PRD-100) lands.
- [ ] A second overlay (real or hypothetical) can be added by declaring a new slot without changing existing wiring.

## Notes

- Manifest-driven mounting (read manifests, render overlays into slots) lands with PRD-100. PRD-099 only formalises the slot naming and locks the `assistant` slot to the ego overlay.
- The shell's `chrome slot` is currently a convention, not a runtime registry. Tighten when a second overlay materialises.
