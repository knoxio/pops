# @pops/finance-contract changelog

All notable changes to the finance pillar's public contract surface land here.

Format: each entry lists the contract version, then the user-facing
classification (`patch` / `minor` / `major`), then bullets. Major
versions MUST include a non-empty `### Migration from X.Y to N.0`
section per PRD-154.

## 0.1.0 — minor

Initial baseline.

- Establish `WishListItem` entity and `WishListItemSchema` (`@pops/finance-contract` public surface).
- Establish `FinanceError`, `FinanceDomainError`, `ContractStatus` envelopes.
- First OpenAPI snapshot at `openapi/finance.openapi.json`.
- First `.api.json` + `.zod.json` snapshots committed to `etc/` (PRD-154 baseline).
