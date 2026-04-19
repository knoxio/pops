# POPS Recovery Procedure

> Restore POPS from a Backblaze B2 backup onto a fresh or rebuilt server.
> This document is stored in the repo so it remains accessible when the server is down.
>
> **Quick path (server intact):** run `/opt/pops/restore.sh pops-YYYYMMDD-HHMMSS.tar.age` — it handles Steps 1–5, 7, and 9 automatically.

## Prerequisites

| Requirement            | Details                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| SSH access             | Port 2222 on the server (or physical access)                                                                                              |
| rclone                 | Installed and configured with the `pops-b2` remote                                                                                        |
| age                    | Installed (`apt install age`)                                                                                                             |
| Backup passphrase      | From Ansible Vault (`vault_backup_encryption_passphrase`) — also stored in `/opt/pops/secrets/backup_encryption_passphrase` on the server |
| Docker + Compose       | Installed on the target machine                                                                                                           |
| Ansible Vault password | To decrypt secrets if provisioning from scratch                                                                                           |

## Estimated Recovery Time

| Scenario                                             | Estimate  |
| ---------------------------------------------------- | --------- |
| Data restore only (server intact, Docker running)    | 10–15 min |
| Full rebuild (fresh OS, Ansible provision + restore) | 45–60 min |

Download time depends on internet speed. A typical backup is 50–200 MB.

## Step 1: List Available Backups

```bash
rclone ls pops-b2:pops-backups/
```

Backups are named `pops-YYYYMMDD-HHMMSS.tar.age`. Pick the most recent (or a specific date).

## Step 2: Download the Backup

```bash
mkdir -p /tmp/pops-restore
rclone copy pops-b2:pops-backups/pops-YYYYMMDD-HHMMSS.tar.age /tmp/pops-restore/ --progress
```

Replace `YYYYMMDD-HHMMSS` with the actual timestamp.

## Step 3: Decrypt

```bash
# Non-interactive (passphrase from secrets file on the server)
cat /opt/pops/secrets/backup_encryption_passphrase \
  | age --decrypt \
      --output /tmp/pops-restore/pops-backup.tar \
      /tmp/pops-restore/pops-YYYYMMDD-HHMMSS.tar.age

# Or interactive (prompts for passphrase — use if restoring to a new server)
age --decrypt \
  --output /tmp/pops-restore/pops-backup.tar \
  /tmp/pops-restore/pops-YYYYMMDD-HHMMSS.tar.age
```

The passphrase is in Ansible Vault (`vault_backup_encryption_passphrase`) and deployed to `/opt/pops/secrets/backup_encryption_passphrase` on the server.

## Step 4: Stop Services

```bash
cd /opt/pops
docker compose down
```

## Step 5: Extract and Restore Data

The backup archive layout is:

```
sqlite/pops.db          ← SQLite database
paperless/data/         ← Paperless-ngx data volume
paperless/media/        ← Paperless-ngx media volume
metabase/               ← Metabase data volume
engrams/                ← Cerebrum engram files (host directory)
```

**Option A — automated (recommended):** Use the restore script deployed by Ansible:

```bash
/opt/pops/restore.sh pops-YYYYMMDD-HHMMSS.tar.age
```

The script stops services, restores all volumes, restarts services, and cleans up.

**Option B — manual:**

```bash
# Extract the archive
mkdir -p /tmp/pops-restore/extracted
tar xf /tmp/pops-restore/pops-backup.tar -C /tmp/pops-restore/extracted
EXT=/tmp/pops-restore/extracted

# Restore SQLite into Docker named volume
docker run --rm \
  -v pops-sqlite-data:/data/sqlite \
  -v "${EXT}/sqlite:/restore:ro" \
  alpine cp /restore/pops.db /data/sqlite/pops.db

# Restore Paperless data volumes
docker run --rm \
  -v pops-paperless-data:/dst \
  -v "${EXT}/paperless/data:/src:ro" \
  alpine sh -c "find /dst -mindepth 1 -delete && cp -a /src/. /dst/"
docker run --rm \
  -v pops-paperless-media:/dst \
  -v "${EXT}/paperless/media:/src:ro" \
  alpine sh -c "find /dst -mindepth 1 -delete && cp -a /src/. /dst/"

# Restore Metabase data volume
docker run --rm \
  -v pops-metabase-data:/dst \
  -v "${EXT}/metabase:/src:ro" \
  alpine sh -c "find /dst -mindepth 1 -delete && cp -a /src/. /dst/"

# Restore engrams (host directory)
find /opt/pops/engrams -mindepth 1 -delete 2>/dev/null || true
cp -r "${EXT}/engrams/." /opt/pops/engrams/
```

