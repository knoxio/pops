# Ansible Infrastructure

Infrastructure-as-code for POPS (Personal Operations System) deployment on N95 mini PC running Ubuntu 24.04.

## Directory Structure

```
ansible/
├── ansible.cfg                 # Ansible configuration
├── inventory/
│   ├── hosts.yml              # Inventory file
│   └── group_vars/
│       └── pops_servers/
│           ├── vars.yml       # Group variables
│           └── vault.yml      # Encrypted secrets (Ansible Vault)
├── playbooks/
│   ├── site.yml              # Full provision + deploy
│   ├── deploy.yml            # Deploy/update services only
│   └── bootstrap.yml         # Initial bootstrap
└── roles/
    ├── common/               # OS hardening, SSH, UFW, fail2ban
    ├── docker/               # Docker Engine installation
    ├── secrets/              # Secret file provisioning
    ├── pops-deploy/          # Docker Compose deployment
    ├── cloudflare-tunnel/    # Cloudflare Tunnel setup
    ├── backups/              # Rclone + Backblaze B2 backups
    └── monitoring/           # Health checks and monitoring
```

## Playbooks

### site.yml
Full provision and deployment. Run on a fresh Ubuntu 24.04 machine.

```bash
ansible-playbook ansible/playbooks/site.yml
```

**Roles executed:**
1. `common` - OS hardening, SSH lockdown, UFW firewall, fail2ban
2. `docker` - Install Docker Engine and Docker Compose
3. `secrets` - Deploy secret files from Ansible Vault to `/opt/pops/secrets/`
4. `pops-deploy` - Deploy Docker Compose stack
5. `cloudflare-tunnel` - Configure Cloudflare Tunnel for Zero Trust access
6. `backups` - Set up automated encrypted backups to Backblaze B2
7. `monitoring` - Install health check scripts and monitoring

### deploy.yml
Deploy or update services only. Skips OS hardening.

```bash
ansible-playbook ansible/playbooks/deploy.yml
```

**Roles executed:**
1. `secrets` - Update secret files
2. `pops-deploy` - Update and restart Docker Compose stack

### bootstrap.yml
Initial bootstrap playbook (if different from site.yml - create as needed).

## Local Development

### Prerequisites

```bash
# Install Ansible and linting tools
pip install -r requirements.txt

# Install required Ansible Galaxy collections
ansible-galaxy collection install community.general
ansible-galaxy collection install community.docker
```

### Vault Password

Store your vault password in `~/.ansible/pops-vault-password` (gitignored).

```bash
echo "your-vault-password" > ~/.ansible/pops-vault-password
chmod 600 ~/.ansible/pops-vault-password
```

### Running Playbooks

```bash
# Syntax check
ansible-playbook ansible/playbooks/site.yml --syntax-check

# Dry run (check mode)
ansible-playbook ansible/playbooks/site.yml --check

# Full run
ansible-playbook ansible/playbooks/site.yml

# Limit to specific host
ansible-playbook ansible/playbooks/site.yml --limit pops-n95

# Run specific tags
ansible-playbook ansible/playbooks/site.yml --tags docker,deploy
```

## CI/CD

The Ansible code is automatically validated on every push and pull request via GitHub Actions.

### CI Pipeline Stages

1. **YAML Lint** - Validates YAML syntax and formatting with `yamllint`
2. **Ansible Lint** - Enforces Ansible best practices with `ansible-lint` (production profile)
3. **Syntax Check** - Validates playbook syntax with `ansible-playbook --syntax-check` (matrix: all playbooks)
4. **Security Check** - Scans for hardcoded secrets and ensures vault files are encrypted
5. **Best Practices** - Checks for proper `become` usage, FQCN, and minimal shell module usage

### Running CI Checks Locally

```bash
# YAML linting
yamllint ansible/

# Ansible linting
ansible-lint ansible/

# Syntax check all playbooks
ansible-playbook --syntax-check ansible/playbooks/site.yml
ansible-playbook --syntax-check ansible/playbooks/deploy.yml
ansible-playbook --syntax-check ansible/playbooks/bootstrap.yml
```

## Secrets Management

