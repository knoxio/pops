# Idea: Per-tag accept/reject + "New" markers in import Tag Review

Forward-looking. Pulled out of the import-wizard PRD because the wire carries the
data but the UI does not yet act on it.

## What exists today

- `SuggestedTagSchema` (`rest-imports-schemas.ts`) already carries `source`
  (`ai` | `rule` | `entity`), an optional `pattern`, and an optional `isNew`
  flag for AI-suggested tags that are not yet in the user's vocabulary.
- The Tag Review `TagEditor` renders source-icon badges (🤖 / 📋 / 🏪) and a
  rule-pattern tooltip, but it is otherwise a free-form add/remove editor.

## What to build

1. **"New" markers.** When a suggested tag has `isNew === true`, render a visible
   "New" affordance on the chip (and in the editor popover) so the user can tell
   a brand-new tag from one already in their vocabulary. The flag is plumbed all
   the way to `TagEditor` already — only the render is missing.

2. **Per-tag accept / reject.** Today the editor only supports add/remove of the
   final tag set. Add explicit accept/reject per suggested tag, at two scopes:
   - **Group scope** — accept/reject a suggested tag for every transaction in an
     entity group at once.
   - **Transaction scope** — override the group decision for a single
     transaction.
     Rejection should be sticky for that import session (a rejected suggestion does
     not silently come back via a group-level "Apply Suggestions").

3. **Empty-vocabulary suggestions.** Guarantee that in a database with no
   existing tags, Tag Review still surfaces AI suggestions (all of which would be
   `isNew`). This is mostly a processing-side guarantee; the UI half is the
   "New" marker above.

## Why deferred

These are net-new interaction surfaces, not partial wiring. The acceptance
criteria for them were left unchecked in the original user stories (US-18,
US-19) and no code renders `isNew` or offers a per-tag accept/reject control.
