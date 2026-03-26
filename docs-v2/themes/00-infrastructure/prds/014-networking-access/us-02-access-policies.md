# US-02: Configure Cloudflare Access policies

> PRD: [014 — Networking & Access](README.md)
> Status: To Review

## Description

As an operator, I want Cloudflare Access policies so that only authenticated users can reach POPS services.

## Acceptance Criteria

- [ ] Access application created for each service (shell, API, metabase, paperless)
- [ ] Authentication method configured (email OTP or SSO)
- [ ] Policies restrict access to authorised email addresses
- [ ] Up Bank webhook endpoint excluded from Access (uses signature validation)
- [ ] Unauthenticated requests show Cloudflare Access login page

## Notes

Access is per-application, not per-route. Each service gets its own Access application with its own policy.
