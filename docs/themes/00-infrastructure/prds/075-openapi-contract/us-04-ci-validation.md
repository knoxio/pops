# US-04: CI Validation

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Done

## Description

As a developer, I get a CI failure when an OpenAPI annotation is incomplete or the generated spec is invalid so that the API contract stays consistent.

## Acceptance Criteria

- [ ] CI workflow step validates the spec against the OpenAPI 3.1 schema (e.g., via `@apidevtools/swagger-parser`) — current script checks non-empty paths + required summaries only
- [x] Validation fails if an annotated procedure is missing `summary` or `path`
- [ ] Validation fails if two procedures share the same method+path combination (not reliably detectable post-generation; enforce at router definition time)
- [x] Validation runs as part of the existing `api-quality.yml` workflow
- [x] Validation is also runnable locally via `mise openapi:validate`

## Notes

The validation script starts the API in a test mode, extracts the spec from `/api/openapi.json`, and runs it through the validator. No actual HTTP server needs to be running for spec generation — trpc-openapi can generate the spec from the router definition alone.
