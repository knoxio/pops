# US-02: Command executor

> PRD: [054 — AI Overlay](README.md)
> Status: Not started

## Description

As the system, I execute verbs by mapping them to tRPC calls and returning data with contextual commands for the fetched resource.

## Acceptance Criteria

- [ ] `executeVerb(domain, verb, params)` validates params, calls the mapped tRPC procedure, returns result
- [ ] Result includes `data` (the response) and `commands` (verbs available for this resource)
- [ ] Commands are generated from the resource type — e.g. fetching a movie returns media:add-to-watchlist, media:mark-watched, etc.
- [ ] Unknown verb returns clear error (not a crash)
- [ ] Param validation failure returns error with details
- [ ] Tests: execute known verb, unknown verb error, validation error, commands returned
