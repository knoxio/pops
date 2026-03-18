# POPS Deployment Guide

## Overview

POPS uses a hybrid deployment approach:
- **GitHub Actions** runs quality checks and triggers deployment
- **Ansible** handles actual deployment to the N95 server
- **Docker Compose** manages all services

## Deployment Flow

```
Push to main → Quality Checks → SSH to N95 → Ansible deploy.yml → Docker rebuild → Services restart
```

## Network Architecture Options

The N95 server is on a local network (`pops.local`). For GitHub Actions to deploy, choose one of these approaches:

### Option 1: Self-Hosted GitHub Runner (Recommended)

Run GitHub Actions runner on the N95 itself.

**Pros:**
- No port forwarding or VPN needed
- Secure (no public SSH access)
- Fast (no network latency)
- Simple setup

**Cons:**
- Runner consumes N95 resources during builds
- Requires keeping runner service up

**Setup:**
```bash
# On N95 server
cd /opt/pops
mkdir -p actions-runner && cd actions-runner

# Download latest runner
curl -o actions-runner-linux-x64-2.313.0.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.313.0/actions-runner-linux-x64-2.313.0.tar.gz

tar xzf ./actions-runner-linux-x64-2.313.0.tar.gz

# Configure runner (use repo PAT token)
./config.sh --url https://github.com/joaopcmiranda/pops --token <RUNNER_TOKEN>

# Install as systemd service
sudo ./svc.sh install
sudo ./svc.sh start
```

Then update `.github/workflows/deploy.yml`:
```yaml
deploy:
  runs-on: self-hosted  # Change from ubuntu-latest
```

### Option 2: Tailscale VPN

Use Tailscale to create secure network connection.

**Pros:**
- GitHub Actions can reach N95 securely
- No port forwarding
- Works from anywhere

**Cons:**
- Requires Tailscale account
- Additional dependency

**Setup:**
```bash
# On N95
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Get Tailscale IP
tailscale ip -4
```

Update `infra/ansible/inventory/hosts.yml`:
```yaml
n95:
  ansible_host: 100.x.x.x  # Tailscale IP
  ansible_port: 22
```

Add Tailscale auth to GitHub Actions:
```yaml
- name: Connect to Tailscale
  uses: tailscale/github-action@v2
  with:
    oauth-client-id: ${{ secrets.TAILSCALE_OAUTH_CLIENT_ID }}
    oauth-secret: ${{ secrets.TAILSCALE_OAUTH_SECRET }}
    tags: tag:ci
```

### Option 3: Port Forwarding + Dynamic DNS

Expose SSH on public internet (not recommended).

**Pros:**
- Simple for single server

**Cons:**
- Security risk (exposed SSH)
- Requires router configuration
- Requires dynamic DNS or static IP

**Not recommended for personal financial data.**

## GitHub Secrets Setup

Configure these secrets in GitHub repo settings → Secrets and variables → Actions:

### Required Secrets

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `N95_SSH_KEY` | SSH private key | `cat ~/.ssh/pops_n95` |
| `N95_HOST` | Server hostname/IP | `pops.local` or Tailscale IP |
| `N95_USER` | SSH username | `pops` |
| `ANSIBLE_VAULT_PASSWORD` | Vault password | `cat ~/.ansible/pops-vault-password` |

### For Self-Hosted Runner

No secrets needed - runner has local access.

### For Tailscale

Additional secrets:
- `TAILSCALE_OAUTH_CLIENT_ID`
- `TAILSCALE_OAUTH_SECRET`

## Manual Deployment

If automated deployment isn't set up yet, deploy manually:

```bash
# From your local machine
cd infra/ansible
ansible-playbook playbooks/deploy.yml \
  -i inventory/hosts.yml \
  --vault-password-file ~/.ansible/pops-vault-password
```

## Rollback

If deployment fails:

```bash
# SSH to N95
ssh -p 2222 pops@pops.local

# Check logs
cd /opt/pops
docker compose logs -f

# Rollback to previous version
git checkout <previous-commit>
docker compose down
docker compose up -d
```

## Monitoring Deployment

### GitHub Actions

- View deployment progress: https://github.com/joaopcmiranda/pops/actions
- Check deployment status in pull request checks

### Server Logs

```bash
# SSH to N95
ssh -p 2222 pops@pops.local

# View service logs
cd /opt/pops
docker compose logs -f finance-api
docker compose logs -f pops-pwa
docker compose logs -f metabase

# Check service health
docker compose ps
curl http://localhost:3000/health
```

## Deployment Triggers

Deployment happens automatically on:
- Push to `main` branch
- Changes to `apps/**`, `infra/ansible/**`, or `infra/docker-compose.yml`

Manual deployment:
- Go to Actions → Deploy to Production → Run workflow

## Environment Variables

Production environment variables are managed via Ansible Vault:
- `infra/ansible/inventory/group_vars/pops_servers/vault.yml` (encrypted)

After updating vault variables:
```bash
ansible-playbook playbooks/deploy.yml -i inventory/hosts.yml
```

## Build Process

Each service builds separately:

1. **finance-api**:
   - TypeScript → JavaScript compilation
   - Docker image build
   - ~50MB final image

2. **pops-pwa**:
   - Vite production build
   - Static assets optimized
   - Served via nginx
   - ~10MB final image

## Health Checks

Services expose health endpoints:

```bash
# finance-api
curl http://localhost:3000/health
# Expected: {"status":"ok"}

# Check Docker health
docker compose ps
# All services should show "healthy" or "running"
```

## Deployment Checklist

Before deploying:
- [ ] All tests pass locally
- [ ] TypeScript compiles without errors
- [ ] Docker build succeeds locally
- [ ] Environment variables updated in Ansible vault
- [ ] Database migrations completed (if any)

After deploying:
- [ ] Check GitHub Actions passed
- [ ] Verify services running: `docker compose ps`
- [ ] Check health endpoints
- [ ] Test critical user flows
- [ ] Monitor logs for errors: `docker compose logs -f`

## Troubleshooting

### Deployment fails at SSH step

```bash
# Verify SSH key is correct
ssh-keygen -y -f ~/.ssh/pops_n95

# Test SSH connection
ssh -p 2222 pops@pops.local
```

### Ansible playbook fails

```bash
# Run with verbose output
ansible-playbook playbooks/deploy.yml -vvv

# Check Ansible vault password
ansible-vault view inventory/group_vars/pops_servers/vault.yml
```

### Docker build fails

```bash
# SSH to N95
cd /opt/pops/repo

# Check Docker logs
docker compose build --no-cache finance-api
docker compose logs finance-api
```

### Services won't start

```bash
# Check Docker resources
docker system df
docker system prune -a  # Free up space if needed

# Restart Docker daemon
sudo systemctl restart docker

# Rebuild and restart
docker compose down
docker compose up -d --build
```

## Production Differences from Development

| Aspect | Development | Production |
|--------|-------------|-----------|
| **Build** | Local Vite dev server | Production build + nginx |
| **Database** | Local SQLite | Docker volume (persistent) |
| **Secrets** | `.env` files | Ansible Vault → Docker secrets |
| **Auth** | Mock or disabled | Cloudflare Access (full JWT) |
| **Sync** | Manual | Systemd timer (15min) |
| **Monitoring** | Console logs | Docker logs + future monitoring |

## Next Steps

1. Choose network architecture (self-hosted runner recommended)
2. Set up GitHub secrets
3. Test deployment workflow
4. Set up monitoring (future: Prometheus + Grafana)
5. Configure Cloudflare Tunnel + Access
