# US-03: DNS configuration

> PRD: [014 — Networking & Access](README.md)
> Status: Done

## Description

As an operator, I want DNS records pointing to the Cloudflare Tunnel so that services are accessible via clean subdomains.

## Acceptance Criteria

- [x] CNAME records created for each service subdomain
- [x] Records point to the tunnel's `.cfargotunnel.com` address
- [x] DNS propagation verified — subdomains resolve correctly
- [x] HTTPS works on all subdomains (Cloudflare TLS)

## Notes

Cloudflare manages TLS certificates automatically for proxied DNS records. No manual certificate management needed.

Subdomains defined in `infra/ansible/inventory/group_vars/pops_servers/vars.yml`: `pops`, `pops-api`, `pops-metabase`, `pops-paperless` under domain `jmiranda.dev`. Cloudflare Tunnel auto-creates CNAME records pointing to the tunnel when the ingress rules are applied — no manual DNS management required.
