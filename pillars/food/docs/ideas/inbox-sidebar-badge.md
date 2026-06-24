# Idea: Inbox sidebar pending-count badge

## Problem

The review-queue page (`/food/inbox`) surfaces the pending-draft count only inside its own header. To notice fresh ingests, the user has to be on the page already. A badge on the global nav rail's Inbox entry would advertise the queue depth from anywhere in the app.

## Why it isn't built

The nav rail is owned by `pillars/shell`, and its nav-item schema has no badge surface today. The food app exposes the data (`GET /inbox/pending-count`, polled every 60s) and the page header consumes it, but nothing can paint a number on the shell's Inbox link.

## Proposed scope

- Extend the shell nav-item contract with an optional badge slot (count + a render hint), so any pillar can attach a live counter to its nav entries.
- Wire the food Inbox entry to `food.inbox.pending-count`, refreshing on a 60s interval.
- Cap the rendered value at `99+` when the count exceeds 99.
- The badge reflects the unfiltered queue depth; it may legitimately exceed the visible Drafts list after band filters narrow it — no mismatch indicator needed.

## Acceptance criteria (when built)

- The shell Inbox nav entry shows a badge with the `pending-count` value.
- Values over 99 render as `99+`.
- The badge refreshes on a 60s interval without a manual reload.
- The mechanism is generic enough that another pillar could attach its own counter.
