# AI Rule Creation — unbuilt gaps

Forward-looking work peeled off the AI Rule Creation PRD because it is not in the code today. The shipped surface (analyze / generate-rules / propose / revise / reject + the approve → pending → re-evaluate → commit loop) is in the PRD; everything below is "build this later".

## 1. `prefix` matchType for correction rules

The corrections AI domain only supports `exact | contains | regex` (`MatchTypeSchema` in `rest-corrections-schemas.ts`). The original PRD's central example — "IKEA TEMPE NSW" → **prefix** match on "IKEA" — does not exist; analyze can only emit those three types, and a prefix is approximated today by a `contains` on a leading token.

Build: add `prefix` to the corrections `MatchTypeSchema`, the matcher (`patternMatchesDescription`), the analyze prompt/validator, and the ChangeSet op data. A unique leading merchant token is a strong, high-confidence signal and deserves a first-class match type distinct from the broader `contains`.

## 2. Named-environment AI skip

US-01 claimed "Named environments skip AI calls." No such gating exists — AI is gated solely by presence of `ANTHROPIC_API_KEY` / `CLAUDE_API_KEY` in `ai-runtime.ts`. If named/seeded environments should never spend tokens, add an explicit env guard (e.g. skip the completer when a `POPS_ENV`/named-environment flag is set) that short-circuits `analyze` / `generate-rules` / `propose` / `revise` to their null/fallback paths.

## 3. Confidence-threshold confirmation flow

US-03 specified that suggestions with confidence `< 0.8` route to a distinct confirmation UI (showing pattern, match type, and how many transactions it would match) while higher-confidence ones apply more directly. In code, every proposal — regardless of confidence — goes through the same `CorrectionProposalDialog`; there is no `0.8` branch and no separate low-confidence prompt. The dialog already surfaces the impact preview, so this is a UX-gating decision, not a missing capability.

Build: gate the proposal entry on confidence — auto-stage high-confidence proposals into pending (still committed only at `commitImport`) and reserve the full review dialog / an inline toast for low-confidence ones, surfacing the affected-row count up front.

## 4. In-session re-suggestion suppression

US-03 also required that a pattern the user rejected is **not re-suggested for the same description within the same import**. Today rejection feedback is persisted to the settings store and used to _adapt_ the next AI proposal (`interpretRejectionFeedback`), but there is no per-session suppression set — correcting another row with the same description can re-trigger the same proposal.

Build: track rejected `(description)` or `(matchType, pattern)` signals in the import session/store and skip auto-proposing them again for the remainder of that import.

## 5. Background batch-analysis driver

US-04 described `generateRules` running "periodically / in the background during the review step" to refine proposals as corrections accumulate, complementing the immediate per-correction `analyze`. The `POST /corrections/generate-rules` endpoint exists and is batch-capable (1–50 txns, single AI call), but the frontend only ever calls per-correction `analyze` — nothing drives the batch endpoint during review.

Build: a debounced/periodic driver in the review step that collects recent corrections and calls `generate-rules`, surfacing refined proposals (still requiring approval) without blocking the immediate per-correction feedback.
