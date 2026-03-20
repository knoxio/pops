# Deployment Setup Checklist

⚠️ **CRITICAL SECURITY WARNING** ⚠️

**Self-hosted runners are NOT SAFE with public repositories.**

Before proceeding, you MUST choose one:

1. **Make repository private** (RECOMMENDED)
   - Settings → Change visibility → Make private
   - Then follow this guide

2. **Keep repo public, use manual deployment only**
   - Already configured (workflow_dispatch only)
   - Never enable automatic deployment
   - See docs/SECURITY_WARNING.md

**Read docs/SECURITY_WARNING.md before proceeding.**

---

## Prerequisites

- [ ] N95 server is provisioned and accessible
- [ ] SSH access to N95 configured
- [ ] Ansible installed locally
- [ ] Docker and Docker Compose running on N95

## Step 1: Choose Deployment Method

Choose **one** of these methods:

### Option A: Self-Hosted Runner (Recommended) ✅

**Advantages:**
- No network configuration needed
- Most secure (no exposed services)
- Fast deployment
- Simple setup

**Setup:**

1. Get runner registration token:
   - Go to: https://github.com/joaopcmiranda/pops/settings/actions/runners/new
   - Copy the token (starts with `A...`)

2. SSH to N95:
   ```bash
   ssh -p 2222 pops@pops.local
   ```

3. Download and run setup script:
   ```bash
   cd /tmp
   curl -o setup-runner.sh https://raw.githubusercontent.com/joaopcmiranda/pops/main/scripts/setup-github-runner.sh
   chmod +x setup-runner.sh
   ./setup-runner.sh <GITHUB_TOKEN>
   ```

4. Verify runner is online:
   - Check: https://github.com/joaopcmiranda/pops/settings/actions/runners
   - Should show "Idle" status

5. Test deployment:
   ```bash
   # From local machine
   git commit --allow-empty -m "test: trigger deployment"
   git push origin main
   ```

6. Monitor logs on N95:
   ```bash
   sudo journalctl -u actions.runner.* -f
   ```

**Done!** No GitHub secrets needed.

---

### Option B: Tailscale VPN

**Use this if you can't run self-hosted runner.**

1. Install Tailscale on N95:
   ```bash
   curl -fsSL https://tailscale.com/install.sh | sh
   sudo tailscale up
   ```

2. Get Tailscale IP:
   ```bash
   tailscale ip -4
   # Note this IP (e.g., 100.x.x.x)
   ```

3. Update Ansible inventory:
   ```yaml
   # infra/ansible/inventory/hosts.yml
   n95:
     ansible_host: 100.x.x.x  # Your Tailscale IP
     ansible_port: 22
   ```

4. Create Tailscale OAuth client:
   - Go to: https://login.tailscale.com/admin/settings/oauth
   - Create new OAuth client with tag `tag:ci`
   - Save Client ID and Secret

5. Add GitHub secrets:
   - `TAILSCALE_OAUTH_CLIENT_ID`
   - `TAILSCALE_OAUTH_SECRET`
   - `N95_SSH_KEY` (contents of `~/.ssh/pops_n95`)
   - `N95_HOST` (Tailscale IP from step 2)
   - `N95_USER` (`pops`)
   - `ANSIBLE_VAULT_PASSWORD`

6. Update `.github/workflows/deploy.yml`:
   ```yaml
   deploy:
     runs-on: ubuntu-latest  # Change from self-hosted

     steps:
       - name: Connect to Tailscale
         uses: tailscale/github-action@v2
         with:
           oauth-client-id: ${{ secrets.TAILSCALE_OAUTH_CLIENT_ID }}
           oauth-secret: ${{ secrets.TAILSCALE_OAUTH_SECRET }}
           tags: tag:ci

       # ... rest of deployment steps
   ```

---

## Step 2: Update Secrets Management

The new Cloudflare JWT authentication requires additional secrets in Ansible vault.

1. Edit vault file:
   ```bash
   ansible-vault edit infra/ansible/inventory/group_vars/pops_servers/vault.yml
   ```

2. Add Cloudflare configuration:
   ```yaml
   # Add these lines
   cloudflare_access_team_name: your-team-name
   cloudflare_access_aud: your-app-audience-tag
   ```

3. Get Cloudflare values:
   - Team name: Found in Cloudflare Zero Trust dashboard URL (`https://<team-name>.cloudflareaccess.com`)
   - Application AUD: Found in Access application settings → Overview → Application Audience (AUD) Tag

4. Commit vault changes (encrypted):
   ```bash
   git add infra/ansible/inventory/group_vars/pops_servers/vault.yml
   git commit -m "chore: add cloudflare access configuration"
   ```

## Step 3: Update Environment Variables

The pops-api now uses JWT instead of API keys.

1. Check variables file:
   ```bash
   cat infra/ansible/inventory/group_vars/pops_servers/vars.yml
   ```

2. Remove old API key variables (if present):
   ```yaml
   # DELETE THESE:
   finance_api_key_file: /run/secrets/finance_api_key
   ```

3. Ensure Cloudflare variables are referenced:
   ```yaml
   # ENSURE THESE EXIST:
   cloudflare_access_team_name: "{{ vault_cloudflare_access_team_name }}"
   cloudflare_access_aud: "{{ vault_cloudflare_access_aud }}"
   ```

## Step 4: Update Docker Compose Template

The Ansible template needs Cloudflare environment variables.

