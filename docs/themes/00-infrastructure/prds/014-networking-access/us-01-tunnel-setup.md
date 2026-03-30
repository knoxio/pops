# US-01: Set up Cloudflare Tunnel

> PRD: [014 — Networking & Access](README.md)
> Status: Done

## Description

As an operator, I want a Cloudflare Tunnel running as a Docker container so that services are accessible externally without open ports.

## Acceptance Criteria

- [x] `cloudflared` container defined in docker-compose.yml
- [x] Tunnel created and authenticated with Cloudflare
- [x] Routes configured: each service maps to a subdomain
- [x] Tunnel credentials stored securely (Docker secret or volume mount)
- [x] `cloudflared` connected to pops-frontend and pops-documents networks
- [x] Services reachable via their subdomains from outside the network

## Notes

Cloudflare Tunnel uses an outbound-only connection — no firewall rules needed beyond SSH.

Tunnel token sourced from Ansible Vault (`vault_cloudflare_tunnel_token`) in production. Local dev uses `${CLOUDFLARE_TUNNEL_TOKEN}` env var. Ingress rules in `infra/ansible/roles/cloudflare-tunnel/templates/cloudflared-config.yml.j2` map 4 subdomains to their services with a 404 catch-all.
