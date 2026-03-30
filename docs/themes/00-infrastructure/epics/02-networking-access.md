# Epic 02: Networking & Access

> Theme: [Infrastructure](../README.md)

## Scope

Configure Cloudflare Tunnel for ingress and Cloudflare Access for zero-trust authentication. After this epic, POPS services are accessible externally without any open ports, and only authenticated users can reach them.

## PRDs

| # | PRD | Summary | Status |
|---|-----|---------|--------|
| 014 | [Networking & Access](../prds/014-networking-access/README.md) | Cloudflare Tunnel setup, Access policies per service, DNS configuration, cloudflared container | Done |

## Dependencies

- **Requires:** Epic 01 (services must be running to route to)
- **Unlocks:** External access to all services

## Out of Scope

- VPN or Tailscale (decided against in ADR-015)
- SSL certificate management (Cloudflare handles this)
- Application-level auth
