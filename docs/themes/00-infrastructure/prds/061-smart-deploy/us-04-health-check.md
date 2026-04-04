# US-04: Post-deploy health check with fallback

> PRD: [061 — Smart Deploy Pipeline](README.md)
> Status: Done

## Description

As a developer, I want the deploy pipeline to verify services are healthy after a selective restart and fall back to a full deploy if something is broken.

## Acceptance Criteria

- [x] After selective restart, wait 10 seconds for services to stabilise
- [x] Check pops-api health: `docker exec pops-api wget -qO- http://localhost:3000/health`
- [x] Check pops-shell health: `docker exec pops-shell wget -qO- http://localhost:80` (or curl equivalent)
- [x] Only check the service(s) that were restarted (not all services)
- [x] If health check fails, log the failure and trigger a full Ansible deploy as recovery
- [x] If full deploy also fails, the workflow fails (no infinite retry)
- [x] Health check results logged: "pops-api: healthy" / "pops-shell: healthy"
- [x] On failure, show last 50 lines of the failed container's logs for debugging
