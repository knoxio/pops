# US-05: Drag-to-reorder priority

> PRD: [032 — Global Rule Manager & Priority Ordering](README.md)
> Status: Done

## Description

As a user, I want to drag rules in the browse-mode sidebar to reorder them so that I can control which rule takes precedence when multiple rules match a transaction.

## Acceptance Criteria

- [x] Each rule row in the browse-mode sidebar has a visible drag handle on the left.
- [x] Dragging a rule to a new position produces `edit` ChangeSet ops that update the `priority` field for all affected rules.
- [x] After a drop, priorities are renumbered using gaps of 10 (e.g. 10, 20, 30...) so that future insertions between rules don't require renumbering the entire list.
- [x] The sidebar list order reflects priority order (`priority ASC`, `id ASC` tie-break) at all times, including after a reorder.
- [x] Drag-and-drop works correctly when the list contains a mix of DB rules and pending rules.
- [x] A reorder followed by Cancel discards all priority changes from that dialog session.
- [x] The drag interaction provides visual feedback: a ghost element follows the cursor and a drop indicator marks the target position.

## Notes

Use a library that supports accessible drag-and-drop (keyboard reorder via arrow keys as a fallback). The gap-of-10 strategy means a list of 5 rules after reorder gets priorities 10, 20, 30, 40, 50 rather than 0, 1, 2, 3, 4. This avoids cascading edits when the user later inserts a rule between two existing ones.
