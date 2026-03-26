# ADR-015: Cloudflare Tunnel + Access for Ingress and Auth

## Status

Accepted

## Context

POPS runs on a mini PC on a home network. Services need to be accessible from outside (phone, laptop away from home) without exposing ports to the public internet. The system also needs authentication — not everyone who finds the URL should get in.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Port forwarding + self-hosted auth (Authelia, Authentik) | Full control, no external dependency | Exposed ports, DDoS risk, SSL management, self-hosted auth is another service to maintain and secure |
| Tailscale (mesh VPN) | Encrypted tunnel, no exposed ports, simple setup | Requires Tailscale client on every device, doesn't work well for PWA bookmark on iPhone (VPN must be active), another dependency |
| Cloudflare Tunnel + Cloudflare Access | Zero exposed ports, DDoS protection, managed auth (SSO, email OTP), free tier, no client software needed | Dependency on Cloudflare, traffic routes through their network |
| No external access (LAN only) | Simplest, most secure | Defeats the purpose — can't use from phone outside home |

## Decision

Cloudflare Tunnel for ingress, Cloudflare Access for zero-trust auth.

- **Tunnel:** The mini PC runs `cloudflared` which maintains an outbound connection to Cloudflare. No inbound ports open, no port forwarding on the router, no dynamic DNS. Cloudflare routes requests to the tunnel
- **Access:** Cloudflare Access sits in front of all exposed services. Authentication via email OTP or SSO. No self-hosted auth server to maintain. Policies per service (e.g., POPS shell requires auth, Up Bank webhook endpoint does not)

The Cloudflare dependency is acceptable — if Cloudflare goes down, services are still accessible on the local network via direct IP. The free tier covers all current needs.

## Consequences

- Zero ports exposed on the home network — no attack surface from port scanning
- DDoS protection included — Cloudflare absorbs volumetric attacks
- No SSL certificate management — Cloudflare handles TLS termination
- PWA works from iPhone without VPN software — just a bookmark
- Auth is managed, not self-hosted — no Authelia/Authentik to patch and maintain
- All external traffic routes through Cloudflare's network — privacy trade-off accepted for convenience
- Local network access bypasses Cloudflare entirely — direct IP for emergency management
