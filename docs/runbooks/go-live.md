# Go-Live Runbook

Step-by-step procedure for transitioning from a dev database to production data on the N95 mini PC.

## Prerequisites

Before starting, verify all of the following:

- [ ] Backblaze B2 backup is configured and tested (rclone encrypted sync)
- [ ] Drizzle is the sole migration system (manual SQL migrations frozen — PRD-060 US-01)
- [ ] Production guards are active (`db:init`, `db:seed`, `db:clear` refuse to run when `NODE_ENV=production` — PRD-060 US-02)
- [ ] Pre-migration backup is working (VACUUM INTO before migrations — PRD-060 US-03)
- [ ] All pending migrations apply cleanly to a seeded test database
- [ ] `.env` on the N95 has correct values (Up API token, TMDB key, Plex URL/token, Claude API key)
- [ ] Ansible vault is up to date (`mise ansible:view` to confirm)

## Step 1: Deploy Fresh

```bash
# 1. Start with a fresh database (last time you will ever run this)
mise db:init

# 2. Set production mode (activates guards)
# In .env or Docker Compose environment:
NODE_ENV=production

# 3. Deploy
mise ansible:deploy
# or for local Docker:
mise docker:up
```

## Step 2: Import Data via UI

All bank imports go through the Import Wizard in the app (PRD-020). No CLI import scripts.

1. Open the app → Finance → Import
2. Upload CSV files one at a time (oldest account first):
   - ANZ Everyday
   - Amex
   - ING
   - Up Bank (if CSV — Up webhook handles ongoing imports automatically)
3. For each import:
   - Upload the CSV
   - Verify column mapping (auto-detected for supported banks)
   - Review transactions — check entity matching, resolve uncertain matches
   - Approve and execute the import
4. After all imports, review the entity list — merge duplicates, fix mismatches

## Step 3: Verification

```bash
# Show database statistics
mise audit
```

Check the following:

- [ ] Transaction count matches expected total across all bank accounts
- [ ] Entity count is reasonable (no duplicates, no missing major merchants)
- [ ] No orphaned transactions (every transaction has an entity match or is explicitly uncategorised)
- [ ] Spot check: pick 5 recent transactions from each account — amounts and dates match bank statements

## Step 4: Verify Guards and Backup

1. Verify guards are active:
   ```bash
   # These should all fail with a clear error
   mise db:init     # Expected: "Refusing to run against production database"
   mise db:seed     # Expected: "Refusing to run against production database"
   mise db:clear    # Expected: "Refusing to run against production database"
   ```

2. Take a manual backup:
   ```bash
   sqlite3 /opt/pops/data/pops.db "VACUUM INTO '/opt/pops/backups/pops-go-live-$(date +%Y%m%d).db';"
   ```

**After this point, never run `db:init`, `db:seed`, or `db:clear` again on this database.**

## Step 5: Ongoing Operations

### Schema Changes (the normal workflow)

```bash
# 1. Edit Drizzle schema in packages/db-types/src/schema/
# 2. Generate migration
pnpm --filter @pops/db-types exec drizzle-kit generate

# 3. Review the generated SQL in apps/pops-api/src/db/drizzle-migrations/
# 4. Commit the schema change + migration
# 5. Deploy (Ansible or Docker Compose rebuild)
# 6. Migrations apply automatically on server startup
```

### Adding Bank Data

- **Up Bank**: ongoing via webhook — automatic, no action needed
- **CSV imports (ANZ, Amex, ING)**: use the Import Wizard in the app (Finance → Import). Upload the CSV, review, approve.

### Routine Maintenance

```bash
# Check database stats
mise audit

# Rebuild entity lookup cache after adding new entities
mise entities:lookup

# Check backup status
rclone ls b2:pops-backups/
```

## Step 6: Emergency Recovery

If something goes wrong (bad migration, data corruption, accidental deletion):

### From Pre-Migration Backup

If a migration just failed, the pre-migration backup is at `{DB_PATH}.pre-migration-{timestamp}.bak`:

```bash
# 1. Stop all services
mise docker:down

# 2. Find the backup
ls -la /opt/pops/data/pops.db.pre-migration-*.bak

# 3. Replace the database
cp /opt/pops/data/pops.db.pre-migration-TIMESTAMP.bak /opt/pops/data/pops.db

# 4. Restart services
mise docker:up
```

### From Backblaze B2 Backup

For older backups or when no pre-migration backup exists:

```bash
# 1. Stop all services
mise docker:down

# 2. List available backups
rclone ls b2:pops-backups/

# 3. Restore the most recent good backup
rclone copy b2:pops-backups/pops-YYYYMMDD.db /opt/pops/data/pops.db

# 4. Restart services (pending migrations will re-apply)
mise docker:up

# 5. Verify data integrity
mise audit
```

## Command Reference

| Command | Safety | When to use |
|---------|--------|------------|
| `mise dev` | Safe | Local development |
| `mise test` | Safe | Run test suite |
| `mise build` | Safe | Build all packages |
| `mise typecheck` | Safe | Type checking |
| `mise lint` | Safe | Linting |
| `mise audit` | Safe | Check database stats |
| `mise entities:lookup` | Safe | Rebuild entity cache |
| `mise docker:up` | Safe | Start/restart services |
| `mise docker:down` | Safe | Stop services |
| `mise ansible:deploy` | Careful | Deploy to N95 |
| `drizzle-kit generate` | Careful | Generate schema migration |
| `drizzle-kit migrate` | Careful | Apply pending migrations (prefer auto-apply on startup) |
| `mise import:*` | Careful | Import bank data (idempotent, but verify first) |
| `mise db:init` | **Destructive** | First-time setup only — never after go-live |
| `mise db:seed` | **Destructive** | Dev/test only — never after go-live |
| `mise db:clear` | **Destructive** | Dev/test only — never after go-live |
