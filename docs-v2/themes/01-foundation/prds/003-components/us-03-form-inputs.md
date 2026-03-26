# US-03: Build composite form inputs

> PRD: [003 — Components](README.md)
> Status: To Review

## Description

As a developer, I want a complete set of form input components in `@pops/ui` so that any app can build forms with consistent styling, validation patterns, and accessibility.

## Acceptance Criteria

- [ ] TextInput — text field with label, error state, helper text
- [ ] NumberInput — numeric input with increment/decrement, min/max
- [ ] DateTimeInput — date and optional time picker
- [ ] CheckboxInput — checkbox with label
- [ ] RadioInput — radio group with options
- [ ] ChipInput — tag/chip entry with add/remove
- [ ] Autocomplete — text input with dropdown suggestions, async loading
- [ ] ComboboxSelect — searchable dropdown selection
- [ ] Each component has co-located `.stories.tsx`
- [ ] All exported from barrel `index.ts`
- [ ] All use design tokens — no arbitrary values or hardcoded colours
- [ ] All meet 44x44px touch target minimum
- [ ] All work in light and dark mode
- [ ] Form inputs stack vertically on mobile viewports

## Notes

Form inputs are the most-used composites. Each wraps one or more primitives (Input, Select, Checkbox, etc.) with consistent label placement, error display, and spacing patterns.