### Docker Volumes

| Data            | Docker Volume              | Archive path       |
| --------------- | -------------------------- | ------------------ |
| SQLite database | `pops-sqlite-data`         | `sqlite/pops.db`   |
| Paperless data  | `pops-paperless-data`      | `paperless/data/`  |
| Paperless media | `pops-paperless-media`     | `paperless/media/` |
| Metabase data   | `pops-metabase-data`       | `metabase/`        |
| Engrams         | host: `/opt/pops/engrams/` | `engrams/`         |

### Redis

Redis (`pops-redis`) is **ephemeral by design** — it holds job queue state and cache only. No backup is needed or taken. RDB snapshots and AOF persistence are explicitly disabled (`--save "" --appendonly no`), so the volume holds no persistent data.

On any restart or fresh deploy, Redis starts with an empty dataset. Source-of-truth data in SQLite is unaffected. The API starts in degraded mode if Redis is temporarily unavailable and reconnects automatically once Redis is ready.

## Step 6: Restore Secrets (if full rebuild)

If the server was rebuilt from scratch, secrets must be restored from Ansible Vault before services can start.

```bash
cd /path/to/pops/repo/infra/ansible
ansible-playbook playbooks/site.yml --tags secrets
```

This writes secret files to `/opt/pops/secrets/`. Alternatively, manually copy the secret files:

| Secret File                    | Used By           |
| ------------------------------ | ----------------- |
| `notion_api_token`             | pops-api          |
| `up_bank_token`                | pops-api          |
| `up_webhook_secret`            | pops-api          |
| `claude_api_key`               | pops-api, moltbot |
| `finance_api_key`              | pops-api, moltbot |
| `telegram_bot_token`           | moltbot           |
| `paperless_secret_key`         | paperless-ngx     |
| `paperless_admin_password`     | paperless-ngx     |
| `backup_encryption_passphrase` | backup script     |

## Step 7: Start Services

```bash
cd /opt/pops
docker compose up -d
```

Docker Compose handles service ordering. `redis` starts before `pops-api` (health-check dependency); `paperless-redis` starts before `paperless-ngx`.

## Step 8: Verify

```bash
# Check all containers are running
docker compose ps

# Verify API health
curl -sf http://localhost:3000/health && echo "API OK" || echo "API FAILED"

# Verify Metabase is accessible
curl -sf -o /dev/null http://localhost:3000 && echo "Metabase OK" || echo "Metabase FAILED"

# Verify Paperless is accessible
docker logs pops-paperless --tail 20

# Verify SQLite data
docker exec pops-api node -e "
  const db = require('better-sqlite3')('/data/sqlite/pops.db');
  const count = db.prepare('SELECT COUNT(*) as n FROM entities').get();
  console.log('Entities:', count.n);
"
```

## Step 9: Cleanup

```bash
rm -rf /tmp/pops-restore
```

## Full Rebuild Checklist

If the server is completely new (fresh OS install):

1. **Provision the server** — `ansible-playbook playbooks/site.yml` (installs Docker, creates user, sets up firewall, deploys secrets)
2. **Clone the repo** — `git clone` into `/opt/pops/repo`
3. **Build images** — `docker compose build`
4. **Restore data** — follow Steps 1–5 above
5. **Start services** — `docker compose up -d`
6. **Verify** — follow Step 8
7. **Re-enable backup timer** — `sudo systemctl enable --now pops-backup.timer`
8. **Verify Cloudflare Tunnel** — check the public URL is accessible (domain configured via `POPS_DOMAIN` in `.env`)

## Troubleshooting

| Symptom                  | Fix                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `age: could not decrypt` | Wrong passphrase. Check Ansible Vault for the correct value                                       |
| API health check fails   | Check logs: `docker logs pops-api --tail 50`. Likely missing secrets or SQLite file               |
| Paperless won't start    | Ensure `paperless-redis` is running first. Check Redis connectivity                               |
| Metabase shows no data   | SQLite volume may not be mounted correctly. Verify `/data/sqlite/pops.db` exists in the container |
| Cloudflare Tunnel down   | Verify `cloudflared` container is running and tunnel token is correct                             |
| Backup timer not running | `sudo systemctl enable --now pops-backup.timer` then `systemctl status pops-backup.timer`         |
