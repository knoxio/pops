# US-02: Build custom Docker images

> PRD: [013 — Docker Runtime](README.md)
> Status: To Review

## Description

As an operator, I want Dockerfiles for pops-api and pops-shell so that they can be built and deployed as container images.

## Acceptance Criteria

- [ ] `apps/pops-api/Dockerfile` with multi-stage build (install → build → production)
- [ ] `apps/pops-shell/Dockerfile` with multi-stage build (install → build → nginx serve)
- [ ] pops-api image runs Node.js server on port 3000
- [ ] pops-shell image serves static files via nginx on port 80
- [ ] Images are minimal (no dev dependencies, no source maps in production)
- [ ] `docker compose build` builds both images successfully

## Notes

pops-shell is a static build served by nginx. pops-api is a Node.js runtime. Both use multi-stage builds to keep production images small.
