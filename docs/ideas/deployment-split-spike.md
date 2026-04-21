# Spike — Extract deployment to a separate repo

Investigation. Not committed. Sibling spikes: [modular-apps](./modular-apps-spike.md), [feature-toggles](./feature-toggles-spike.md).

## Question

Should the deployment surface move out of this repo into a dedicated `mu-deploy` (or similar) repo that manages the home-server fleet, leaving POPS as a self-contained dockerised app that anyone can `docker compose up`?

## Current coupling

- `deploy.sh` — root-level script; expects to be run from the repo
- `infra/docker-compose.yml` — references `../apps/pops-api/Dockerfile`, `../apps/pops-shell/Dockerfile`, `../packages/import-tools`, `../apps/moltbot/config`, `../secrets/*`
- `infra/ansible/` — 8 roles, most of which are **server-generic** (`common`, `docker`, `github-runner`, `secrets`, `cloudflare-tunnel`, `monitoring`, `backups`) and one that is **pops-specific** (`pops-deploy`)
- `.github/workflows/root-deploy.yml` and `infra-quality.yml` — couple CI to the co-located infra
- `scripts/setup-github-runner.sh` — generic server bootstrap, not pops-specific
- `mise.toml` — ansible and docker tasks assume both code and infra live here
- Dockerfiles copy workspace paths (`packages/app-*`, `packages/db-types`, `apps/pops-api/src/db/migrations`) — build context is the repo root

The ansible roles are already clean (they don't import app code). The compose file is the main bridge.

## Three ways to split

| Option | What moves to `mu-deploy` | What stays in `pops` | Build model |
| --- | --- | --- | --- |
| **A. Full split** | `infra/ansible/`, `infra/docker-compose.yml`, `deploy.sh`, `scripts/setup-github-runner.sh`, all vault secrets | Dockerfiles, source | POPS publishes tagged images to a registry; `mu-deploy` pulls + runs |
| **B. Ansible-only split** | `infra/ansible/`, `deploy.sh`, `scripts/setup-github-runner.sh` | Dockerfiles, `infra/docker-compose.yml` | POPS still builds locally on the server via compose; `mu-deploy` clones it and drives the build |
| **C. Generic infra only** | `common`, `docker`, `github-runner`, `cloudflare-tunnel`, `monitoring`, `backups`, `secrets` | `pops-deploy` role, `docker-compose.yml`, Dockerfiles, `deploy.sh` | POPS owns its deploy; `mu-deploy` owns the host |

Option C is the lightest: `mu-deploy` becomes a "my home server" repo that provisions Docker, runners, tunnels, backups, and monitoring on any box. Each hosted service (POPS, a future moltbot-standalone, anything else) keeps its own compose and deploy playbook and registers itself with the host.

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
3. **A "what POPS needs" manifest** — a single file (`infra/DEPLOY.md` or a `deploy.yaml`) describing required env vars, ports, volumes, and optional services. `mu-deploy` reads this to configure the host.
4. **Migrations baked into the image** — already true. `pops-api` runs drizzle migrations on startup.

None of this requires architectural change, just discipline.

## Open questions

- Registry: GHCR, self-hosted, or both (public mirror + private)?
- Image tagging: git sha, semver, or both?
- Does `mu-deploy` stay private (it knows your host), or is it templated so others can fork it?
- Do we keep a thin `docker-compose.yml` in POPS for local dev and a "production overlay" in `mu-deploy`, or ship one file and have `mu-deploy` provide overrides?
- Moltbot — it already uses an upstream image; does it still belong in the POPS compose, or become its own service in `mu-deploy`?

## Recommendation

Option C first. Cheapest, reversible, and it doesn't force the image-registry work before we're ready. Migration steps:

1. Create `mu-deploy` repo with the generic roles (`common`, `docker`, `github-runner`, `cloudflare-tunnel`, `monitoring`, `backups`, `secrets` scaffolding only — the vault stays scoped per host).
2. Move `scripts/setup-github-runner.sh` and vault management there.
3. Keep `infra/docker-compose.yml`, `infra/ansible/roles/pops-deploy`, and `deploy.sh` in POPS. The POPS deploy role becomes the contract `mu-deploy` invokes.
4. Add `infra/DEPLOY.md` to POPS documenting the expected env vars, secrets, ports, and volumes.
5. Re-point `.github/workflows/root-deploy.yml` at the new split (runner lives in `mu-deploy`, triggers `pops-deploy` role).

Graduating to Option A (published images, no local build) is a follow-up once the split is stable and an image registry is in place.

## Next steps if we proceed

- Open an epic under theme `00-infrastructure` with PRDs for: (1) `mu-deploy` repo scaffolding, (2) `infra/DEPLOY.md` contract, (3) CI split, (4) secrets/vault migration.
- Snapshot the current vault before moving anything.
- Decide on repo visibility + registry before doing the image work.
