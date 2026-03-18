# POPS — Personal Operations System

A unified platform for financial tracking, asset management, budgeting, AI-powered automation, and reporting. Self-hosted on an N95 mini PC with SQLite as the source of truth, AI-powered categorization, and Cloudflare Tunnel for secure access.

## Quick Deploy

Deploy everything to production with one command:

```bash
./deploy.sh
```

The script will:
- ✅ Run quality checks (typecheck + tests)
- ✅ Deploy to N95 via Ansible
- ✅ Rebuild Docker images
- ✅ Restart services
- ✅ Create git tag (v1, v2, v3, etc.)
- ✅ Push tag to GitHub

**Options:**
```bash
./deploy.sh --dry-run      # Preview changes
./deploy.sh -v             # Verbose output
./deploy.sh --skip-checks  # Skip tests (faster)
```

**Prerequisites:**
- Ansible: `brew install ansible`
- SSH key: `~/.ssh/pops_n95`
- Vault password: `~/.ansible/pops-vault-password`

See `docs/DEPLOYMENT_SETUP.md` for setup instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      INTERFACES                         │
│  iPhone (PWA)  │  Telegram (Moltbot)  │  Web (Metabase) │
└────────────────────────┬────────────────────────────────┘
                         │
                 Cloudflare Tunnel
                         │
┌────────────────────────┴────────────────────────────────┐
│                 N95 MINI PC (Docker)                     │
│                                                         │
│  finance-api ─── Node.js REST over SQLite               │
│  metabase ────── Dashboards & analytics                 │
│  moltbot ─────── AI assistant (Telegram + finance)      │
│  paperless-ngx ─ Receipt archive + OCR                  │
│  pops-pwa ────── React PWA (budget, wishlist, txns)     │
└─────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                      DATA LAYER                         │
│                                                         │
│  SQLite (SoT)            │  Claude Haiku API             │
│  ├─ Balance Sheet        │  (categorization, NL queries, │
│  ├─ Entities             │   AI fallback) ~$1-5/month    │
│  ├─ Home Inventory       │                               │
│  ├─ Budget               │                               │
│  └─ Wish List            │                               │
└─────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────┐
│                     BANK FEEDS                          │
│  Up API (webhooks) │ ANZ CSV │ Amex CSV │ ING CSV       │
│  Import scripts (Node.js) + Claude Haiku fallback       │
│  Rule-based matching → AI fallback → cache new mappings │
└─────────────────────────────────────────────────────────┘
```

### Key Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Source of truth | SQLite | Fast local queries, full control, no API rate limits |
| AI provider | Claude Haiku API | Cents/month for this workload |
| Chat interface | Telegram (Moltbot) | Cross-platform, pragmatic |
| Dashboards | Metabase (self-hosted) | Open-source, Docker, SQLite-compatible |
| Receipt storage | Paperless-ngx | Mature, self-hosted, OCR built-in |
| Mobile app | PWA | No App Store, installs to home screen |

## Phases

| Phase | Target | Description | Status |
|---|---|---|---|
| 0 — Data Import | Feb 2026 | All bank accounts imported to SQLite database | **Done** |
| 1 — Foundation | Mar 2026 | Infrastructure, SQLite-only architecture, AI imports | **In Progress** |
| 2 — Intelligence | Apr 2026 | Moltbot, dashboards, proactive alerts | Not Started |
| 3 — Receipts & Inventory | May 2026 | Document management, receipt OCR, inventory linking | Not Started |
| 4 — Mobile | Jun 2026 | PWA, quick-add, push notifications | Not Started |
| 5 — Polish | Jul+ 2026 | Net worth, investments, super, reporting | Not Started |

## Goals

1. **Automated data pipeline** — Bank transactions flow into SQLite with minimal manual intervention. AI handles categorization, entity matching, and deduplication.
2. **Proactive financial assistant** — Moltbot monitors spending, sends alerts via Telegram, answers natural language queries.
3. **Budgeting system** — Envelope-style budgets with real-time tracking per category.
4. **Wish list & planned purchases** — Tiered purchase planning with saving progress tracking.
5. **Receipt & asset lifecycle** — Purchases get ID'd, labeled, receipt archived, linked to transaction and Home Inventory.
6. **Accountant-ready reporting** — One-command FY tax reports with deductible items, categorized expenses, income summary.
7. **Net worth visibility** — Dashboard combining account balances, asset values, super, and liabilities.
8. **Mobile access** — PWA for on-the-go budget checks, quick expense entry, receipt capture.

## Infrastructure

### N95 Mini PC (POPS Server)
- **OS:** Ubuntu 24.04 (Docker Compose, provisioned via Ansible)
- **Services:** finance-api, metabase, moltbot, paperless-ngx, pops-pwa
- **Exposure:** Cloudflare Tunnel (free, zero port forwarding)
- **URLs:** `pops.jmiranda.dev` (PWA), `pops-api.jmiranda.dev` (API), `pops-metabase.jmiranda.dev`, `pops-paperless.jmiranda.dev`

### External Services
- **Cloudflare Tunnel** — Secure exposure, free
- **Claude Haiku API** — Transaction categorization, NL queries (~$1-5/month)
- **Up Bank API** — Real-time transaction webhooks (free)
- **Telegram** — Moltbot messaging interface (free)

## Tech Stack

- **Runtime:** Node.js
- **Database:** SQLite (source of truth)
- **Frontend:** React PWA
- **Dashboards:** Metabase
- **AI:** Claude Haiku API
- **Infra:** Docker Compose, Cloudflare Tunnel
- **OCR:** Paperless-ngx
- **Chat:** Moltbot (Telegram)

## Active Bank Accounts

| Account | Type | Data Source | Automation |
|---|---|---|---|
| ANZ Everyday | Checking | CSV export | Manual download |
| ANZ Frequent Flyer Black | Credit Card | CSV export | Manual download |
| Amex | Credit Card | CSV export | Manual download |
| Up Checking / Piggy | Checking + Savings | Up Bank API | Fully automatable (webhooks) |
| ING Everyday / Loan | Checking + Personal Loan | CSV export | Manual download |

## Development Workflow

### CI/CD Pipeline

All code changes are validated automatically via GitHub Actions before merge:

#### Ansible CI
- **YAML Linting** - Validates YAML syntax and formatting (`yamllint`)
- **Ansible Linting** - Enforces best practices (`ansible-lint` production profile)
- **Syntax Checking** - Validates playbook syntax (all playbooks in matrix)
- **Security Scanning** - Checks for hardcoded secrets and vault encryption
- **Best Practices** - Validates FQCN usage, become patterns, minimal shell usage

See [infra/ansible/README.md](infra/ansible/README.md) for detailed Ansible documentation.

### Pre-commit Hooks

Install pre-commit hooks to run quality checks locally before committing:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files
```