1. Edit template:
   ```bash
   vim infra/ansible/roles/pops-deploy/templates/docker-compose.yml.j2
   ```

2. Update pops-api service:
   ```yaml
   pops-api:
     environment:
       CLOUDFLARE_ACCESS_TEAM_NAME: "{{ cloudflare_access_team_name }}"
       CLOUDFLARE_ACCESS_AUD: "{{ cloudflare_access_aud }}"
   ```

3. Remove old secrets:
   ```yaml
   # DELETE from secrets section:
   secrets:
     - finance_api_key  # Remove this
   ```

## Step 5: Test Deployment

1. Make a small change:
   ```bash
   # Add a comment somewhere
   git commit -am "test: verify deployment pipeline"
   git push origin main
   ```

2. Watch GitHub Actions:
   - Go to: https://github.com/joaopcmiranda/pops/actions
   - Should see "Deploy to Production" running

3. Monitor on N95 (if self-hosted):
   ```bash
   ssh -p 2222 pops@pops.local
   cd /opt/pops
   docker compose ps
   docker compose logs -f pops-api
   ```

4. Verify health:
   ```bash
   # From N95
   curl http://localhost:3000/health
   # Should return: {"status":"ok"}
   ```

5. Check PWA:
   - Open: https://pops.jmiranda.dev
   - Should load with dark theme
   - Check browser console for errors

## Step 6: Configure Cloudflare Tunnel

If not already set up:

1. Install cloudflared on N95:
   ```bash
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

2. Authenticate:
   ```bash
   cloudflared tunnel login
   ```

3. Create tunnel:
   ```bash
   cloudflared tunnel create pops-n95
   ```

4. Configure tunnel:
   ```yaml
   # ~/.cloudflared/config.yml
   tunnel: pops-n95
   credentials-file: /home/pops/.cloudflared/<tunnel-id>.json

   ingress:
     - hostname: pops.jmiranda.dev
       service: http://localhost:80
     - service: http_status:404
   ```

5. Run as service:
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   ```

## Step 7: Configure Cloudflare Access

1. Go to Zero Trust dashboard: https://one.dash.cloudflare.com

2. Create Access application:
   - Name: POPS
   - Application domain: pops.jmiranda.dev
   - Session duration: 24 hours

3. Add policy:
   - Policy name: Allow owner
   - Action: Allow
   - Include: Emails → your-email@example.com

4. Copy Application AUD tag (used in Step 2)

## Verification Checklist

After setup complete:

- [ ] GitHub runner shows "Idle" (self-hosted) or secrets configured (Tailscale)
- [ ] Ansible vault contains Cloudflare credentials
- [ ] Docker compose template references Cloudflare env vars
- [ ] Test deployment triggered and passed
- [ ] Health endpoint responds: `curl http://localhost:3000/health`
- [ ] PWA loads at https://pops.jmiranda.dev
- [ ] Cloudflare Access login required
- [ ] After login, dashboard visible

## Troubleshooting

### Runner not starting

```bash
# Check service status
sudo systemctl status actions.runner.*

# Check logs
sudo journalctl -u actions.runner.* -n 50

# Restart service
sudo systemctl restart actions.runner.*
```

### Deployment fails

```bash
# Check Ansible can reach host
ansible pops_servers -i infra/ansible/inventory/hosts.yml -m ping

# Test Ansible playbook
cd ansible
ansible-playbook playbooks/deploy.yml -i inventory/hosts.yml --check

# Run with verbose output
ansible-playbook playbooks/deploy.yml -i inventory/hosts.yml -vvv
```

### Services not starting

```bash
# Check Docker logs
cd /opt/pops
docker compose logs --tail=100

# Rebuild from scratch
docker compose down -v
docker compose up -d --build

# Check disk space
df -h
docker system df
```

### Cloudflare Access issues

```bash
# Test JWT validation
curl -H "Cf-Access-Jwt-Assertion: <token>" http://localhost:3000/trpc/budgets.list

# Check environment variables
docker exec pops-api env | grep CLOUDFLARE
```

## Rollback Plan

If deployment breaks production:

1. SSH to N95:
   ```bash
   ssh -p 2222 pops@pops.local
   cd /opt/pops/repo
   ```

2. Checkout previous working commit:
   ```bash
   git log --oneline -10  # Find working commit
   git checkout <commit-hash>
   ```

3. Redeploy:
   ```bash
   cd /opt/pops
   ansible-playbook infra/ansible/playbooks/deploy.yml -i infra/ansible/inventory/hosts.yml
   ```

4. Verify:
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

## Maintenance

### Update runner

```bash
cd /opt/pops/actions-runner
sudo ./svc.sh stop
# Download new version
curl -o actions-runner-linux-x64-<version>.tar.gz -L <url>
tar xzf actions-runner-linux-x64-<version>.tar.gz
sudo ./svc.sh start
```

### Rotate secrets

1. Update Ansible vault:
   ```bash
   ansible-vault edit infra/ansible/inventory/group_vars/pops_servers/vault.yml
   ```

2. Redeploy:
   ```bash
   ansible-playbook playbooks/deploy.yml -i inventory/hosts.yml
   ```

3. Restart services:
   ```bash
   docker compose restart
   ```

## Next Steps

After deployment is working:

- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Configure backup automation (rclone to Backblaze)
- [ ] Add deployment notifications (Slack/Discord)
- [ ] Set up log aggregation
- [ ] Configure SSL certificate auto-renewal
