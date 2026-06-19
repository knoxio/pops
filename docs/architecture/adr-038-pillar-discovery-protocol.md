# ADR-038: Pillar discovery protocol & LAN discovery toggle (transport deferred)

## Status

Accepted

## Context

The registry substrate for runtime pillar discovery already exists and is tested: core serves a
DB-backed snapshot (`GET /core.registry.list`), an SSE change feed (`GET /registry/subscribe`), and a
shared-key external register/heartbeat/deregister surface ([PRD-228](../themes/13-pillar-finale/prds/228-dynamic-pillar-registration/README.md));
the SDK exposes a pluggable `DiscoveryTransport` seam (`packages/pillar-sdk/src/client/discovery.ts:25`)
whose only implementation today is `HttpDiscoveryTransport`.

The north-star (memory `project_pillar_mqtt_discovery`) is **MQTT-like discovery on the local network**:
flip a "discovery" switch in POPS web or the backend and any convention-following pillar on the LAN
self-registers and is routed/surfaced — including a pillar with **no presence in the monorepo**
(e.g. a kiosk FE talking to a node it has never seen). Reaching that requires three decisions that the
current code does not make: (1) the discovery **transport** for LAN nodes (today everything is HTTP +
SSE on the docker network); (2) **how/whether** external/unknown registration is accepted in production
(PRD-228's shared key is always-on, with no operator switch); (3) the **trust posture** for a LAN pillar
the platform did not build. We do not need the full LAN capability yet — docker-network images are the
current target — but the seam and the gating model should be locked now so the later work is a drop-in.

## Options Considered

### Discovery transport (for the future LAN phase)

| Option                           | Pros                                                                                                                 | Cons                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP + SSE only (status quo)** | Already built and tested; no new infra; works for docker-network and any node that can reach `core-api`              | Pillars must know the registry URL up front; no zero-config "appears on the LAN" semantics                                        |
| **MQTT broker**                  | Pub/sub + retained messages match the "discovery" mental model; decouples pillar↔registry; battle-tested for IoT/LAN | Adds a broker as a hard infra dependency; another service to run/secure; overkill if HTTP suffices                                |
| **mDNS / DNS-SD (zeroconf)**     | True zero-config LAN discovery (Bonjour/Avahi); no broker; pillars advertise via multicast                           | Multicast is flaky across VLANs/Wi-Fi; OS/container networking caveats; registry must reconcile what it hears with what it trusts |
| **SSDP**                         | Simple, UPnP-style LAN announce                                                                                      | Weak security story; less ergonomic than mDNS; not obviously better than the above                                                |

### Gating of external/unknown registration in prod

| Option                                        | Pros                                                                                       | Cons                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **Always-on shared key (PRD-228 status quo)** | Simplest; already implemented                                                              | No operator control; prod is implicitly open to anything holding the key on the network |
| **Explicit discovery toggle (default OFF)**   | Operator decides when the LAN is open; safe-by-default; matches the "turn discovery on" UX | One more state to manage and surface; must be observable                                |

## Decision

1. **Lock the `DiscoveryTransport` seam as the extension point and keep HTTP + SSE as today's
   transport.** A future `MqttDiscoveryTransport` / `MdnsDiscoveryTransport` is a drop-in via
   `factory.ts` (`options.transport ?? new HttpDiscoveryTransport(...)`). **The LAN transport choice is
   deferred** to a successor ADR/PRD, taken when the first real LAN/kiosk consumer exists — mirroring
   the deferral discipline in [PRD-243/US-05](../themes/13-pillar-finale/prds/243-registry-driven-shell-ui/us-05-external-pillar-ui-loading.md).
2. **Introduce a discovery toggle, default OFF.** Acceptance of _external/unknown_ registrations in
   production is gated by an explicit switch (FE/BE). Internal in-tree pillars (`origin = 'internal'`)
   are unaffected. When the toggle is off, external registrations are refused (not silently dropped) and
   the refusal is observable.
3. **Keep PRD-228's security floor and extend it.** Shared-key + `crypto.timingSafeEqual` +
   reserved-core-id rejection (an external pillar may not claim one of the seven in-tree ids) remain the
   baseline. The toggle is an _additional_ gate, not a replacement; the LAN trust posture (what a node
   must prove beyond holding the key) is specified by the successor ADR alongside the transport.

## Consequences

- **Enables** the MQTT/mDNS future as additive work: the seam, the registry contract, and the
  open-id type ([PRD-256](../themes/13-pillar-finale/prds/256-two-tier-pillar-id/README.md)) are in
  place, so the LAN phase implements a transport, not a re-architecture.
- **Prod stays closed by default** — the toggle means shipping discovery code does not open the network
  until an operator opts in, which keeps [PRD-255](../themes/13-pillar-finale/prds/255-prod-registry-driven-nginx/README.md)'s
  registry-driven nginx safe (it routes what the registry holds; the registry only holds external
  pillars when discovery is on).
- **Defers the hard calls** (transport, full LAN trust model, remote FE bundle loading) to a successor
  ADR/PRD gated on a real consumer — no speculative broker dependency or multicast plumbing now.
- **Constrains** external pillars: they can never shadow the seven core ids, and on a docker-network
  deploy they still route via their advertised `baseUrl` only (PRD-255 scope), not arbitrary host
  resolution.

## References

- [ADR-026](./adr-026-pillar-architecture.md) — the seven-pillar carve and the URI dispatcher.
- [ADR-027](./adr-027-runtime-pillar-registry.md) — runtime registry; docker network as the trust boundary; shared key.
- [ADR-035](./adr-035-pillar-redefinition-and-implicit-kinds.md) — shell-as-UI-pillar; UI surfaces as containers with a `baseUrl`.
- [PRD-228](../themes/13-pillar-finale/prds/228-dynamic-pillar-registration/README.md) — external-pillar register/heartbeat/deregister + reserved-id rule.
- [PRD-255](../themes/13-pillar-finale/prds/255-prod-registry-driven-nginx/README.md) — deploys the registry-driven nginx that this protocol feeds.
- [PRD-256](../themes/13-pillar-finale/prds/256-two-tier-pillar-id/README.md) — opens the pillar-id type so unknown LAN ids are expressible.
- Runbook [`06-static-pillar-lists.md`](../runbooks/06-static-pillar-lists.md) — the groundwork epic this ADR anchors.
