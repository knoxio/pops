# ADR-036: Pillar ID, Tool Name, and Sink Event Type Conventions

## Status

Accepted — 2026-06-14

## Context

Three regexes in the manifest schema (`libs/sdk/src/manifest-schema/schema.ts`) jointly determine how identifiers flow across the federation:

- `PILLAR_ID` — `^[a-z][a-z0-9-]*$` (lowercase kebab-case)
- `CAMEL_IDENTIFIER` — `^[a-z][a-zA-Z0-9]*$` (camelCase; no dots, no hyphens). Used for `ai.tools[].name` and `search.adapters[].name`.
- `SINK_EVENT_TYPE` — `^[a-z][a-z0-9]*\.[a-z][a-z0-9]*\.[a-z][a-z0-9]*$` (lowercase dotted, exactly 3 segments)

The constraints are enforced — the manifest validator ([manifest-schema-validator](../themes/federation/prds/manifest-schema-validator/README.md)) rejects non-conforming manifests at registration time — but the _convention_ that ties them together is not documented anywhere. Three federation PRs hit it in quick succession and each had to rediscover the rule:

- **PR #3179** — drafted as `ha.entity.list`. Manifest publishes `entityList`. The tool-router composes `<pillarId>.<toolName>` at call time, so the LLM sees `ha-bridge.entityList`.
- **PR #3184** — same shape for `ha.entity.getState` → `entityGetState`. Identical workaround.
- **PR #3189** — drafted as `ha.notify` (2 segments). `SINK_EVENT_TYPE` requires 3 segments, so shipped as `ha.notify.send` and `ha.event.fire`. Behaviour matches PRD intent; the names were widened to satisfy the regex.

The constraints exist for real reasons. LLM tool-name discoverability is the camelCase driver — provider tool schemas (OpenAI, Anthropic) treat the name as a single identifier and behave poorly with dots or hyphens, and the orchestrator's `parseToolName` (`libs/sdk/src/ai-tools/tool-router.ts`) splits on the _first_ dot to recover `<pillarId>.<toolName>`, which only works if the tool half contains no further dots. Sink event types are routed by the orchestrator's publish/subscribe dispatcher, which keys on the full string; the 3-segment shape (`<source>.<entity>.<action>`) keeps the namespace flat and parseable without enforcing a per-pillar prefix.

New pillar authors keep stepping on the same trap because the _constraint_ lives in the regex and the _rationale_ lives in PR review comments.

## Options Considered

| Option                                                           | Pros                                                                                                                       | Cons                                                                                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Relax the regex to allow dots/hyphens in tool names**          | Authors can write the name they first reach for                                                                            | Breaks LLM provider tool schemas; breaks `parseToolName`'s first-dot split; not actually free                                                      |
| **Auto-rewrite hyphenated/dotted names in the validator**        | Authors get a forgiving experience                                                                                         | Silent rewriting hides the constraint; the rewritten name still has to appear in the manifest the orchestrator reads, so the author sees it anyway |
| **Document the convention as an ADR + JSDoc cross-ref (chosen)** | Zero code change; the next author finds the rationale next to the regex; the convention is named so future PRs can cite it | Convention is enforced by a regex that doesn't explain itself in its error message; mitigated by the JSDoc pointer                                 |

## Decision

Codify (not change) the three identifier conventions and cross-reference this ADR from the manifest-schema source.

**Pillar IDs are kebab-case.** `ha-bridge`, `pops-shell`, `cerebrum`, `finance`. Enforced by `PILLAR_ID`. They appear in URLs, the published package name (`@pops/<pillar>`), and as the prefix the tool-router composes onto every tool name.

**Tool and search-adapter names are camelCase.** `entityList`, `entityGetState`. Enforced by `CAMEL_IDENTIFIER`. No dots, no hyphens. The tool-router (`libs/sdk/src/ai-tools/tool-router.ts`) composes the qualified name `<pillarId>.<toolName>` at call time — e.g. `ha-bridge.entityList` — and `parseToolName` splits on the _first_ dot to recover the two halves. The pillar id may therefore contain hyphens, but the tool name cannot, because `parseToolName` rejects any qualified name with a second dot. The LLM never sees a tool name with internal dots or hyphens.

