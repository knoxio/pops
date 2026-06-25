# ADR-035: Pillar Redefinition and Implicit Kinds

## Status

Accepted — 2026-06-13

## Context

[ADR-026](adr-026-pillar-architecture.md) introduced "pillar" as the architectural unit. At the time, every pillar was a data domain — finance, media, inventory, cerebrum, food, lists, core — each owning a SQLite file and exposing tRPC procedures. The name "pillar" carried that meaning: a load-bearing vertical column of the system, each holding up a slice of the application.

[ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) introduced bridge pillars as the integration pattern: thin containers that translate between POPS and external systems (HA, MQTT, ESPHome). Bridge pillars look like pillars structurally — they ship as containers, register with the registry, expose a manifest, get routed by nginx — but they do not own a domain; they mirror data from elsewhere.

A late insight in the Theme 13 design conversation surfaced a third shape: the shell itself (and future iOS app, kiosk displays, remote UIs) is **container-shaped, registry-discoverable, manifest-able**, but owns no data and exposes no procedures. The shell consumes the SDK; it does not contribute to federated search, AI tool routing, or sinks.

Two questions emerge:

1. Do we encode "kind" (data / UI / bridge) explicitly in `pillar_registry`, with per-kind manifest validators?
2. Is "pillar" still the right name given the broader scope?

## Options Considered

### On encoding kind

| Option                                                                                      | Pros                                                                                                                                              | Cons                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add `kind` column to `pillar_registry` (`dynamic-pillar-registration` schema migration)** | Explicit typing; per-kind validators; dashboards group cleanly                                                                                    | Premature encoding; what about pillars that straddle kinds; needs migration if a UI pillar later exposes procedures; redundant with manifest contents |
| **Implicit kinds — discriminate by what the manifest declares (chosen)**                    | Zero schema change; the orchestrators already filter by capability not by label; categories stay descriptive not prescriptive; one less migration | "Kind" remains a human-only concept; cannot validate "UI pillars must NOT declare procedures" (not currently a useful constraint anyway)              |

### On renaming pillar

| Option                                                           | Pros                                                                                                                                                                                           | Cons                                                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rename to `module`**                                           | Generic; matches the broader scope                                                                                                                                                             | Collides with existing `@pops/module-registry` (frontend bundled-app concept); collides with JS modules; worst rename available                     |
| **Rename to `node` / `block` / `service` / `add-on` / `plugin`** | Each has some merit                                                                                                                                                                            | `node` collides with Node.js; `block` is too generic; `service` carries microservice baggage; `add-on` implies optional; `plugin` implies secondary |
| **Keep "pillar" and redefine via this ADR (chosen)**             | Zero rewrite cost; ADR-026 / ADR-027 / ADR-030 / ADR-032 / ADR-033 / ADR-034 / 30+ PRDs / every package name stay correct; brand continuity ("Theme 13 Pillar Finale", future writeup framing) | Name is now semantically dated — "pillar" originally meant "data domain column"; the redefinition is documented, not the name                       |

## Decision

A **pillar** is any service registered with the central registry that exposes a valid manifest at `/manifest.json`. Pillars vary in shape:

- **Data pillars** — own a SQLite file (or equivalent per-pillar store), expose tRPC procedures, declare `searchAdapters` and `aiTools`. Today: finance, media, inventory, cerebrum, food, lists, core.
- **UI pillars** — own no data, expose no procedures, declare no adapters. Their manifest advertises a `baseUrl` that consumers can use as a discoverable surface (the shell URL, the iOS deep-link scheme, kiosk display endpoints). Today: pops-shell is the first UI pillar in this categorisation; iOS and kiosk surfaces would be peers.
- **Bridge pillars** — mirror data from an upstream system (HA WebSocket, MQTT broker, ESPHome devices). They declare `searchAdapters` so their mirrored entities show up in federated search, `aiTools` so the LLM can read/control upstream state, and `sinks` (per [ADR-034](adr-034-sinks-manifest-dimension.md)) so outbound POPS events route back to the upstream system.

These three categories are **descriptive, not prescriptive**. They are human-reading conveniences for dashboards, ADRs, and writeups. They are not encoded in the schema, not enforced by the validator, and not used by the orchestrators. Concretely:

- `pillar_registry` does NOT get a `kind` column.
- The manifest schema (`manifest-schema-validator`) is unchanged.
- Orchestrators continue to iterate by capability: federated search loops over pillars with non-empty `searchAdapters`; AI tool routing loops over `aiTools`; sink dispatcher loops over `sinks`.
- A pillar declaring empty arrays for everything is simply not in any iteration set — that is the UI-pillar shape.

The name "pillar" is retained for continuity. ADR-026's original framing ("load-bearing vertical column for a data domain") was correct for the time. The architecture has outgrown that framing — bridges and UI surfaces are not data domains — but the cost of renaming exceeds the benefit, and the brand identity (the "Pillar Federation" writeup framing) is load-bearing in its own right. This ADR is the canonical place where the broader definition lives; future readers asking "wait, the shell is a pillar?" get pointed here.

## Consequences

- **Enables:** the shell registers itself with the registry on boot, advertising a UI-pillar manifest (`searchAdapters: [], aiTools: [], sinks: []`, `baseUrl: <shell URL>`). External tools (iOS deep-link generator, kiosk discovery, federation visualiser) can discover the shell's URL the same way they discover any other pillar.
- **Enables:** the iOS app, when it ships, becomes a UI pillar peer of the shell. Kiosk displays are also UI pillars. The "drop in a UI from another repo" question is reframed as "register a UI pillar with a manifest pointing at your hosted URL"; no new architectural surface needed.
- **Enables:** `dynamic-pillar-registration` implementation does not need a schema migration for `kind`. The registration endpoint stays simple.
- **Prevents:** kind-based validation logic ("UI pillars must not declare procedures"). If such a constraint becomes useful in future, it can be introduced via the manifest validator without touching the registry schema.
- **Constrains:** the federation orchestrators MUST tolerate pillars with empty capability arrays. They already do (the iteration is `filter(p => p.manifest.X?.length > 0)`).
- **Constrains:** descriptions of the system in docs / READMEs / writeups should use "pillar" consistently and explain the kinds in plain prose, not encode them anywhere.
- **Trade-off accepted:** the word "pillar" is now metaphorically inaccurate (UI surfaces are not load-bearing columns). The continuity cost dominates the metaphor cost. Future writers may call the system "Pillar Federation" or "Typed Pillar Platform"; both still work because the federation pattern is the actual contribution, regardless of what the unit is named.

## Related

- [ADR-026](adr-026-pillar-architecture.md) — original definition; this ADR broadens it without overriding
- [ADR-027](adr-027-runtime-pillar-registry.md) — the registry this ADR clarifies the contents of
- [ADR-032](adr-032-positioning-vs-self-hosted-os-family.md) — introduces bridge pillars as a concept; this ADR formally categorises them
- [ADR-034](adr-034-sinks-manifest-dimension.md) — the sinks dimension bridge pillars use
- [manifest-schema-validator](../themes/federation/prds/manifest-schema-validator.md) — manifest schema (unchanged by this ADR)
- [dynamic-pillar-registration](../themes/federation/prds/dynamic-pillar-registration.md) — dynamic pillar registration (no schema changes needed from this ADR)
