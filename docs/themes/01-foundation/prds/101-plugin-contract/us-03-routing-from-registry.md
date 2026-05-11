# US-03: Routing and API composition from the registry

> PRD: [Plugin Contract](README.md)
> Status: Done

## Description

As a platform engineer, I want the shell's route table and the API's root tRPC router composed from `MODULES` so that adding or removing a module requires no edit in the shell or root router.

## Acceptance Criteria

- [x] The shell mounts UI routes only for modules whose manifest declares an `app` surface and is in the build's install set. Adding or removing a module from the install set changes the live route table accordingly with no edit elsewhere in the shell.
- [x] Direct navigation to a URL whose leading segment names a buildable-but-uninstalled module renders a "module not installed" response. URLs whose leading segment names no buildable module render a generic 404.
- [x] The API's root tRPC router exposes procedures only for modules whose manifest declares a backend router and is in the build's install set; `core` is always exposed. The inferred client type of the root router narrows to the installed set, so client code referencing an absent module fails at type-check.
- [x] The procedure-path middleware introduced in PRD-100 continues to reject calls targeting known-but-uninstalled modules as defence-in-depth, but is no longer the primary gating mechanism — absent modules' procedures are not present in the root router at all.
- [x] The shell manifest endpoint reports `{ apps, overlays }` matching the install set; the public OpenAPI shape is unchanged across install sets.
- [x] E2E tests covering representative install-set scenarios (e.g. finance-only, cerebrum-absent) pass against the composed shell and API.

## Notes

- Implementation-level mapping (file paths, function names, type-narrowing approach) is captured in the PR description and code comments, not in this story.
