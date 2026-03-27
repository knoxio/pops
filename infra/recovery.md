# POPS Recovery Procedure

> Restore POPS from a Backblaze B2 backup onto a fresh or rebuilt server.
> This document is stored in the repo so it remains accessible when the server is down.

## Prerequisites

| Requirement            | Details                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| SSH access             | Port 2222 on the N95 (or physical access)                                                                                                 |
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
age --decrypt \
  --output /tmp/pops-restore/pops-backup.tar \
  /tmp/pops-restore/pops-YYYYMMDD-HHMMSS.tar.age
```

Enter the backup passphrase when prompted (from Ansible Vault or `/opt/pops/secrets/backup_encryption_passphrase`).

## Step 4: Stop Services

```bash
cd /opt/pops
docker compose down
```

## Step 5: Extract and Restore Data

```bash
# Extract the archive
mkdir -p /tmp/pops-restore/extracted
tar xf /tmp/pops-restore/pops-backup.tar -C /tmp/pops-restore/extracted

# Restore SQLite database
cp /tmp/pops-restore/extracted/pops-backup.db /opt/pops/data/sqlite/pops.db

# Restore Paperless data
rsync -av /tmp/pops-restore/extracted/paperless/ /opt/pops/data/paperless/

# Restore Metabase data
rsync -av /tmp/pops-restore/extracted/metabase/ /opt/pops/data/metabase/
```

### Volume Paths

| Data            | Host Path                       | Docker Volume          |
| --------------- | ------------------------------- | ---------------------- |
| SQLite database | `/opt/pops/data/sqlite/pops.db` | `pops-sqlite-data`     |
| Paperless data  | `/opt/pops/data/paperless/`     | `pops-paperless-data`  |
| Paperless media | (included in paperless data)    | `pops-paperless-media` |
| Metabase data   | `/opt/pops/data/metabase/`      | `pops-metabase-data`   |

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

Docker Compose handles service ordering. The only dependency is `paperless-redis` starting before `paperless-ngx`.

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
8. **Verify Cloudflare Tunnel** — check `https://pops.jmiranda.dev` is accessible

## Troubleshooting

| Symptom                  | Fix                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| `age: could not decrypt` | Wrong passphrase. Check Ansible Vault for the correct value                                       |
| API health check fails   | Check logs: `docker logs pops-api --tail 50`. Likely missing secrets or SQLite file               |
| Paperless won't start    | Ensure `paperless-redis` is running first. Check Redis connectivity                               |
| Metabase shows no data   | SQLite volume may not be mounted correctly. Verify `/data/sqlite/pops.db` exists in the container |
| Cloudflare Tunnel down   | Verify `cloudflared` container is running and tunnel token is correct                             |
| Backup timer not running | `sudo systemctl enable --now pops-backup.timer` then `systemctl status pops-backup.timer`         |
