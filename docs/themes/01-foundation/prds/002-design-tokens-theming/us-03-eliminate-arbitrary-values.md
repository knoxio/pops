# US-03: Eliminate arbitrary Tailwind values

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Partial

## Description

As a developer, I want all arbitrary Tailwind values replaced with token-based classes so that the design system is consistent and enforceable.

## Acceptance Criteria

- [ ] All `w-[Npx]`, `h-[Npx]`, `min-w-[Npx]`, `max-h-[Npx]` replaced with Tailwind scale values
- [ ] All centering hacks (`top-[50%]`, `translate-x-[-50%]`) replaced with built-in utilities
- [ ] Arbitrary padding/margin (`p-[3px]`, `bottom-[-5px]`) replaced with closest token or custom token added to `@theme`
- [x] Radix CSS variable bindings (`w-[var(--radix-*)]`) documented as permitted exception and left in place
- [ ] `grep` for arbitrary value patterns returns only permitted Radix exceptions
- [ ] No visual regressions — components render identically before and after

## Notes

Specific replacements from the audit:
- `min-w-[120px]` → `min-w-30`
- `w-[180px]` → `w-45`, `min-w-[200px]` → `min-w-50`, `w-[150px]` → `w-38`, `w-[100px]` → `w-25`
- `w-[70px]` → `w-18`
- `min-h-[2rem]` → `min-h-8`
- `max-h-[300px]` → `max-h-75`

If a value doesn't have a close Tailwind equivalent, add a custom token to `@theme` — don't approximate.

Remaining arbitrary values (as of audit): `packages/ui/src/primitives/` still contains `bottom-[-5px]` (tabs.tsx), `translate-y-[calc(-50%_-_2px)]` and `rounded-[2px]` (tooltip.tsx), `min-w-[44px]` and `min-h-[44px]` (dialog.tsx — accessibility touch targets).
