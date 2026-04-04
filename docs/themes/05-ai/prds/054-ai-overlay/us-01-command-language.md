# US-01: Command language and verb registry

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As a developer, I want a verb-based command language with a registry so that domains can declare their available actions and the AI discovers them at runtime.

## Acceptance Criteria

- [ ] `DomainVerb` interface: domain, verb, description, paramSchema (Zod), allowedConsumers
- [ ] `registerVerb(verb)` adds to registry
- [ ] `getVerbsForDomain(domain)` returns all verbs for a domain
- [ ] `getAllDomains()` returns domain names with descriptions
- [ ] `getVerb(domain, verb)` returns a specific verb definition
- [ ] Param schemas are Zod objects — validated before execution
- [ ] Tests: register, retrieve by domain, retrieve specific, validation rejects bad params
