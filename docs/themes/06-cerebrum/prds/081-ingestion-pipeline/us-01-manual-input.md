# US-01: Capture-First Manual Input

> PRD: [PRD-081: Ingestion Pipeline](README.md)
> Status: Done

## Description

As a user in the pops shell, I want a one-input capture surface that takes my raw text and lets the pipeline figure out type, template, scopes, and tags so that adding to Cerebrum has the same friction as a sticky note — not the friction of filling a form.

## Acceptance Criteria

- [x] The `/cerebrum` route opens a capture surface whose primary affordances are a single multi-line body editor, an optional title input, and a scope input — no other fields visible by default
- [x] The scope input is a single autocomplete that suggests known scopes from `cerebrum.scopes.list` ranked by usage count as the user types, with prefix and segment-substring matching (typing `karbon` matches `work.karbon.fedx.meetings`)
- [x] Selecting a suggestion or pressing Tab from the autocomplete inserts the canonical scope; pressing Enter on freeform text accepts it as-is and submits it as a suggestion (see scope-as-suggestion semantics below)
- [x] User-typed scopes in capture mode are passed to `cerebrum.ingest.quickCapture` as `scopes: string[]` but are treated as **suggestions** — they are written to the engram immediately so the user gets a fast response, and the curation worker surfaces canonical alternatives on the post-ingest review (US-07, US-10)
- [x] Submitting the body in capture mode calls `cerebrum.ingest.quickCapture` and returns immediately, with classification, entity extraction, and scope reconciliation deferred to the curation worker (PRD-081 US-03, US-10)
- [x] After submission, the surface immediately shows the created engram's id, file path, and type — no blocking on async enrichment (the post-ingest chips and reconciliation suggestions land in US-07)
- [x] Empty or whitespace-only bodies are rejected client-side (the capture button stays disabled and never hits the API)
- [x] The capture surface accepts paste of formatted text (Markdown, code, structured data) without losing line breaks or whitespace, matching what the normaliser stores
- [x] An "Advanced" disclosure (collapsed by default) reveals type selector, template-driven custom fields, and tag input; submitting through Advanced calls `cerebrum.ingest.submit` so explicit values bypass classification and entity extraction per PRD-081 business rules
- [x] User-provided scopes get suggestion semantics on the capture path (`quickCapture` with `_reconcile_scopes: true`); on the Advanced path scopes follow PRD-081 US-06 Tier 1 explicit semantics (Advanced is the opt-in for "I know exactly what I want"). API/MCP callers always reach explicit semantics via `cerebrum.ingest.submit`
- [x] Switching the Advanced disclosure open/closed never discards the body editor or the scope input — those primary fields live above the disclosure and stay rendered regardless of Advanced state
- [x] When the user opens Advanced and provides at least one of `type` / `tags` / `template` / custom fields, the form routes through `cerebrum.ingest.submit`; when no Advanced fields are touched, capture mode and `quickCapture` are used
- [x] Cmd/Ctrl+Enter submits from anywhere in the body editor; Esc clears the body and shows an Undo toast (no destructive action without an undo path)

## Notes

- The scope input is intentionally part of capture mode (not Advanced) because scope is the one piece of structure the user can give cheaply that high-leverages retrieval. Type/tags can be inferred well; scope-from-content is hit-or-miss without context only the user has.
- The scope-as-suggestion semantics decouple "fast write" from "canonical scope vocabulary". The user gets immediate feedback with their chosen scope; the worker reconciles it against the existing scope index and proposes a canonical version in US-07 if a near-match exists. The user accepts (chip update) or ignores (their suggestion stands). See US-10 for reconciliation rules.
- Capture mode does not run scope inference at submit time, so it does not surface a scope-confirmation step. Scope confirmation/reconciliation is handled in US-07 (post-ingest review) after the curation worker completes.
- The capture surface is the same component invoked by US-09 (global hotkey modal); design it to render full-page or inside a dialog without forking.
- The 500 ms response budget is achievable because `quickCapture` writes the engram, enqueues an enrichment job, and returns — no LLM calls on the hot path. If the job queue is unavailable, the engram is still written and the missed enqueue is logged as a warning per PRD-081 business rules.
