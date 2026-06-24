# Send-to-list merge fidelity

Forward-looking refinements to the recipe send-to-list flow (`../prds/send-to-list/`). The current flow delegates merge semantics to the `lists` pillar's `upsert-by-ref`, which is intentionally domain-agnostic: it appends notes with a `\n` separator, never truncates, and replaces the label wholesale with whatever food sent on that call. That leaves two food-specific behaviours unbuilt.

## 1. Bounded, food-formatted notes

Today repeated sends to the same list item grow `notes` without bound. The original intent was:

- Cap merged notes at ~500 characters.
- Truncate the **oldest** entries first, prefixing `…` so the user knows truncation happened.
- Use a food-friendly separator (`; `) instead of the generic `\n`.

Because lists owns the merge, this needs either: (a) a lists-pillar `onConflict` mode / option that accepts a max-notes length + separator + truncate-from-front policy, or (b) food pre-reading the existing item's notes and sending a pre-capped value. Option (a) keeps the atomic single-call merge; (b) reintroduces a read-modify-write race that `upsert-by-ref` was designed to remove. Prefer (a).

## 2. Label regenerated from the summed quantity on merge

`relabelAfterMerge()` already exists in `send-items.ts` but is **dead code** — it is never called in the send path. On merge, food sends the label computed from _this send's_ qty, and lists replaces the label wholesale. So sending 1× then 4× of the same ingredient leaves the list-item label reading the last send's quantity, not the cumulative `5×` total — even though the stored `qty` is correctly summed by `merge-additive`. The label and the qty disagree after a merge.

Fix options:

- Lists regenerates nothing and returns the merged qty; food re-issues a label update with `relabelAfterMerge(item, mergedQty)`. Two round-trips per merged item.
- Lists exposes a "relabel from a template" hook so the merged label can be rebuilt server-side from the summed qty + unit + a label template food supplies. One round-trip, keeps atomicity.

Either way the dead `relabelAfterMerge` helper becomes load-bearing or is deleted.

## 3. Server-side recipe-title escaping for "already sent"

The "already sent" detection is now a lists-pillar `notesContains` substring search. If that ever moves to a SQL `LIKE`, recipe titles containing `%` or `_` must be escaped before the query. Not a concern while it stays a plain substring match, but worth pinning if the lists search implementation changes.

## Why deferred

The merge currently produces correct quantities and a usable (if slightly stale) label, and notes growth is a slow leak for a single-user system. The label/qty disagreement is the most user-visible gap and is the first thing to fix if this is picked up.
