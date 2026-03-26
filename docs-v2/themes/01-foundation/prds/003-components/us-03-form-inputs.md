# US-03: Build composite form inputs

> PRD: [003 — Components](README.md)
> Status: Done

## Description

As a developer, I want a complete set of form input components in `@pops/ui` so that any app can build forms with consistent styling, validation patterns, and accessibility.

## Acceptance Criteria

- [x] TextInput — text field with label, error state, helper text
- [x] NumberInput — numeric input with increment/decrement, min/max
- [x] DateTimeInput — date and optional time picker
- [x] CheckboxInput — checkbox with label
- [x] RadioInput — radio group with options
- [x] ChipInput — tag/chip entry with add/remove
- [x] Autocomplete — text input with dropdown suggestions, async loading
- [x] ComboboxSelect — searchable dropdown selection
- [x] Each component has co-located `.stories.tsx`
- [x] All exported from barrel `index.ts`
- [x] All use design tokens — no arbitrary values or hardcoded colours
- [x] All meet 44x44px touch target minimum
- [x] All work in light and dark mode
- [x] Form inputs stack vertically on mobile viewports

## Notes

Form inputs are the most-used composites. Each wraps one or more primitives (Input, Select, Checkbox, etc.) with consistent label placement, error display, and spacing patterns.
