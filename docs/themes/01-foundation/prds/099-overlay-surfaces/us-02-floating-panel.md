# US-02: Summonable floating panel

> PRD: [Overlay Surfaces](README.md)
> Status: In progress

## Description

As a user, I want to summon ego from any shell page via a floating action button or keyboard shortcut so that I don't have to navigate to `/cerebrum/chat` every time.

## Acceptance Criteria

- [ ] `EgoFab` (visual + behaviour) lives in `@pops/overlay-ego`.
- [ ] `EgoOverlay` (the floating panel itself) lives in `@pops/overlay-ego` and renders `ChatPanel` driven by `useChatPageModel`.
- [ ] The overlay closes on `Escape`, on backdrop click, and on the close button.
- [ ] The overlay header shows the title "Ego", a settings link, and a close button — all 44×44px+ touch targets.
- [ ] The shell wires shell-side `useUIStore.chatOverlayOpen` state through to `EgoOverlay` and `EgoFab` (open/onClose/onToggle props).

## Notes

- Wiring lives in `apps/pops-shell/src/app/layout/ChatOverlay.tsx` and `ChatFab.tsx`. Both files become thin shell-state binders.
- Keyboard shortcut declared in the manifest (`mod+i`). Actual shell-level rebind support is out of scope.
