# US-03: Ansible Provisioning

> PRD: [Redis Container & Connection](README.md)
> Status: Not started

## Description

As a platform operator, I deploy Redis alongside the rest of the POPS stack via Ansible so that production has the same Redis configuration as development.

## Acceptance Criteria

- [ ] `pops-deploy` role's docker-compose template includes the Redis service definition
- [ ] Redis volume (`pops-redis-data`) is created by Docker Compose (no separate Ansible task needed)
- [ ] Monitoring health check script updated to include Redis status (`redis-cli -h redis ping`)
- [ ] `.env` on the server includes `REDIS_URL=redis://redis:6379`
- [ ] `deploy.sh` quality gates unchanged (Redis is infrastructure, not application code)
- [ ] Recovery documentation (`infra/recovery.md`) updated with Redis section (note: ephemeral, no backup needed, auto-recreated on deploy)

## Notes

Redis does not need its own Ansible role — it's a single service definition in the existing docker-compose template. Keep it simple.
