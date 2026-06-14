# US-05: External-pillar UI loading mechanism (stub — defer to successor PRD)

> PRD: [PRD-243 — Registry-driven shell UI aggregation](README.md)
>
> Status: **Stub — defer to a successor PRD**. No implementation lands under PRD-243.

## Description

As an external pillar author, I want the shell to discover and mount my frontend code from my own repo / container — without the shell repo needing to take a workspace dependency on my code. PRD-243's in-repo registry walk leaves a single seam unresolved: how does the shell resolve a `PageDescriptor`'s `bundleSlot` for a pillar whose code is not in the shell's workspace bundle map?

This US enumerates the candidate mechanisms, captures the trade-offs, and defers the decision to a successor PRD. Theme 13's [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md) framing keeps full UI federation outside this theme; this US exists to surface the open question, not to close it.

## Candidate Mechanisms

| Option | Mechanism                                                                                                                                                                                               | Pros                                                                                                                                                                                                                                                                                                 | Cons                                                                                                                                                                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | Shell `import()`s the JS bundle URL the pillar advertises via `assetsBaseUrl` on its manifest. The pillar serves a single ESM entry; the shell dynamic-imports it at mount time.                        | Standard ES module; no bundler-specific glue; debuggable in browser devtools; works for any pillar that can ship an ESM bundle (TS, Rust → wasm, etc.); plays well with subresource integrity hashes if added to the manifest.                                                                       | Versioning is the pillar's responsibility; runtime errors in the pillar bundle can crash the shell unless isolated under an error boundary; React-version skew (shell on R19, pillar bundled with R18) needs an explicit shared-deps story; CSP must permit the pillar origin; cold-load latency on first nav. |
| **B**  | Module Federation (Webpack 5 / Vite plugin). The shell consumes federated remotes named by the registry.                                                                                                | Mature pattern for MFE; explicit shared-deps contract; per-remote loading; bundler integration handles chunk graph.                                                                                                                                                                                  | Bundler-coupled (locks the shell to Webpack/Vite with the federation plugin); each external pillar must build with a compatible federation toolchain (excludes non-JS pillars without a wrapper); explicit non-goal of Epic 10's out-of-scope list ("Module Federation (MFE) for the shell").                  |
| **C**  | One iframe per external pillar. The registry advertises the pillar's hosted URL; the shell renders an iframe inside its route placeholder. Cross-frame postMessage for capture surfaces / shared state. | Strong isolation (CSS, JS, crash domain); pillar can ship any framework or even non-React code; trivial to swap; matches the UI-pillar framing in [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) where each UI surface is its own container with a `baseUrl`. | Cross-frame state sync is bespoke; navigation history needs orchestration (shell URL ↔ iframe URL); deep-link semantics are split-brain; performance overhead of N iframes; theming continuity is hard; the shell's existing components (sidebars, modals) cannot reach into the iframe.                       |

## Recommendation for the Successor PRD

Default to **Option A (lazy `import()` of `assetsBaseUrl`)**; reserve **Option C (iframe per pillar)** as the opt-in for pillars that explicitly require isolation. Reject **Option B (module federation)** for the duration of Epic 10.

Why:

- **A is the lowest-coupling fit for the typed-federation framing of [ADR-032](../../../../architecture/adr-032-positioning-vs-self-hosted-os-family.md).** The shell already owns the manifest contract; `assetsBaseUrl` is the natural URL handle the manifest carries; a dynamic ESM import is one line at the bundle-map seam US-03 already builds. The same path works for any pillar that can ship an ESM entry — including a Rust pillar shipping a wasm-backed React component ([PRD-233](../233-external-pillar-example-repo/README.md)). No bundler lock-in, no postMessage protocol, no new platform primitive. The precedent matches [ADR-037](../../../../architecture/adr-037-settings-as-manifest-dimension.md): when adding a new manifest dimension, the lowest-coupling discovery path is the one that survives.
- **C is the right fallback when A's constraints bite.** A pillar that needs CSS isolation, a non-React runtime, or a separate crash domain (third-party code, embedded vendor UI, demo sandboxes) gets an iframe variant of the same `assetsBaseUrl` field. The manifest can advertise the rendering mode (`uiLoader: 'esm' | 'iframe'`); the shell selects at mount time. C does _not_ replace A — it co-exists.
- **B is rejected for Epic 10.** Module Federation is on the Epic 10 out-of-scope list. The shell is Vite-based; the Webpack federation toolchain is not idiomatic, and the Vite federation plugins are an extra build-tool dependency for every external pillar. The "shared-deps contract" win MF gives over A is real but narrow — it can be modelled in A by hoisting React / shared SDK packages via import maps without adopting MF's full chunk-graph integration. If a future PRD revisits this, the revisit is recorded as an ADR per the existing note in this US.

The successor PRD is expected to:

