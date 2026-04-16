# US-04: CI Validation

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Not started

## Description

As a developer, I get a CI failure when an OpenAPI annotation is incomplete or the generated spec is invalid so that the API contract stays consistent.

## Acceptance Criteria

- [ ] CI workflow step generates the OpenAPI spec and validates it against the OpenAPI 3.1 specification (e.g., via `@apidevtools/swagger-parser`)
- [ ] Validation fails if an annotated procedure is missing `summary` or `path`
- [ ] Validation fails if two procedures share the same method+path combination
- [ ] Validation runs as part of the existing `api-quality.yml` workflow
- [ ] Validation is also runnable locally via `mise openapi:validate`

## Notes

The validation script starts the API in a test mode, extracts the spec from `/api/openapi.json`, and runs it through the validator. No actual HTTP server needs to be running for spec generation — trpc-openapi can generate the spec from the router definition alone.