Hooks include:
- `yamllint` - YAML syntax and formatting
- `ansible-lint` - Ansible best practices
- `detect-secrets` - Hardcoded credentials detection
- `check-yaml` - YAML syntax validation
- `trailing-whitespace` - Trailing whitespace removal
- `end-of-file-fixer` - Ensure files end with newline
- `check-added-large-files` - Prevent large file commits

### Task Runner (mise)

POPS uses [mise](https://mise.jdx.dev/) for task running and tool version management.

**Installation:**
```bash
curl https://mise.run | sh
echo 'eval "$(/Users/helix/.local/bin/mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

**Common Tasks:**
```bash
mise dev              # Run all dev servers
mise dev:api          # Run finance-api only
mise dev:pwa          # Run pops-pwa only

mise test             # Run all tests
mise typecheck        # Type check all packages
mise build            # Build all packages

mise setup            # Initial project setup
mise tasks            # List all available tasks
```

**Database Management:**
```bash
mise db:init          # Initialize empty database with schema
mise db:clear         # Clear all data (preserves schema)
mise db:seed          # Seed with comprehensive test data
```

See `mise.toml` for all available tasks and [CLAUDE.md](CLAUDE.md) for detailed command reference.

### E2E Testing

POPS uses Playwright for end-to-end tests with two modes:

- **Mocked** — fast, no real API/DB, suitable for UI logic tests
- **Integration** — real SQLite DB via the named env system, no Notion/Claude calls

```bash
# Run all E2E tests
cd apps/pops-pwa && yarn test:e2e

# Run in UI mode (interactive)
cd apps/pops-pwa && yarn test:e2e --ui
```

The `globalSetup` creates an isolated `e2e` named environment (seeded SQLite DB) before the run. Tests route through `?env=e2e` so they hit real data without touching production. `globalTeardown` deletes the env after the run.

Named envs auto-skip external API calls (Notion, Claude) — safe to run in CI without real credentials.

### Local Development Setup

```bash
# Install Ansible tools
pip install -r infra/ansible/requirements.txt

# Install Ansible Galaxy collections
ansible-galaxy collection install community.general
ansible-galaxy collection install community.docker

# Run Ansible linting locally
yamllint infra/ansible/
ansible-lint infra/ansible/

# Syntax check playbooks
cd infra/ansible
ansible-playbook --syntax-check playbooks/site.yml
```
