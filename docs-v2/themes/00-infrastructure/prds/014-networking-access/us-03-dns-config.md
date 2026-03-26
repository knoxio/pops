# US-03: DNS configuration

> PRD: [014 — Networking & Access](README.md)
> Status: To Review

## Description

As an operator, I want DNS records pointing to the Cloudflare Tunnel so that services are accessible via clean subdomains.

## Acceptance Criteria

- [ ] CNAME records created for each service subdomain
- [ ] Records point to the tunnel's `.cfargotunnel.com` address
- [ ] DNS propagation verified — subdomains resolve correctly
- [ ] HTTPS works on all subdomains (Cloudflare TLS)

## Notes

Cloudflare manages TLS certificates automatically for proxied DNS records. No manual certificate management needed.
