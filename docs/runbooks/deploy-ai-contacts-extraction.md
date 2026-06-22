# Deploy Runbook — AI + Contacts Extraction (Stages 1–4)

**Status:** ready to deploy. Supervised, staged. Do NOT run as a single `compose up`.

This deploys the core-decomposition work merged to `main` (PRs #3482–#3500): the new **ai** pillar (`:3008`, real `/ai-usage/record` ingest), the new Rust **contacts** pillar (`:3010`, entities/contacts store), core de-AI'd + de-entitied, finance live-fetching contacts, telemetry wired across finance/cerebrum/food, and per-pillar settings federation.

## ⚠️ The one trap — staged, in this order

The core→contacts entity **migrator reads `core`'s `entities` table**, but the **new `core` image drops that table on startup** (migration `0069_drop_entities.sql`). A single `docker compose up --pull always` would update `core` and **destroy the entity data before it is migrated**. So:

1. **Back up first** (entities live in `core.db`).
2. **Bring up `contacts` + `ai` only** — do NOT pull the new `core`/`finance` images yet.
3. **Run the migrator** (old `core` still has `entities` → `contacts`).
4. **Verify** `contacts` has the data.
5. **Then** roll the rest (`--pull always`), which drops core's entities + switches finance to live-fetch.

If you skip step 3 before step 5, entity data is lost (recover from the step-1 backup / litestream).

---

## 0. Pre-deploy (done / verify)

- [x] Images published: `gh workflow run publish-images.yml` (run already triggered on `main`) — confirm `pops-ai` + `pops-contacts` images exist: `gh api /orgs/knoxio/packages/container/pops-ai/versions --jq '.[0].metadata.container.tags'` and same for `pops-contacts`.
- [ ] `POPS_API_INTERNAL_TOKEN` exists in capivara's `pops-secrets.env` (rendered from vault). The ai ingest is gated on it and the reporting pillars must send the same value. If absent, add it to the ansible vault (`homelab-infra` `pops-deploy` `pops-secrets.env.j2`) and re-render.
- [ ] **Backup**: `ssh capivara` → `sudo cp /data/.../core.db /data/.../core.db.pre-extraction` (or trigger a litestream snapshot). Confirm the litestream `core` stream is current.

## 1. Box compose changes (`/cac/stacks/pops/docker-compose.yml`, sudo)

The box compose is hand-maintained and **diverges from the repo** (it uses `pops-metabase`/`pops-paperless`, no watchtower service, `*pops_pillars` anchor). Edit the **box** file — do NOT copy the repo's compose over it.

**a) Update the `pops_pillars` anchor** to include the two new pillars so every pillar can discover them:

```
ai:http://ai-api:3008,contacts:http://contacts-api:3010
```

(append to the existing `&pops_pillars ...` list value).

**b) Add two services** (adapted to the box convention — `image:` only, `*pops_pillars`, `env_file: ./pops-secrets.env`):

```yaml
  ai-api:
    image: ghcr.io/knoxio/pops-ai:${POPS_IMAGE_TAG:-main}
    container_name: pops-ai
    restart: unless-stopped
    labels: { com.centurylinklabs.watchtower.enable: 'true' }
    networks: [frontend, backend]
    volumes: [sqlite-data:/data/sqlite]
    env_file: [./pops-secrets.env]          # POPS_API_INTERNAL_TOKEN + Anthropic key
    environment:
      NODE_ENV: production
      PORT: '3008'
      AI_SQLITE_PATH: /data/sqlite/ai.db
      AI_SELF_BASE_URL: http://ai-api:3008
      POPS_PILLARS: *pops_pillars
      POPS_REGISTRY_ENABLED: 'true'
    expose: ['3008']
    depends_on: { core-api: { condition: service_healthy } }
    healthcheck:
      test: ['CMD','node','-e',"fetch('http://localhost:3008/health').then(r=>{if(!r.ok)process.exit(1)})"]
      interval: 30s
      timeout: 5s
      retries: 3

  contacts-api:
    image: ghcr.io/knoxio/pops-contacts:${POPS_IMAGE_TAG:-main}
    container_name: pops-contacts
    restart: unless-stopped
    labels: { com.centurylinklabs.watchtower.enable: 'true' }
    networks: [frontend, backend]
    volumes: [sqlite-data:/data/sqlite]
    env_file: [./pops-secrets.env]          # POPS_API_INTERNAL_TOKEN
    environment:
      PORT: '3010'
      CONTACTS_SQLITE_PATH: /data/sqlite/contacts.db
      CONTACTS_SELF_BASE_URL: http://contacts-api:3010
      POPS_REGISTRY_ENABLED: 'true'
      POPS_REGISTRY_URL: http://core-api:3001
      POPS_PILLARS: *pops_pillars
    expose: ['3010']
    depends_on: { core-api: { condition: service_healthy } }
    healthcheck:
      test: ['CMD','curl','-fsS','http://localhost:3010/health']   # ⚠ verify curl is in the contacts image; if not, swap to wget or a Rust probe
      interval: 30s
      timeout: 5s
      retries: 3
```

