# US-01: Mobile shell layout

> PRD: [010 — Responsive Foundation](README.md)
> Status: To Review

## Description

As a user on iPhone, I want the shell layout to be usable on my screen so that I can navigate POPS without horizontal scrolling.

## Acceptance Criteria

- [ ] TopBar compact on mobile — hide less critical elements, keep theme toggle and nav trigger
- [ ] App switcher has a mobile pattern (bottom tab bar or hamburger menu)
- [ ] Content area full-width with `px-4` padding
- [ ] No horizontal overflow at 375px viewport
- [ ] Fixed shell chrome (TopBar, nav) remains fixed on scroll on mobile
- [ ] Verified on 375px, 390px, 428px in Chrome DevTools

## Notes

The mobile nav pattern (bottom tab bar vs hamburger) should feel native on iOS. Decide during implementation — whichever is simpler and more natural.
