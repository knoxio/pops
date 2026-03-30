# US-06: Eliminate inline styles and JS/TS colour constants

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Not started

## Description

As a developer, I want all inline `style={{}}` hardcoded values and JS/TS colour constants replaced with Tailwind classes or exported design token objects so that the design system is the single source of truth for all visual values.

## Acceptance Criteria

- [ ] UI primitive focus borders (`rgb(55, 65, 81)` in TextInput, DateTimeInput, NumberInput, Select, ChipInput) replaced with `border-border` or a CSS variable — no inline `style={{ boxShadow: "..." }}` with hardcoded RGB
- [ ] Inline `style={{ outline: "none", boxShadow: "none" }}` replaced with Tailwind `outline-none shadow-none`
- [ ] Hardcoded `paddingLeft` for tree indentation replaced with a CSS custom property (`--tree-indent`) or Tailwind `pl-` class where possible
- [ ] `style={{ paddingLeft: "8px" }}` replaced with `pl-2`
- [ ] ConnectionGraph hex colour constants (`#6366f1`, `#f59e0b`, `#10b981`, etc.) extracted to a `GRAPH_COLORS` design token object exported from `@pops/ui/theme`
- [ ] Canvas rendering code references the token object, not hardcoded hex strings
- [ ] Dynamic progress bar widths (`style={{ width: \`${percent}%\` }}`) are acceptable — document as permitted pattern
- [ ] `grep` for `style={{` in non-Storybook component files returns only permitted dynamic patterns (progress bars, canvas dimensions)

## Notes

Three distinct sub-problems:
1. **UI primitives** (5 files): `rgb(55, 65, 81)` focus border — high priority since it affects all apps
2. **Tree indentation** (LocationPicker, ConnectionTracePanel, LocationTreePage): dynamic padding based on depth — use CSS custom property `--tree-indent-size` multiplied by depth
3. **Canvas colours** (ConnectionGraph): hex strings for node/edge rendering — extract to a typed constant object

Dynamic percentage widths for progress bars are a legitimate pattern — CSS can't compute runtime percentages from JS variables without inline styles. Document this as the permitted exception.
