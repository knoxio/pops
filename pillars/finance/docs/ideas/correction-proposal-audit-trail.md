# Idea: persistent, queryable correction-proposal audit trail

> Source: split out of the Correction Proposal Engine PRD (former US-05). The
> proposal lifecycle works; what is NOT built is a durable, queryable record of
> every proposal attempt and its outcome.

## Problem

Today the only persisted artefact from the proposal flow is **rejection
feedback**, stored in finance's local settings store under
`corrections.changeSetRejections:<matchType>:<normalizedPattern>` (one record
per key, overwritten on each rejection — it is "the latest rejection for this
pattern", not a log). There is:

- no persisted record of **approved/applied** proposals beyond the resulting
  rule rows themselves
- no record of proposal _attempts_ (the triggering transaction, the proposed
  ops, the impact summary) that did not result in a rule change
- no append-only history — re-rejecting the same pattern clobbers the prior
  feedback record
- no read surface to query "why did the system learn this rule" or "what was
  proposed for this import session"

The current observable trail is server-side logs only.

## Build later

A first-class audit store for the proposal engine:

- A `correction_proposal_events` table (append-only) recording, per attempt:
  triggering transaction reference(s) (import-session-scoped checksum/id), the
  proposed `ChangeSet` ops, the impact-preview summary (counts), the outcome
  (`proposed` / `applied` / `rejected`), and on rejection the feedback message.
- Stamp each event with the import session id so a whole session's learning
  history is reconstructable.
- A read endpoint (e.g. `GET /corrections/proposal-events`) filterable by
  session, pattern, and outcome, for debugging unexpected matches and support.
- Keep rejection feedback append-only here too, so the proposal engine can still
  read "latest rejection for pattern" but history is never lost.

## Notes

Decide whether this duplicates anything the `ai` pillar's telemetry already
captures before building — the proposal _content_ (ops, impact, feedback) is
finance-domain and not covered by AI telemetry, so a finance-local store is the
likely home. Keep it append-only; the current overwrite-per-key behaviour is the
specific gap this fixes.
