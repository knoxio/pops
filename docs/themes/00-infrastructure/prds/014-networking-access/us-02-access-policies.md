# US-02: Configure Cloudflare Access policies

> PRD: [014 — Networking & Access](README.md)
> Status: Done

## Description

As an operator, I want Cloudflare Access policies so that only authenticated users can reach POPS services.

## Acceptance Criteria

- [x] Access application created for each service (shell, API, metabase, paperless)
- [x] Authentication method configured (email OTP or SSO)
- [x] Policies restrict access to authorised email addresses
- [x] Up Bank webhook endpoint excluded from Access (uses signature validation)
- [x] Unauthenticated requests show Cloudflare Access login page

## Notes

Access is per-application, not per-route. Each service gets its own Access application with its own policy.

Configured entirely in the Cloudflare dashboard (SaaS) — no IaC representation. Confirmed active via CLAUDE.md: "Cloudflare Access in front of all exposed services (except Up webhook endpoint)".
