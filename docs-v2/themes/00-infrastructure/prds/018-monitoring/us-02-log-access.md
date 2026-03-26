# US-02: Centralised log access

> PRD: [018 — Monitoring](README.md)
> Status: Done

## Description

As an operator, I want easy access to service logs so that I can diagnose issues without SSH-ing into individual containers.

## Acceptance Criteria

- [x] `docker compose logs` shows combined output from all services
- [x] `docker compose logs <service>` shows individual service output
- [x] `mise docker:logs` task available for quick access
- [x] Log output includes timestamps and service name prefix
- [x] Logs persist across container restarts (Docker default logging driver)

## Notes

No log aggregation stack needed for a single-user system. Docker's built-in logging is sufficient. If log volume becomes an issue, configure log rotation via Docker daemon.
