# Spike — Extract deployment to a separate repo

Investigation only — recommendations, no code changes. Sibling spikes: [modular-apps](./modular-apps-spike.md), [feature-toggles](./feature-toggles-spike.md).

## Question

Should the deployment surface move out of this repo into a dedicated `mu-deploy` (or similar) repo that manages the home-server fleet, leaving POPS as a self-contained dockerised app that anyone can `docker compose up`?

## Current coupling

- `deploy.sh` — root-level script; expects to be run from the repo
- `infra/docker-compose.yml` — uses `context: ..` with `dockerfile: apps/pops-api/Dockerfile` and `dockerfile: apps/pops-shell/Dockerfile`; also references `../packages/import-tools`, `../apps/moltbot/config`, `../secrets/*`
- `infra/ansible/` — 8 roles, most of which are **server-generic** (`common`, `docker`, `github-runner`, `secrets`, `cloudflare-tunnel`, `monitoring`, `backups`) and one that is **pops-specific** (`pops-deploy`)
- `.github/workflows/root-deploy.yml` and `infra-quality.yml` — couple CI to the co-located infra
- `scripts/setup-github-runner.sh` — generic server bootstrap, not pops-specific
- `mise.toml` — ansible and docker tasks assume both code and infra live here
- Dockerfiles copy workspace paths (`packages/app-*`, `packages/db-types`, `apps/pops-api/src/db/migrations`) — build context is the repo root

