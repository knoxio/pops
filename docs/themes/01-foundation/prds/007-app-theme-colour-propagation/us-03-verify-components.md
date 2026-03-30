# US-03: Verify component rendering across all app colours

> PRD: [007 — App Theme Colour Propagation](README.md)
> Status: Done

## Description

As a developer, I want confirmation that all components using app-accent tokens render correctly with every app colour so that there are no visual issues in any app context.

## Acceptance Criteria

- [x] Visit every page in Finance — all accent elements render in emerald
- [x] Visit every page in Media — all accent elements render in indigo
- [x] Visit every page in Inventory — all accent elements render in amber
- [x] Visit every page in AI — all accent elements render in violet
- [x] No component references hardcoded colour classes (verified by PRD-002 US-04)
- [x] Contrast ratios are acceptable for all colour/mode combinations (accent on background, foreground on accent)
- [x] Storybook colour picker (PRD-004 US-02) shows correct rendering for each colour option

## Notes

This is a visual verification sweep, not a code change. If any component looks wrong with a particular accent colour (e.g., poor contrast), fix the token definitions in PRD-002 or the component in PRD-003. Blocked by US-01 — cannot verify CSS variable propagation until the propagation mechanism exists.