All secrets are stored in `ansible/inventory/group_vars/pops_servers/vault.yml` and encrypted with Ansible Vault.

### Encrypting Secrets

```bash
ansible-vault encrypt ansible/inventory/group_vars/pops_servers/vault.yml
```

### Editing Encrypted Files

```bash
ansible-vault edit ansible/inventory/group_vars/pops_servers/vault.yml
```

### Viewing Encrypted Files

```bash
ansible-vault view ansible/inventory/group_vars/pops_servers/vault.yml
```

## Best Practices

### Implemented

- **FQCN** (Fully Qualified Collection Names) - All modules use `ansible.builtin.*`, `community.general.*`, etc.
- **Idempotency** - All tasks can be run multiple times without side effects
- **Privilege Escalation** - Use `become: true` instead of direct `sudo`
- **Secrets** - No hardcoded passwords; all secrets in Ansible Vault
- **Validation** - Templates validate before deployment (e.g., `sshd -t -f %s`)
- **Handlers** - Service restarts triggered only on config changes
- **Linting** - All code passes `ansible-lint` production profile

### Code Style

- 2-space indentation
- `---` document start for all YAML files
- Task names in sentence case with descriptive text
- Variables in `snake_case`
- Role names in `kebab-case`
- Max line length: 160 characters
- YAML over JSON for all config files

## Roles

### common
OS hardening and security baseline.

**Tasks:**
- Update apt cache
- Install common packages (fail2ban, ufw, unattended-upgrades, etc.)
- Set timezone
- Harden SSH (disable root login, password auth, set custom port)
- Configure UFW firewall (deny incoming, allow SSH)
- Configure fail2ban for SSH brute-force protection
- Enable automatic security updates

### docker
Install Docker Engine and Docker Compose.

**Tasks:**
- Add Docker GPG key and repository
- Install Docker Engine
- Install Docker Compose (standalone)
- Add deploy user to docker group
- Enable Docker service

### secrets
Deploy secret files from Ansible Vault to the target host.

**Tasks:**
- Create `/opt/pops/secrets/` directory
- Deploy secret files (API keys, Cloudflare tokens, etc.)
- Set restrictive permissions (600, root:root)

### pops-deploy
Deploy and manage the POPS Docker Compose stack.

**Tasks:**
- Create `/opt/pops/` directory structure
- Template `docker-compose.yml` from Jinja2
- Pull latest Docker images
- Start/restart Docker Compose stack
- Verify services are running

### cloudflare-tunnel
Configure Cloudflare Tunnel for secure external access.

**Tasks:**
- Install cloudflared
- Deploy tunnel configuration
- Create systemd service for cloudflared
- Enable and start tunnel

### backups
Set up automated encrypted backups to Backblaze B2.

**Tasks:**
- Install rclone
- Configure rclone with B2 credentials
- Deploy backup script
- Create systemd timer for daily backups
- Set up backup rotation (30-day retention)

### monitoring
Install health check scripts and monitoring.

**Tasks:**
- Deploy health check script
- Create systemd timer for periodic checks
- Configure alerting (optional)

## Troubleshooting

### Vault Password Issues

If you see "Attempting to decrypt but no vault secrets found":

```bash
echo "your-password" > ~/.ansible/pops-vault-password
```

### SSH Connection Issues

If Ansible can't connect:

```bash
# Test SSH manually
ssh -p <custom-port> user@host

# Check inventory
ansible-inventory --list

# Ping hosts
ansible all -m ping
```

### Playbook Failures

```bash
# Run with verbose output
ansible-playbook ansible/playbooks/site.yml -vvv

# Run in check mode (dry-run)
ansible-playbook ansible/playbooks/site.yml --check

# Run specific task by tag
ansible-playbook ansible/playbooks/site.yml --tags docker
```

## Production Deployment

1. Provision fresh Ubuntu 24.04 server
2. Set up SSH key authentication
3. Update `inventory/hosts.yml` with server IP
4. Encrypt secrets in `vault.yml`
5. Run full provision: `ansible-playbook ansible/playbooks/site.yml`
6. Verify services: `docker compose ps`
7. Test Cloudflare Tunnel access

## License

Private project - not for redistribution.
