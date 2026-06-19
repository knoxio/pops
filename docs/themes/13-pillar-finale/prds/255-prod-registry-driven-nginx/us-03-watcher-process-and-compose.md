# US-03: Run the registry watcher in prod

> PRD: [PRD-255 — Production registry-driven nginx](README.md)

## Description

As an operator, I want the registry watcher running alongside nginx in the production `pops-shell`
container, so that registering/deregistering a pillar updates routes with **no redeploy** — the
event-driven reload PRD-228 built but never deployed.

## Acceptance Criteria

- [ ] `watch-registry-and-reload` (the existing CLI, `gen:nginx:watch`) runs as a managed long-lived process in the prod image alongside `nginx` — if either process exits, the container exits (no silent half-dead state).
- [ ] The watcher is configured from env: `POPS_REGISTRY_URL` (SSE `GET /registry/subscribe` source) and the optional `POPS_NGINX_HEALTH_PORT` (the `nginx_generator_last_error_at` surface) are set in `infra/docker-compose.yml` `pops-shell`.
- [ ] On a `registered` / `deregistered` / eviction event the watcher re-renders (US-01 path), runs `nginx -t`, and on pass runs `nginx -s reload` against the **running** master — verified end-to-end (US-04), not just in the unit harness.
- [ ] A failed render/validation leaves the live conf in place and flips the watcher health endpoint to degraded (existing PRD-228/US-03 behaviour) — confirmed to work in the deployed topology.
- [ ] No regression to boot: US-02's boot-render still produces the initial conf; the watcher takes over for subsequent changes.

## Notes

Process supervision in a single `nginx:alpine` container: a small supervisor (e.g. a shell `trap` +
`wait -n`, or `s6`/`dumb-init` if already available) is acceptable — keep it minimal. The watcher and
nginx must share the same conf path so a reload picks up the watcher's render. The reload/debounce/
`nginx -t` logic is already implemented and tested (`nginx-event-reload.ts`,
`watch-registry-and-reload.e2e.test.ts`); this US is wiring + supervision, not new reload logic.
