# US-01: Set up Cloudflare Tunnel

> PRD: [014 — Networking & Access](README.md)
> Status: To Review

## Description

As an operator, I want a Cloudflare Tunnel running as a Docker container so that services are accessible externally without open ports.

## Acceptance Criteria

- [ ] `cloudflared` container defined in docker-compose.yml
- [ ] Tunnel created and authenticated with Cloudflare
- [ ] Routes configured: each service maps to a subdomain
- [ ] Tunnel credentials stored securely (Docker secret or volume mount)
- [ ] `cloudflared` connected to pops-frontend and pops-documents networks
- [ ] Services reachable via their subdomains from outside the network

## Notes

Cloudflare Tunnel uses an outbound-only connection — no firewall rules needed beyond SSH.
