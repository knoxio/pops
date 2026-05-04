# US-01: sqlite-vec Extension

> PRD: [Vector Storage](README.md)
> Status: Done

## Description

As a backend developer, I load the sqlite-vec extension at database startup so that the application can store and query vector embeddings alongside relational data.

## Acceptance Criteria

- [x] `sqlite-vec` npm package installed as a dependency in pops-api
- [x] `db.ts` loads the extension via `sqliteVec.load(db)` after opening the database connection
- [x] A startup check verifies the extension is loaded: `SELECT vec_version()` returns a version string
- [x] If the extension fails to load, the server starts but logs a clear error and marks vector features as unavailable
- [x] Extension loads successfully on macOS ARM (development) and Linux x86_64 (production Docker)
- [x] Dockerfile updated to `node:22-slim` (glibc) to ensure the native extension binary is available in the production image
- [ ] Integration test creates a vector virtual table, inserts vectors, and queries k-NN — all operations succeed

## Notes

The `sqlite-vec` npm package bundles prebuilt binaries for common platforms. If the Docker image uses Alpine, verify the musl-compatible binary is included or switch to a glibc-based Node image. The existing Dockerfile uses `node:22-alpine` — test this first, fall back to `node:22-slim` if the extension doesn't load.
