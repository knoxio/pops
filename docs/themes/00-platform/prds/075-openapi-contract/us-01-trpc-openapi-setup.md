# US-01: trpc-openapi Setup

> PRD: [OpenAPI Secondary Contract](README.md)
> Status: Done

## Description

As a backend developer, I serve an auto-generated OpenAPI spec and Swagger UI from the existing Express server so that external consumers can discover and use the API.

## Acceptance Criteria

- [x] `trpc-openapi` installed and configured in pops-api
- [x] Express middleware serves REST endpoints at `/api/v1/*` for annotated procedures
- [x] `GET /api/openapi.json` returns the generated OpenAPI 3.1 spec
- [x] `GET /api/docs` serves Swagger UI loaded with the generated spec
- [x] OpenAPI middleware is mounted after auth middleware — REST endpoints require the same authentication as tRPC
- [x] A smoke-test annotated procedure (e.g., `core.settings.list`) is callable via `curl` at its REST path
- [x] Existing tRPC endpoints are unaffected — React frontend works identically

## Notes

Mount order in Express: auth middleware → OpenAPI REST handler → tRPC handler. The OpenAPI handler intercepts matching REST paths; unmatched requests fall through to tRPC.
