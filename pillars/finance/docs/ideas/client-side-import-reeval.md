# Client-side import re-evaluation and preview (zero round-trip)

> Idea — building blocks exist and are unit-tested, but the live wizard does not use them.

## Context

The local-first import store buffers correction ChangeSets client-side, but every re-evaluation and every impact preview during review currently goes to the server:

- re-eval → `POST /imports/reevaluate-pending`
- preview → `POST /corrections/preview-changeset`

The server merges `DB rules + pending ChangeSets` and matches there. This was chosen because a pending edit can target a rule that is outside the client's paginated rule view, so the client cannot assemble the full merged rule set on its own.

Two pure primitives already exist and are tested but are wired to nothing live:

- `reevaluateTransactions(uncertain, failed, mergedRules, minConfidence)` in `app/src/lib/local-re-evaluation.ts` — replicates the server's exact→contains→regex priority matching and promotes transactions to `matched`, returning `affectedCount`.
- `computeMergedRules(dbRules, pendingChangeSets)` in `app/src/lib/merged-state.ts` — folds `applyChangeSetToRules` over pending ChangeSets in order.

## What to build later

Make review re-evaluation and ChangeSet preview run entirely client-side with no server round-trip, so feedback is instant:

1. Give the client access to the _complete_ rule set for the session (not just the paginated slice) — e.g. fetch all rules that could plausibly match the session's descriptions, or stream the full rule set once at session start.
2. Drive re-eval from `computeMergedRules` + `reevaluateTransactions` on every `addPendingChangeSet` / `removePendingChangeSet`, replacing the `useReevalOnChangeSets` server call.
3. Feed `computeMergedRules` output as the baseline to a client-side `previewChangeSetImpact`, replacing the `previewMutation` server call, so the preview "before" column reflects all prior pending ChangeSets.
4. Decide the matching default (`minConfidence` 0.7 today) lives in one shared constant so client and server cannot drift.

## Risks / open questions

- The "rule outside the paginated view" problem is the reason this is server-side today. Any client-side version must guarantee the client has every rule that could match, or it will silently produce different results from the eventual commit.
- Re-eval correctness must stay byte-for-byte equivalent to the server matcher (priority order, tie-breaks, regex error handling) or matched counts will disagree between review and commit.
- Pure-function duplication between client (`local-re-evaluation.ts`) and the server matcher is a drift hazard; a shared, importable matcher in `@pops/finance` would be a prerequisite.
