# PRD-014: Networking & Access

> Epic: [02 — Networking & Access](../../epics/02-networking-access.md)
> Status: Done

## Overview

Configure Cloudflare Tunnel for ingress and Cloudflare Access for zero-trust authentication (per ADR-015). Services are accessible externally without open ports. Only authenticated users can reach them.

## Architecture

```
Internet → Cloudflare Edge → Tunnel → cloudflared container → Docker networks → services
```

The `cloudflared` container maintains an outbound connection to Cloudflare. No inbound ports open on the server.

## Cloudflare Tunnel

- `cloudflared` runs as a Docker container on the `pops-frontend` and `pops-documents` networks
- Routes configured per service (pops-shell, pops-api, metabase, paperless-ngx)
- Each route maps a subdomain to a Docker service + port
- Tunnel credentials stored as Docker secret

## Cloudflare Access

- Access policies per service — who can reach what
- Authentication via email OTP or SSO
- Exception: Up Bank webhook endpoint — no Access policy (has its own signature validation)

## Business Rules

- Zero ports exposed on the server — all ingress via tunnel
- Cloudflare handles TLS termination — no certificate management on the server
- Local network access bypasses Cloudflare — direct IP for emergency management
- Access policies are per-service, not per-route

## User Stories

| # | Story | Summary | Parallelisable |
|---|-------|---------|----------------|
| 01 | [us-01-tunnel-setup](us-01-tunnel-setup.md) | Install cloudflared, create tunnel, configure routes to services ✅ | No (first) |
| 02 | [us-02-access-policies](us-02-access-policies.md) | Configure Cloudflare Access policies per service ✅ | Blocked by us-01 |
| 03 | [us-03-dns-config](us-03-dns-config.md) | Set up DNS records pointing to tunnel ✅ | Blocked by us-01 |

## Verification

- All services accessible via their subdomain from outside the network
- Unauthenticated requests redirected to Cloudflare Access login
- Up Bank webhook endpoint accessible without Access (signature-validated)
- No ports exposed: `nmap` scan shows only SSH
- Local network access works via direct IP

## Out of Scope

- VPN or Tailscale (decided against in ADR-015)
- SSL certificate management (Cloudflare handles it)
- Application-level auth
