# Themes

Themes are strategic initiatives that group related epics. This index lists only the **central, cross-cutting themes** — the substrate every pillar leans on.

Domain themes (finance, media, inventory, food, cerebrum, etc.) are not central. They live inside their pillar at `pillars/<id>/docs/`, where the pillar's `docs/README.md` is the domain/theme overview.

See [roadmap.md](../roadmap.md) for sequencing, dependencies, and implementation status.

## Central Themes

| Theme                                  | One-liner                                                                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[Platform](platform/README.md)**     | The infrastructure every pillar leans on: CI gates and image publishing, per-pillar database lifecycle, the Redis + job-queue runtime, the OpenAPI wire contract, vector storage, application packaging, and the MCP gateway. |
| **[Foundation](foundation/README.md)** | The design system and app runtime every pillar is built on: bootstrap, components, theming, schema patterns, search, settings, feature toggles, and the manifest/plugin contract that lets a pillar plug into the shell.      |
| **[Federation](federation/README.md)** | The pillar platform contract: how independent REST pillars discover each other, advertise capabilities, and compose into one product — across languages, at runtime, with no central pillar list.                             |

## Pillar-Scoped Themes

A theme or PRD that belongs to exactly one pillar lives inside that pillar, not here. Look under `pillars/<id>/docs/` — the pillar's `docs/README.md` is its domain overview, with `epics/`, `prds/`, and (where applicable) `architecture/`, `runbooks/`, and `ideas/` alongside it.