**Sink event types are lowercase dotted, exactly 3 segments: `<source>.<entity>.<action>`.** `media.watch.completed`, `finance.balance.low`, `ha.notify.send`, `ha.event.fire`. Enforced by `SINK_EVENT_TYPE`. The leading segment is the source — usually the pillar id, but kebab-case pillar ids collapse to a single token (`ha-bridge` publishes under `ha.*`). The orchestrator routes on the full string; the segmentation is for naming hygiene, not parsing.

Concretely, draft and ship like this:

| Draft (avoid)            | Ships as                                                       | Why                                                    |
| ------------------------ | -------------------------------------------------------------- | ------------------------------------------------------ |
| `ha.entity.list`         | manifest `entityList`; LLM sees `ha-bridge.entityList`         | tool name must be camelCase; router prefixes pillar id |
| `ha.entity.getState`     | manifest `entityGetState`; LLM sees `ha-bridge.entityGetState` | same                                                   |
| `ha.notify` (2 segments) | `ha.notify.send`                                               | sink event type must be 3 segments                     |
| `ha-bridge.notify.send`  | `ha.notify.send`                                               | source segment is a single token, not kebab            |

**Don't do this:**

- Don't put dots or hyphens in tool names. `entity-list`, `entity.list` — both rejected by `CAMEL_IDENTIFIER`; if the regex were relaxed, the first-dot split in `parseToolName` would still mis-route.
- Don't ship 2-segment sink event types. `ha.notify` is rejected by `SINK_EVENT_TYPE`; pick a verb for the third segment (`send`, `fire`, `completed`).
- Don't prefix the tool name with the pillar id inside the manifest. The router prefixes at call time. A manifest entry named `haBridgeEntityList` produces `ha-bridge.haBridgeEntityList` on the wire.

## Consequences

- **Enables:** new pillar authors have one place to read why the regexes are what they are. PR review for naming becomes a citation, not a rediscovery.
- **Enables:** the manifest-schema source carries a JSDoc pointer to this ADR next to the `CAMEL_IDENTIFIER` and `SINK_EVENT_TYPE` regexes, so an agent grepping for the constraint finds the rationale in one hop.
- **Prevents:** the recurring "draft as dotted, rewrite as camel, re-review" cycle from PRs #3179 / #3184 / #3189.
- **Constrains:** none — the regexes are unchanged and no existing identifier is renamed. This ADR is documentation-only.
- **Trade-off accepted:** the rules are written down but not auto-enforced beyond the existing regex. A future author who ignores the ADR still gets a clean validator rejection at registration; the ADR exists so the rejection reads as "I know why this fails" instead of "I have to go read the schema source."

## Related

- [ADR-026](adr-026-pillar-architecture.md) — pillar architecture; pillar id concept
- [ADR-034](adr-034-sinks-manifest-dimension.md) — sinks dimension; original home of the `SINK_EVENT_TYPE` rule
- [manifest-schema-validator](../themes/federation/prds/manifest-schema-validator/README.md) — manifest schema (regexes live here, unchanged)
- [ai-tool-manifest](../themes/federation/prds/ai-tool-manifest/README.md) — AI tool descriptors in the manifest (camelCase tool name)
- [tool-call-routing](../themes/federation/prds/tool-call-routing/README.md) — tool-router dispatch (`<pillarId>.<toolName>` composition)
- [manifest-schema-validator](../themes/federation/prds/manifest-schema-validator/README.md) — sinks manifest validation
- PR #3179 — `ha.entity.list` → `entityList`
- PR #3184 — `ha.entity.getState` → `entityGetState`
- PR #3189 — `ha.notify` → `ha.notify.send` + `ha.event.fire`
