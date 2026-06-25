# Deployed-topology e2e for registry-driven nginx

Split out of the [Production registry-driven nginx](../themes/federation/prds/prod-registry-driven-nginx.md)
PRD. The boot-render + watcher run in production and are covered in-process (fake SSE registry driving
the watcher; static-source guards on the entrypoint). The missing piece is a **deployed-topology**
drill: a real `pops-shell` container, real nginx, real `nginx -s reload`, proving a self-registered
pillar routes with no rebuild and that a registry outage degrades gracefully.

## What to build

A container-level end-to-end test (own suite, not the in-process unit/integration tests) that boots the
real shell image against a registry and asserts on the reload signal / proxied response — never a fixed
sleep on the critical path.

## Acceptance criteria

- [ ] **Happy path.** Boot the `pops-shell` container against a registry; `POST /registry/register` a
      synthetic pillar with a reachable `baseUrl`; within the watcher's debounce window a request to
      `/<synthetic>-api/...` is proxied to that `baseUrl`. No image rebuild, no conf hand-edit.
- [ ] **Deregister.** `POST /registry/deregister` the synthetic pillar; subsequent requests to its route
      stop being proxied after the reload settles.
- [ ] **Registry-down boot.** Start the container with the registry unreachable; nginx boots from the
      static fallback and the in-tree pillars still route.
- [ ] **Known-pillar upstream.** A known pillar (e.g. `finance`) routes to its compose `host:port`, not
      to any registry-advertised `baseUrl`.
- [ ] Runs in CI as part of the shell's suite and registers the synthetic pillar at runtime (no
      hand-maintained pillar list).

## Notes

Reuse existing machinery where possible: the synthetic-pillar registry-walk fixture and the fake-SSE
watcher e2e already model the moving parts. This idea is the _deployed-topology_ layer those tests
deliberately stop short of (container + real reload). Keep timeouts off the critical path — assert on
the reload signal or the proxied response.
