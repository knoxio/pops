# US-04: Manifest assertion test

> PRD: [Module Manifest](README.md)

## Description

As a maintainer, I want a single test per surface (frontend + backend) that imports every shipped manifest and asserts its shape so that future modules cannot ship with a malformed manifest.

## Acceptance Criteria

- [ ] A backend test (`apps/pops-api/src/modules/manifests.test.ts`) imports each backend module's `manifest` and runs `assertModuleManifest` on it; tests pass.
- [ ] A frontend test (`apps/pops-shell/src/tests/manifests.test.ts`) imports each frontend app's `manifest` and runs `assertModuleManifest` on it; tests pass.
- [ ] Both tests assert that manifest `id`s are unique within their surface.
- [ ] Both tests assert that each manifest's `id` matches the module's expected slug (the test's own label).
- [ ] Tests fail loudly if a future module ships without a manifest export (the import itself fails) or with an invalid one.

## Notes

- Use `it.each` so a missing manifest fails on the specific module's row, not as one opaque suite failure.
- Frontend manifests check `frontend.routes`; backend manifests check `backend.router`.
