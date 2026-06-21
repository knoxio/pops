# US-02: Boot-render the conf, with static fallback

> PRD: [PRD-255 — Production registry-driven nginx](README.md)

## Description

As the `pops-shell` container, I want to render the nginx conf from the live registry at start and fall
back to the committed static conf on any failure, so that a self-registered pillar is routable on the
next boot **and** nginx always starts even when the registry is down.

## Acceptance Criteria

- [x] An image entrypoint script (`apps/pops-shell/docker-entrypoint.sh`) runs the dynamic render (US-01 path) before nginx starts, writing the result to the served conf path (`/etc/nginx/conf.d/default.conf`).
- [x] On **any** render failure (registry unreachable, timeout, `nginx -t` rejects the output), the entrypoint falls back to the committed static `default.conf` and nginx boots regardless. The fallback is logged at warn level.
- [x] `apps/pops-shell/Dockerfile` replaces the bare `CMD ["nginx", "-g", "daemon off;"]` with the entrypoint; the committed static conf is still `COPY`'d (it is the fallback artifact) and the shared `_pillar-proxy.conf` snippet COPY is retained.
- [x] The committed static conf remains drift-checked: `gen:nginx:check` (`--check` mode) runs in CI as a gate (`fe-quality.yml`), not only the Vitest snapshot test, failing the build if the committed fallback is stale.
- [x] Booting with the registry **unreachable** yields a running nginx serving the seven known pillars from the static fallback (verified by container smoke test; CI e2e is US-04).
- [x] Booting with the registry **reachable** yields a conf rendered from the live snapshot (verified by container smoke test; CI e2e is US-04).

## Notes

The known-7 are always representable from `PILLAR_UPSTREAMS`, so even a registry-reachable render that
returns only internal pillars produces a working conf. Keep the entrypoint small and POSIX-sh friendly
(alpine). The render binary is the same `tsx scripts/generate-nginx-conf.ts --dynamic` already wired as
`gen:nginx:dynamic`; ensure the production image actually carries the script + its runtime deps.
