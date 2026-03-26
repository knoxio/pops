# Epic 06: Monitoring

> Theme: [Infrastructure](../README.md)

## Scope

Set up health checks, log aggregation, and alerting so service failures are detected without manual checking.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 018 | [Monitoring](../prds/018-monitoring/README.md) | Docker health checks on API and shell, log access, alerting on service failure | Done |

## Dependencies

- **Requires:** Epic 01 (services must be running to monitor)
- **Unlocks:** Confidence that failures are detected

## Out of Scope

- APM or distributed tracing
- Metrics dashboards (Grafana, Prometheus)
- Uptime monitoring from external services
