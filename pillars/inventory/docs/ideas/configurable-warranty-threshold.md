# Idea: Configurable "expiring soon" warranty threshold

Today the `WarrantyBadge` (in `@pops/ui`) hardcodes a 90-day window for the
"Expires in X days" state. Make this threshold a user setting so the inventory
owner can decide how much lead time counts as "expiring soon".

- Add a setting (e.g. `warrantyExpiringSoonDays`, default `90`) to the
  inventory settings contract (`rest-settings.ts`).
- Thread the value into `getWarrantyStatus` / `WarrantyBadge` so the badge and
  any list views compute the same boundary.
- The detail page warranty badge and the Warranties list page should both honour
  the setting from a single source.

Forward-looking only — not built. Carved out of the original item-detail PRD,
where the 90-day window was noted as a candidate for future configurability.
