# US-04: E2E — self-registered pillar routes with no rebuild

> PRD: [PRD-255 — Production registry-driven nginx](README.md)

## Description

As the platform, I want an end-to-end test proving that a pillar which self-registers gets a working
`/<x>-api/` route through the deployed shell **without any code edit or image rebuild**, and that a
registry outage degrades gracefully — this is the PRD's acceptance drill (runbook V2).

## Acceptance Criteria

- [ ] **Happy path:** boot the `pops-shell` container against a registry; `POST /core.registry.register` a synthetic pillar (with a reachable `baseUrl`); within the watcher's debounce window a request to `/<synthetic>-api/...` is proxied to that `baseUrl`. No image rebuild, no conf hand-edit.
- [ ] **Deregister:** `POST /core.registry.deregister` the synthetic pillar; subsequent requests to its route stop being proxied after the reload settles.
- [ ] **Registry-down boot:** start the container with the registry unreachable; nginx boots from the static fallback and the seven known pillars still route (US-02).
- [ ] **Known-pillar upstream:** a known pillar (e.g. `finance`) routes to its compose `host:port`, not to any registry-advertised `baseUrl` (PRD-255 scope concession).
- [ ] The test runs in CI as part of the shell's suite and does not depend on a hand-maintained pillar list (it registers the synthetic pillar at runtime).

## Notes

Reuse the synthetic-pillar machinery where possible — `apps/pops-shell/src/tests/synthetic-pillar.integration.test.tsx`
already models a registry-walk synthetic pillar, and `watch-registry-and-reload.e2e.test.ts` already
drives the watcher against a fake SSE registry. This US is the _deployed-topology_ drill (container +
real nginx reload), distinct from those in-process unit/integration tests. Keep timeouts off the
critical path — assert on the reload signal / proxied response, not a fixed sleep.
