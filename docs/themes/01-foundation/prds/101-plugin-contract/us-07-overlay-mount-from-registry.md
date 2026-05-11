# US-07: Overlay mounting from the registry

> PRD: [Plugin Contract](README.md)
> Status: Done

## Description

As a platform engineer, I want the shell to mount overlays into chrome slots declared in manifests so that adding a new overlay (or replacing ego) doesn't require editing the shell's layout.

## Acceptance Criteria

- [x] The shell layout does not directly instantiate any overlay component; overlay surfaces are produced exclusively from manifests in the module registry.
- [x] The shell exposes a fixed set of named chrome slots (assistant, notification, command). For each installed module that declares an overlay surface, the overlay is mounted into the slot named in its manifest.
- [x] Slot declarations actually drive placement: an overlay declaring slot A does not render in slot B.
- [x] Overlay components are loaded lazily so an absent overlay contributes nothing to the shell bundle. The shell suspends overlay mounts until their code arrives.
- [x] Keyboard shortcuts declared on overlay manifests are bound centrally by the shell from the registry; individual overlay packages do not install their own shortcut listeners.
- [x] Shortcut parsing fails closed: unknown modifier tokens reject the entire binding rather than degrading to a partial match.
- [x] An overlay declaring an unknown chrome slot produces a warning at registry generation time and is silently skipped at mount time. Unknown slot names never crash the shell.
- [x] Existing dual-surface ego behaviour (chat page route + floating panel) continues to work via the registry-driven mount path.
- [x] When the install set excludes ego (e.g. via the install-narrowing env contract), no overlay markup appears in the DOM and the overlay bundle is not loaded.

## Notes

- `chromeSlot` is an identifier for a named UI region; the allowed values are defined by the shell's slot catalogue.
- Overlay components are loaded lazily so absent overlays don't contribute to the shell bundle.
