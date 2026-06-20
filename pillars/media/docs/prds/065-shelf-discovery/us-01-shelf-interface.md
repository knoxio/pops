# US-01: Shelf interface and registry

> PRD: [065 — Shelf-Based Discovery](README.md)
> Status: Done

## Description

As a developer, I want a ShelfDefinition interface and registry so that shelf implementations can be added independently and the assembly algorithm discovers them at runtime.

## Acceptance Criteria

- [x] `ShelfDefinition` interface: id, template flag, category, generate() method
- [x] `ShelfInstance` interface: shelfId, title, subtitle, emoji, query(), score, optional seedMovieId
- [x] `registerShelf(definition)` adds to registry
- [x] `getRegisteredShelves()` returns all definitions
- [x] `PreferenceProfile` type passed to generate() (existing type from discovery service)
- [x] Category enum: seed, profile, tmdb, local, context, external
- [x] Tests: register, retrieve, generate returns instances