1. Prototype A against the PRD-233 example pillar (the smoke-test consumer).
2. Spec the shared-deps strategy (import map vs externals vs bundled twin) and the React-version-skew posture.
3. Spec the CSP posture: which origins the shell trusts, whether SRI hashes are mandatory on the manifest, what the error-boundary contract looks like when a remote bundle throws.
4. Spec the C variant for pillars that need isolation, including the postMessage protocol for navigation continuity and capture-surface plumbing.
5. Flip `assetsBaseUrl` from "reserved schema field" to "consumed by the shell" — the workspace bundle map US-03 builds grows a runtime fallback that resolves through A (or C) when the pillar id is absent from the in-repo map.

## What This US Does Not Decide

This US is the bookmark, not the design. Out of scope here:

- **Which option ships first.** A is recommended above; the successor PRD owns the call. If the prototype surfaces a blocker the recommendation can be revisited without rewriting this US.
- **Who owns the successor PRD.** Authorship and theme placement belong to whoever files it. The expectation is a sibling PRD outside Theme 13.
- **When the work is needed.** See _Trigger_ below — the work is gated on a real consumer, not a calendar.
- **The shared-deps contract.** Pinning the React-version-skew strategy, the import-map shape, and the SDK bundling rules belongs to the successor PRD. PRD-243 only reserves the schema field.
- **Security review.** CSP, SRI, sandboxing, and the error-boundary contract for remote bundles are all successor-PRD work.
- **The C postMessage protocol.** Navigation continuity, capture-surface plumbing, and theming-handoff into the iframe are deferred.

## Trigger

The successor PRD becomes load-bearing as soon as a non-bundled external pillar wants to register a UI surface. Today no such consumer exists:

- **PRD-233's Rust pillar** ships manifest-only surfaces (search adapters, AI tools, sinks). It has no UI today, so it is not the trigger.
- **Future iOS / kiosk surfaces** register as UI pillars per [ADR-035](../../../../architecture/adr-035-pillar-redefinition-and-implicit-kinds.md) but they _are_ the shell on their respective devices — they do not load other pillars' remote UI, they host their own. Not the trigger either.
- **The trigger** is the first external pillar (in-repo escape-hatch absent) whose manifest declares a `nav` or `pages` block. At that point the shell's `unknown UI pillar id; skipping mount` log path goes from inert to hot, and the successor PRD must land before the pillar can render anything.

Until then, the field reserved by [US-01](us-01-extend-manifest-schema.md) and the skip path wired by [US-03](us-03-shell-registry-walk.md) hold the seam open at zero runtime cost.

## Acceptance Criteria

- [x] This US's README enumerates the three options above with pros and cons (table form).
- [x] The PRD-243 parent README lists US-05 as a stub with "defer to successor PRD" status.
- [x] This US records an explicit recommendation for the successor PRD (Option A primary, Option C opt-in, Option B rejected for Epic 10) with the reasoning.
- [x] This US records the trigger condition — the first external pillar declaring a `nav` or `pages` block — and confirms no current consumer (PRD-233 Rust pillar, future iOS / kiosk surfaces) qualifies.
- [x] No code under PRD-243 reads or consumes `assetsBaseUrl`. US-01 lands the schema field; US-03 logs and skips when it appears; US-05 leaves the field reserved.
- [ ] A successor PRD is filed (referenced from US-05's notes when the issue is opened) to pick one option, prototype it, and migrate `assetsBaseUrl` from "reserved schema field" to "consumed by the shell".
- [x] No husky / typecheck / lint impact from this US — it is doc-only.

## Notes

- **Why defer.** Each option is a substantial engineering investment that intersects bundler choice, security policy, performance budget, and the React-version coupling between shell and pillar. Picking under PRD-243 would either rush the decision or block the in-repo registry walk (which is the high-leverage win in the audit). Splitting the decision into a successor PRD lets PRD-243 ship the H4 + H5 closure today and lets the external-pillar mechanism land on its own schedule.
- **Boundary with ADR-032.** ADR-032 positions POPS as a typed-federation layer; external-pillar UI loading is the federation surface for UI. Whichever option the successor PRD picks must respect that framing — the federation surface is the contract; the implementation is a packaging choice.
- **Boundary with Epic 10.** Epic 10's out-of-scope explicitly names Module Federation as a non-goal for the theme. The successor PRD may revisit that — and if it does, the decision is recorded as an ADR rather than buried in this US.
- **Boundary with PRD-233.** The external-pillar example repo ([PRD-233](../233-external-pillar-example-repo/README.md)) is the smoke-test consumer for the chosen mechanism. The example pillar today contributes manifest-only surfaces (search adapters, AI tools, sinks); adding UI to it is the proof point for the successor PRD.
- **Anti-scope.** Picking between A / B / C, prototyping, security review, version-skew strategy, and shared-deps contracts all belong to the successor PRD. This US is the bookmark, not the design.
