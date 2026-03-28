# US-02: Build custom Docker images

> PRD: [013 — Docker Runtime](README.md)
> Status: Partial

## Description

As an operator, I want Dockerfiles for pops-api and pops-shell so that they can be built and deployed as container images.

## Acceptance Criteria

- [x] `apps/pops-api/Dockerfile` with multi-stage build (install → build → production)
- [ ] `apps/pops-shell/Dockerfile` with multi-stage build (install → build → nginx serve) — **file does not exist; docker-compose.yml references it but it is missing**
- [x] pops-api image runs Node.js server on port 3000
- [ ] pops-shell image serves static files via nginx on port 80 — **no Dockerfile to build from**
- [ ] Images are minimal (no dev dependencies, no source maps in production) — **cannot verify pops-shell**
- [ ] `docker compose build` builds both images successfully — **fails for pops-shell**

## Notes

pops-shell is a static build served by nginx. pops-api is a Node.js runtime. Both use multi-stage builds to keep production images small.
