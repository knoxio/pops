# US-03: Eliminate arbitrary Tailwind values

> PRD: [002 — Design Tokens & Theming](README.md)
> Status: Done (`packages/ui/src` clean of arbitrary fixed-px / fixed-rem / fixed-% values; remaining arbitrary values are Radix bindings or runtime `calc()`/viewport expressions that resist tokenisation)

## Description

As a developer, I want all arbitrary Tailwind values replaced with token-based classes so that the design system is consistent and enforceable.

## Acceptance Criteria

- [x] All `w-[Npx]`, `h-[Npx]`, `min-w-[Npx]`, `max-h-[Npx]` replaced with Tailwind scale values or theme tokens — all files listed in issue #1783 are clean
- [x] All centering hacks (`top-[50%]`, `translate-x-[-50%]`) replaced with built-in utilities
- [x] Arbitrary padding/margin (`p-[3px]`, `bottom-[-5px]`) replaced with closest token or custom token added to `@theme`
- [x] Radix CSS variable bindings (`w-[var(--radix-*)]`) documented as permitted exception and left in place
- [x] `grep` for arbitrary value patterns inside `packages/ui/src/**/*.{ts,tsx}` (excluding `*.stories.tsx` / `*.test.*`) returns only permitted exceptions: Radix CSS variable bindings, and `calc()` / viewport-unit expressions used by responsive layout primitives (alert-dialog, switch, tabs, ImageGallery, DataTableFilters)
- [x] No visual regressions — components render identically before and after

## Notes

Specific replacements from the audit:

- `min-w-[120px]` → `min-w-30`
- `w-[180px]` → `w-45`, `min-w-[200px]` → `min-w-50`, `w-[150px]` → `w-38`, `w-[100px]` → `w-25`
- `w-[70px]` → `w-18`
- `min-h-[2rem]` → `min-h-8`
- `max-h-[300px]` → `max-h-75`

If a value doesn't have a close Tailwind equivalent, add a custom token to `@theme` — don't approximate.

Remaining arbitrary values (as of cleanup): `packages/ui/src/primitives/tabs.tsx` `h-[calc(100%-1px)]`, `alert-dialog.tsx` `max-w-[calc(100%-2rem)]`, `switch.tsx` `translate-x-[calc(100%-2px)]`, `ImageGallery.tsx` `max-h-[calc(100vh-6rem)]`, `DataTableFilters.tsx` `max-h-[85vh]`. These are runtime/viewport calculations rather than design-token approximations and are intentionally left as-is. The 44px touch targets in `dialog.tsx` and the `2px` radius/`-5px` tab offset have been migrated to `min-w-11`/`min-h-11`, `rounded-xs` (token), and the shared `--tooltip-arrow-offset` token respectively.