**c) Add to the reporting pillars** (`finance-api`, `food-api`, `pops-worker-food`, `cerebrum-api`, `cerebrum-worker`) so their telemetry reaches the ai pillar:

```yaml
AI_API_URL: http://ai-api:3008
POPS_API_INTERNAL_TOKEN: ${POPS_API_INTERNAL_TOKEN:-} # or via env_file already
```

**d) nginx**: the shell's nginx is registry-driven (PRD-255) — once `ai`/`contacts` register, their `/ai-api/` and `/contacts-api/` blocks render automatically. No manual nginx edit needed.

## 2. Bring up the new pillars ONLY (do not roll core/finance yet)

```
cd /cac/stacks/pops
sudo docker compose --env-file /cac/.env up -d ai-api contacts-api
```

Verify: `docker ps | grep -E 'pops-ai|pops-contacts'` both healthy; `docker logs pops-contacts` shows it registered (`registered with registry`); `curl -s http://localhost:3010/health` and `:3008/health` return ok.

## 3. Migrate core entities → contacts (old core still has the table)

Run the idempotent migrator (from #3499, `pillars/finance/scripts/migrate-core-entities.ts`) with `POPS_PILLARS` pointing at the live core + new contacts. Easiest from a checkout with network access to both (e.g. on capivara via a one-shot container, or a dev box on the tailnet):

```
POPS_PILLARS="core:http://core-api:3001,contacts:http://contacts-api:3010" \
POPS_API_INTERNAL_TOKEN=<token> \
pnpm --filter @pops/finance exec tsx scripts/migrate-core-entities.ts
```

It is idempotent (409 = already migrated) and **throws on a truncated read** (non-zero exit) — a clean exit means the full set transferred.

## 4. Verify the migration

`curl -s http://localhost:3010/entities | jq '.data | length'` ≈ the old core entity count. Spot-check a few names.

## 5. Roll the rest of the stack

Now it's safe to update `core` (drops entities), `finance` (live-fetch + drops its mirror, migration `0057`), and pull the telemetry-wired images:

```
cd /cac/stacks/pops
sudo docker compose --env-file /cac/.env up -d --pull always --remove-orphans
```

(Or use the homelab-infra `deploy.yml` / `pops-deploy` ansible run, which does this same `up --pull always`.)

## 6. Post-deploy verification (`ssh capivara`)

- `docker ps --format '{{.Names}}\t{{.Status}}' | grep pops` — ALL healthy, incl. `pops-ai`, `pops-contacts`.
- AI Ops dashboard (shell `/ai/...`) loads from `/ai-api` and shows data (after some inference flows).
- Finance import wizard runs and matches entities (live-fetched from contacts).
- `pops-paperless`, `pops-metabase` untouched/healthy (the box-specific services).

## 7. Rollback

Pin to the prior images and re-up:

```
# in /cac/.env
POPS_IMAGE_TAG=sha-<previous-good-sha>
sudo docker compose --env-file /cac/.env up -d --pull always --remove-orphans
sudo docker compose stop ai-api contacts-api   # remove the new services if needed
```

If entity data was lost (trap above), restore `core.db` from the step-1 backup / litestream. See homelab-infra `docs/runbooks/pops-rollback.md`.

## Deferred (NOT in this deploy)

- `ai_usage`→finance re-home (#3489) — core keeps the 3 `/ai-usage/cache` routes for now.
- Settings aggregator + shell capability cutover (S3) + central-enum shrink (S4) — pillars own their settings; the shell still reads core. Additive, no behavior change.
- food `ai_inference_log` table/route drop — kept; run `pnpm --filter @pops/food backfill:ai-inference` post-deploy to migrate history, then drop later.
- `core` → `registry` rename (Stage 5) — cosmetic, deferred (renames the `core-api` service; do as a separate supervised deploy).
