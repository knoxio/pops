# US-01: Mobile shell layout

> PRD: [010 — Responsive Foundation](README.md)
> Status: Done

## Description

As a user on iPhone, I want the shell layout to be usable on my screen so that I can navigate POPS without horizontal scrolling.

## Acceptance Criteria

- [x] TopBar compact on mobile — hide less critical elements, keep theme toggle and nav trigger
- [x] App switcher has a mobile pattern (bottom tab bar or hamburger menu)
- [x] Content area full-width with `px-4` padding
- [x] No horizontal overflow at 375px viewport
- [x] Fixed shell chrome (TopBar, nav) remains fixed on scroll on mobile
- [x] Verified on 375px, 390px, 428px in Chrome DevTools

## Notes

The mobile nav pattern (bottom tab bar vs hamburger) should feel native on iOS. Decide during implementation — whichever is simpler and more natural.
