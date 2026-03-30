# US-05: Ansible provisioning for GitHub Actions runner

> PRD: [061 — Smart Deploy Pipeline](README.md)
> Status: Done

## Description

As a developer, I want the GitHub Actions self-hosted runner to be set up automatically by Ansible provisioning so that a fresh N95 server gets the runner without manual steps.

## Acceptance Criteria

- [ ] New Ansible role `github-runner` under `infra/ansible/roles/`
- [ ] Role installs the GitHub Actions runner binary (latest x64 Linux release)
- [ ] Role configures the runner with the repo URL and a registration token
- [ ] Role installs the runner as a systemd service (`svc.sh install`)
- [ ] Role ensures the service is enabled and started
- [ ] Role is idempotent — running it again on an already-configured runner is a no-op
- [ ] Registration token is fetched via the GitHub API (requires a PAT or app token stored in Ansible Vault)
- [ ] Runner labels: `self-hosted`, `linux`, `x64`, `n95`
- [ ] Runner name: `pops-n95`
- [ ] Role included in `playbooks/site.yml` (full provision) but NOT in `playbooks/deploy.yml` (service deploy only)
- [ ] Ansible vault password file is created at `~/.ansible/pops-vault-password` with correct permissions (600)
- [ ] Ansible itself is installed (via apt) as a dependency
- [ ] Tests: role runs cleanly on a fresh Ubuntu 24.04 host (can be tested via `--check` mode)

## Notes

The registration token is short-lived (1 hour) and single-use. The role should generate a fresh one each time it runs. Store a GitHub PAT (with `admin:org` or `repo` scope for runner registration) in the Ansible vault. The runner binary URL follows the pattern `https://github.com/actions/runner/releases/download/v{version}/actions-runner-linux-x64-{version}.tar.gz` — pin the version in a role variable.
