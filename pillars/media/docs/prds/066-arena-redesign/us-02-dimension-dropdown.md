# US-02: Dimension dropdown

> PRD: [066 — Arena Redesign](README.md)
> Status: Done

## Description

As a user, I want to switch comparison dimensions via a compact dropdown so that the selector takes minimal space and doesn't compete with the poster cards for attention.

## Acceptance Criteria

- [x] Active dimension shown in a `<Select>` component with `variant="ghost"`, `size="sm"`, `containerClassName="w-auto"`
- [x] All active dimensions appear as `<option>` elements
- [x] Selected value reflects the dimension chosen by `getSmartPair` (or manual override)
- [x] Changing selection sets `manualDimensionId`, clears `scoreDelta`, invalidates pair cache
- [x] After a comparison is recorded, `manualDimensionId` resets to null so backend auto-selects next dimension
- [x] `aria-label="Comparison dimension"` for accessibility
- [x] Loading state: single `<Skeleton>` placeholder (`h-11 w-48`)
- [x] When no active dimensions exist: "No dimensions configured yet." text

## Notes

The dimension is auto-selected by the backend via `getSmartPair` response. The dropdown shows the backend's choice but lets the user override. The override is one-shot — it resets after the comparison is recorded.
