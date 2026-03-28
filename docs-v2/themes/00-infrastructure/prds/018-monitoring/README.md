# PRD-018: Monitoring

> Epic: [06 — Monitoring](../../epics/06-monitoring.md)
> Status: Done

## Overview

Set up monitoring so that service failures are detected without manual checking. Health checks catch container failures, logs are accessible, and critical failures surface.

## Business Rules

- Docker health checks on critical services (API, shell) — unhealthy containers restart automatically
- All service logs accessible via `docker compose logs`
- Critical failure detection: if the API or shell goes down, it should be noticeable
- No heavyweight monitoring stack (Prometheus, Grafana) — Docker health checks + log access is sufficient for a single-user system

## User Stories

| # | Story | Summary | Status | Parallelisable |
|---|-------|---------|--------|----------------|
| 01 | [us-01-health-checks](us-01-health-checks.md) | Docker health checks on API and shell, restart policies | Done | No (first) |
| 02 | [us-02-log-access](us-02-log-access.md) | Centralised log access via docker compose logs and mise tasks | Done | Yes |

## Verification

- `docker compose ps` shows health status for API and shell
- Killing the API process triggers automatic container restart
- `mise docker:logs` shows combined service logs
- Service restarts are visible in logs

## Out of Scope

- APM or distributed tracing
- Metrics dashboards (Prometheus, Grafana)
- External uptime monitoring
- Alerting (email, Slack, Telegram) — future enhancement
