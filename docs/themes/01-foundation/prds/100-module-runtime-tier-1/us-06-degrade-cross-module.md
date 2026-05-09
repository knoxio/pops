# US-06: Cross-module degradation (deferred)

> PRD: [Module Runtime — Tier 1](README.md)
> Status: Not started

## Description

As a user with a partial install, I want universal search and the URI resolver to tolerate missing modules so that one absent module doesn't break the rest of the platform.

## Acceptance Criteria

- [ ] Universal search excludes adapters owned by absent modules (no error, no toast spam).
- [ ] The URI resolver ([ADR-012](../../../../architecture/adr-012-universal-object-uri.md)) returns a "not installed" placeholder card when a URI references an absent module, instead of throwing.
- [ ] Cross-module navigation (e.g. a finance transaction's "linked inventory item" tile) hides itself when the target module is absent.

## Notes

- Tracked as a gap issue. Tier 1 lands the env contract and the route gate; cross-module degradation lands when there's a real partial-install driver.
- Search adapter registration is a side-effect import inside each module's backend `index.ts` — under POPS_APPS gating, the absent module's `index.ts` still loads (only procedures are gated), so the adapter registration still happens. The gap is on the frontend rendering side.
