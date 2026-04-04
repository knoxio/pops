# US-01: Shelf interface and registry

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Not started

## Description

As a developer, I want a ShelfDefinition interface and registry so that shelf implementations can be added independently and the assembly algorithm discovers them at runtime.

## Acceptance Criteria

- [ ] `ShelfDefinition` interface: id, template flag, category, generate() method
- [ ] `ShelfInstance` interface: shelfId, title, subtitle, emoji, query(), score, optional seedMovieId
- [ ] `registerShelf(definition)` adds to registry
- [ ] `getRegisteredShelves()` returns all definitions
- [ ] `PreferenceProfile` type passed to generate() (existing type from discovery service)
- [ ] Category enum: seed, profile, tmdb, local, context, external
- [ ] Tests: register, retrieve, generate returns instances
