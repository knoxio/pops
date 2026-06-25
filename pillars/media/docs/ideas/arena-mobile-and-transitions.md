# Arena mobile breakpoints and inter-pair transitions

The Compare Arena ([prds/arena](../prds/arena.md)) ships a single fixed `1fr auto 1fr` grid and snaps instantly between pairs. Two polish items were deliberately left out of the redesign and remain unbuilt:

## Mobile layout breakpoints

On narrow viewports the two posters and the vertical center action column are cramped. Build a responsive variant:

- Stack the cards vertically (or shrink posters) below a `sm` breakpoint.
- Relocate the draw-tier / skip column to a horizontal bar between or below the cards so it stays reachable with a thumb.
- Keep the bottom hover-overlay actions accessible without hover (they already reveal on `group-focus-within`, but verify tap targets meet the 44px minimum on mobile).

## Inter-pair transitions

When a comparison is recorded the next pair currently replaces the old one with no motion. Add a transition (slide/fade the outgoing pair out, the incoming pair in) so the user perceives progress and the swap feels less jarring. Must not delay interactivity — the new pair should be clickable immediately, with the animation purely decorative.

Both are pure frontend changes in `pillars/media/app`; no contract or ELO changes.
