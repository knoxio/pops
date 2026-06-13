# ADR-032: Positioning vs the Self-Hosted-OS Family

## Status

Accepted — 2026-06-13

## Context

POPS now overlaps in surface area with established self-hosted platforms — Home Assistant / HassOS, Umbrel, CasaOS, YunoHost, Cloudron. The pillar architecture (ADR-026), the runtime registry (ADR-027), the contract packages (ADR-030), and the federated SDK have produced something that looks superficially like an "app platform OS." Before investing further effort in BE-lego deliverables (per-pillar registration endpoint, nginx generator, public contract publishing, starter-template repo, optional ISO distribution), the question of whether POPS is reinventing wheels or producing differentiated value needs an explicit answer that survives until cerebrum engrams can hold it as durable memory.

The framing question: _are we building HA with extra steps, or are we building something the self-hosted-OS family does not have?_

## Options Considered

| Option                                                                                                                    | Pros                                                                                                                                                                                                                                                                                          | Cons                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Abandon POPS, adopt HassOS + custom typed Node service for the gaps**                                                   | Saves ~6 months of infra rebuild; inherit 3000+ HA integrations; battle-tested platform; community moat                                                                                                                                                                                       | Python-first + YAML-config + entity-model are wrong shape for the typed-TS-SDK vision; "custom Node service" still reinvents pillar registry / federation; loses the design coherence that is the actual contribution                                        |
| **Fork an existing TS-first platform (Encore.dev, t3-app, Trigger.dev)**                                                  | Closer language fit; some infrastructure handed to you                                                                                                                                                                                                                                        | Encore is commercial/managed; t3-app is starter scaffolding not a runtime platform; Trigger.dev is workflow-shaped not federation-shaped; none model per-pillar SQLite + manifest-driven cross-cutting                                                       |
| **Continue building POPS, position it as competitive with HassOS / Umbrel**                                               | Existing investment preserved; full architectural control                                                                                                                                                                                                                                     | Direct competition with HA's integration count is unwinnable solo; positioning as "another HA" obscures the differentiated work; user gets dragged into building 3000 integrations                                                                           |
| **Continue building POPS, position it as additive — typed federation layer that consumes HA via bridge pillars (chosen)** | Preserves existing investment and architectural differentiation; outsources device integration to HA where HA is best-in-class; the writeup framing ("typed federation layer for self-hosted apps") is novel and publishable; ships with HassOS users as additional audience, not adversaries | Requires explicit positioning discipline — must resist scope-creep into integration work; commits to building HA bridge pillar (and similar MQTT/ESPHome bridges) as first-class deliverables; the "OS" framing becomes packaging variant, not core identity |

## Decision

POPS is positioned as a **typed federation + AI-tool platform for self-hosted apps**, additive to (not competitive with) the HA-style integration platforms.

The differentiated layer — and the only layer worth defending — is:

1. **Type-safe SDK across pillars** with full TS inference from contract → consumer (`pillar('finance').transactions.list()`).
2. **Federated semantic search across domain pillars** (PRD-197 / PRD-198) with per-pillar ranking and explicit merge strategies.
3. **AI-tool routing as a first-class manifest dimension** (PRD-201 / PRD-202) — every pillar declares its AI-callable surface; the orchestrator routes tool calls; the LLM consumes them.
4. **Per-pillar SQLite + container isolation** as the unit of work — not shared DB, not shared process. This is what makes BE-lego (ADR-026 culmination) structurally possible.
5. **Contract-first publishing with codegen** (PRD-195, OpenAPI per pillar, manifest generated) so external pillars and non-TS consumers can integrate with strong types.

The undifferentiated layer (container orchestration, nginx routing, deployment lifecycle, single-machine app management) is acknowledged as rebuilt infrastructure. It is kept because the cost is sunk and replacing it would also require abandoning the differentiated layer, but no further investment is made in catching up to HassOS supervisor or Umbrel app-store ergonomics.

Integration with the device-/sensor-/automation-side of self-hosting is delegated to HA (and similar) via **bridge pillars**: thin POPS pillars whose job is to subscribe to an upstream system (HA WebSocket, MQTT broker, ESPHome devices) and expose the data through POPS's normal search adapter / AI tool surfaces. Bridge pillars are also the route for outbound flows — POPS publishing events to HA or MQTT becomes a manifest "sinks" dimension (future PRD).

The "POPS OS" framing is reduced to a **packaging variant**: the same codebase can ship as a HassOS-style single-purpose ISO (the appliance distribution) or as a docker-compose stack on existing infra (the container distribution). The container distribution is the daily-driver shape. The ISO is optional demo material for the writeup, not a separate project.

## Consequences

- **Enables:** continued investment in SDK / federation / AI-tool work; bridge pillar pattern as the way device integration enters POPS; writeup framing ("typed federation for self-hosted apps") as a category POPS plants the flag on.
- **Enables:** Rust / Go / Python pillars as a near-term possibility — the contract codegen + manifest pattern makes language-agnostic pillars achievable in weeks once the public registration endpoint lands.
- **Prevents:** scope-creep into device-driver work, voice-assistant work, entity-model standardization, app-store UX work. These are all real and important, but they are HassOS's / HA's / Umbrel's job.
- **Constrains:** every new feature must be evaluated against "does this strengthen the typed-federation story?" Features that compete with HA on its turf (more integrations, better voice, more devices) get a hard no.
- **Trade-off accepted:** POPS will look less feature-rich than HA to a casual evaluator. The audience is not the HA-shopping homeowner; it is the developer / researcher / typed-platform enthusiast who wants the federation surface and is happy to wire HA in as their integration provider.
- **Trade-off accepted:** the container distribution remains the canonical deployment shape. The "POPS OS" ISO becomes demo material rather than a separate maintained product.

## Related

- [ADR-026](adr-026-pillar-architecture.md) — establishes the per-pillar isolation model this ADR positions
- [ADR-027](adr-027-runtime-pillar-registry.md) — runtime registry is the discovery mechanism BE-lego depends on
- [ADR-030](adr-030-contract-packages-semver.md) — contract publishing is the cross-language / cross-repo type-safety enabler
- Theme 13 dashboard `BE-lego readiness` tracker for current state per pillar
