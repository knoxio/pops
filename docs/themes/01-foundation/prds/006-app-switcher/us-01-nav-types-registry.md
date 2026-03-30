# US-01: Define nav types and app registry

> PRD: [006 — App Switcher](README.md)
> Status: Partial

## Description

As a developer, I want typed nav config interfaces and a central app registry so that apps can declare their navigation and the shell renders it dynamically.

## Acceptance Criteria

- [x] `AppNavConfig` and `AppNavItem` TypeScript interfaces defined (in shell or shared package)
- [x] App registry array in the shell holds all registered app configs
- [x] Registry is the single source of truth — sidebar/rail reads from it, no hardcoded nav lists
- [x] At least one app (finance) registered with Lucide icon references (not emoji)
- [x] Adding a new app to the registry is a one-line import + array push
- [ ] Icon name strings in navConfig resolve to actual icon components — missing mappings fail visibly at dev time (TypeScript error or runtime warning), not silently at render time

## Notes

The `color` field on `AppNavConfig` is optional — it's consumed by the theme colour propagation system (PRD-007). The registry doesn't need to handle it yet, just include it in the type.