The ansible roles are already clean (they don't import app code). The compose file is the main bridge.

## Three ways to split

| Option                    | What moves to `mu-deploy`                                                                                      | What stays in `pops`                                               | Build model                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| **A. Full split**         | `infra/ansible/`, `infra/docker-compose.yml`, `deploy.sh`, `scripts/setup-github-runner.sh`, all vault secrets | Dockerfiles, source                                                | POPS publishes tagged images to a registry; `mu-deploy` pulls + runs                            |
| **B. Ansible-only split** | `infra/ansible/`, `deploy.sh`, `scripts/setup-github-runner.sh`                                                | Dockerfiles, `infra/docker-compose.yml`                            | POPS still builds locally on the server via compose; `mu-deploy` clones it and drives the build |
| **C. Generic infra only** | `common`, `docker`, `github-runner`, `cloudflare-tunnel`, `monitoring`, `backups`, `secrets`                   | `pops-deploy` role, `docker-compose.yml`, Dockerfiles, `deploy.sh` | POPS owns its deploy; `mu-deploy` owns the host                                                 |

Option C is the lightest; Option A is the one that actually achieves "no infra on POPS". The chosen direction is **A**, phased so we don't hit the image-registry tax before the rest of the split is wired up. `mu-deploy` becomes a "my home server" repo that provisions Docker, runners, tunnels, backups, monitoring, and runs each service from published images pulled by tag.

## Advantages

- `mu-deploy` can host services other than POPS without POPS having to know
- POPS becomes genuinely installable by a third party — `git clone && cp .env.example .env && docker compose up` (this directly supports the [modularisation spike](./modular-apps-spike.md))
- POPS PRs no longer couple to infra PRs; CI for the app stops waiting on ansible lint
- Vault/secrets lifecycle moves to where it belongs (the host, not the app)
- Rebuilding / reprovisioning the server doesn't touch app history
- Forces a clearer contract: POPS publishes what it needs (ports, volumes, env vars, secret names) and nothing more

## Disadvantages / risks

- Two repos to keep in lockstep — compose changes, env var additions, new secrets must propagate
- Atomic rollback across app + infra changes is harder (can't `git revert` both in one PR)
- Bootstrap chicken-and-egg: the self-hosted runner currently lives in the same repo it deploys — splitting means the runner has to bootstrap from `mu-deploy` first
- Image registry becomes a dependency (GHCR is fine, but it's a new moving part)
- Local dev story may regress if people currently lean on `mise docker:up` — need to keep that working from POPS alone

## "Fully isolated in docker" — what it actually means

Today POPS is already built in Docker. The gap to "fully isolated" is small:

1. **Published images** — tag on push, push to GHCR. Compose pulls by tag instead of building locally. This is the main change.
2. **No implicit host paths** — `../secrets/*` bind mounts get replaced with a documented `.env`-driven secrets directory and/or Docker secrets loaded by the operator.
3. **A "what POPS needs" manifest** — a single file (`DEPLOY.md` or `deploy.yaml` in the POPS repo) describing required env vars, ports, volumes, and optional services. `mu-deploy` reads this to configure the host.
4. **Migrations baked into the image** — already true. `pops-api` runs drizzle migrations on startup.

None of this requires architectural change, just discipline.

## Images: friction check

> "Would going to images create friction? Can deploy/upgrade be automated?"

Friction exists but is one-sided and disappears after setup:

**Build-on-server (today)** — friction is every deploy. A push takes 3-8 minutes of server-side `docker build` before anything restarts. Fine for an occasional deploy, painful when iterating. No CI gate (broken build on server = downtime).

**GHCR + pull-by-tag** — friction is the one-time setup (publish workflow, auth, tag strategy) and waiting on CI for each deploy (~2-4 min for tests + image build). After that each _server-side_ deploy is a 10-second `docker compose pull && up -d`. CI blocks broken images from ever reaching the server.

With auto-deploy on merge the flow becomes:

```
merge to main → CI runs tests + typecheck + lint → CI builds + pushes image to GHCR
              → webhook to mu-deploy runner → pull + compose up -d → done
```

No manual step. The friction-per-deploy is lower than today. The only new failure mode is "registry unavailable", which you can mitigate by retaining the N most recent images locally as a fallback.

## Deploy automation

Chosen model: **auto-deploy on merge**.

Two implementation paths:

1. **Self-hosted runner on the server** — GHA job with `runs-on: self-hosted` runs `docker compose pull && up -d` after the image publish job succeeds. Same runner that lives today. Simplest.
2. **Webhook into `mu-deploy`** — GHA job POSTs to a small endpoint on the server after image publish. `mu-deploy` validates, pulls, redeploys. Requires an auth token but decouples POPS from runner knowledge.

Option 1 is the pragmatic answer given the runner already exists. Move the runner's ownership to `mu-deploy` (it's a host-level thing), but keep the self-hosted path.

**Pause switch**: `mu-deploy` stores a per-service `deploy_enabled` flag (config file on the server). When `false`, incoming webhooks/runner jobs skip the restart step but keep publishing images. Useful for freezes, holidays, or mid-debug.

## Open questions

- Registry: GHCR (simplest, same auth as GitHub). Self-hosted registry only if we want fully offline setups later.
- Image tagging: `main`, `sha-<short>`, and `v<semver>` (on release tags) — deploy-on-merge targets the sha tag, so rollback is `docker compose pull pops-api:sha-<prev>`.
- `mu-deploy` stays private (it knows your host), templated copy for public consumption is a follow-up.
- `docker-compose.yml` — canonical file lives in `mu-deploy` (it describes how the host runs things); POPS ships a minimal `docker-compose.dev.yml` for local dev that builds locally.
- Moltbot — separate service in `mu-deploy` (it already uses an upstream image; it only depends on POPS via `FINANCE_API_URL`, which is a host-level concern).
- Local dev — `mise dev` and `mise docker:up` must keep working from POPS alone. Ship a `docker-compose.dev.yml` that replaces the `image:` lines with `build:` contexts.

## Recommendation

Target **Option A** (no infra in POPS), phased:

**Phase 1 — Extract generic infra (Option C equivalent)** (~3-5 days)

1. Create `mu-deploy` repo, move `common`, `docker`, `github-runner`, `cloudflare-tunnel`, `monitoring`, `backups`, `secrets` roles.
2. Move `scripts/setup-github-runner.sh` and vault management there.
3. Self-hosted runner's repo-binding moves to `mu-deploy`.
4. POPS still builds + deploys as today from its own `infra/`.

**Phase 2 — Publish images + flip the source of truth** (~1-2 weeks)

5. Add a GHA job to POPS that builds `pops-api`, `pops-worker`, `pops-shell` images and pushes to GHCR on merge to `main` and on release tags.
6. Move `docker-compose.yml` from POPS to `mu-deploy`, rewriting `build:` to `image: ghcr.io/knoxio/pops-api:main` (or tag).
7. Add `DEPLOY.md` / `deploy.yaml` in POPS describing required env vars, ports, volumes, and optional services. `mu-deploy` reads this.
8. POPS ships a `docker-compose.dev.yml` that keeps local `docker build` working.
9. Delete `infra/` from POPS entirely.

**Phase 3 — Auto-deploy on merge** (~2-3 days)

10. GHA job after image publish triggers the self-hosted runner (now in `mu-deploy`) to `docker compose pull && up -d`.
11. Add the `deploy_enabled` pause flag in `mu-deploy`.
12. Rollback: `mu-deploy` records the last N running image tags; rollback is a `mu-deploy rollback pops` command that flips to the previous sha.

## Next steps if we proceed

- Open an epic under theme `00-infrastructure`: "Extract deployment to mu-deploy".
- PRDs: (1) mu-deploy repo scaffolding, (2) DEPLOY.md / deploy.yaml contract, (3) GHCR image publish + tagging, (4) auto-deploy webhook + pause flag, (5) rollback via mu-deploy CLI.
- Snapshot the current vault before moving anything.
- Confirm the self-hosted runner can be re-registered against `mu-deploy` without losing history.
