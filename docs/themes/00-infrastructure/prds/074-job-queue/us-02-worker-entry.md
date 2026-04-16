# US-02: Worker Entry Point

> PRD: [Job Queue Infrastructure](README.md)
> Status: Not started

## Description

As a platform operator, I run a separate worker process alongside the API server so that background jobs execute without blocking HTTP requests.

## Acceptance Criteria

- [ ] `src/worker.ts` is a standalone entry point that connects to Redis, registers handlers for all queues, and processes jobs
- [ ] Worker uses the same database module (`src/db.ts`) and environment config as the API server
- [ ] Each queue has a handler file: `src/jobs/handlers/<queue-name>.ts` exporting a `process` function
- [ ] Handler dispatch uses the `type` discriminator from job data to route to the correct function
- [ ] Worker logs job start, completion, and failure via Pino (same logger config as API)
- [ ] Graceful shutdown: on SIGTERM/SIGINT, worker stops accepting new jobs, waits for active jobs to complete (30s timeout), then exits
- [ ] Docker Compose defines a `pops-worker` service using the same image as `pops-api` with `command: node dist/worker.js`
- [ ] Worker service is on `pops-backend` network, depends on Redis and inherits the same environment/secrets as pops-api
- [ ] Ansible template updated to include the worker service

## Notes

The worker shares the pops-api Docker image to avoid building a separate image. Only the entrypoint command differs. This keeps CI and deployment simple.
