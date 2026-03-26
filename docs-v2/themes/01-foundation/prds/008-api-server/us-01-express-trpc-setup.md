# US-01: Set up Express + tRPC server

> PRD: [008 — API Server](README.md)
> Status: Done

## Description

As a developer, I want an Express server with tRPC adapter and a health endpoint so that the API foundation exists for all domain modules to build on.

## Acceptance Criteria

- [x] `apps/pops-api/src/app.ts` creates Express app
- [x] `apps/pops-api/src/server.ts` starts HTTP server on configured port (default 3000)
- [x] tRPC adapter mounted on Express (`/trpc` path)
- [x] `/health` Express route returns `{ status: "ok" }` without auth
- [x] `pnpm dev:api` / `mise dev:api` starts the server with watch mode
- [x] Server connects to SQLite database on startup

## Notes

The tRPC adapter bridges Express and tRPC — tRPC handles the procedure routing, Express handles everything else (webhooks, static files, health checks).
