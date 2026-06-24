# App Theme Colour Propagation

> Pillar: [@pops/shell](../../README.md)
> Status: Done

## Purpose

Propagate the active pillar's declared accent colour to every component inside
that pillar via the CSS cascade. On `/media` (indigo), every component using
`bg-app-accent` renders indigo; switch to `/finance` (emerald) and the same
components render emerald. No component knows which pillar it is in — the shell
sets one class on the layout root and the cascade does the rest.

## Mechanism

1. Each pillar declares a `color` token in its `AppNavConfig` (e.g.
   `color: 'indigo'`).
2. `RootLayout` detects the active pillar from the current URL path (via the
   boot-resolved rail) and resolves it to a class: `app-${activeApp.color}`
   (`undefined` when the pillar declares no colour).
3. That class is applied to the layout root element.
4. The `.app-<color>` classes (defined in `@pops/ui`'s theme CSS) set
   `--app-accent` / `--app-accent-foreground` **and** `--primary` /
   `--primary-foreground`, each with light- and dark-mode oklch values.
5. All descendant components using `bg-app-accent`, `text-app-accent`, etc.
   (and anything keyed on `--primary`) pick up the colour automatically.

Because the class sets `--primary` too, the active pillar's accent flows through
primary-keyed components (buttons, focus rings) as well as the dedicated
`app-accent` tokens.

## Colour tokens

`.app-emerald`, `.app-indigo`, `.app-amber`, `.app-rose`, `.app-sky`,
`.app-violet`, `.app-sky`, … each define light + dark oklch values for
`--app-accent` / `--app-accent-foreground` / `--primary` /
`--primary-foreground`. No app colour is set when the pillar declares none; the
root `--app-accent` / `--primary` defaults stand (the neutral primary fallback).

| Pillar    | Colour token                              |
| --------- | ----------------------------------------- |
| Finance   | emerald                                   |
| Media     | indigo                                    |
| Inventory | amber                                     |
| AI        | violet                                    |
| (others)  | their declared token, or primary fallback |

## Business rules

- The shell is the **only** thing that sets the active-app class — pillar code
  never sets `--app-accent` directly.
- `@pops/ui` components reference `bg-app-accent` / `text-app-accent` tokens,
  never specific colour names (`grep` for hardcoded `bg-indigo-*` in `@pops/ui`
  returns zero hits).
- The colour propagates through the cascade — no prop drilling.
- Opacity modifiers work (`bg-app-accent/10`, `text-app-accent/80`).
- The app rail's active indicator uses the active pillar's accent.
- The colour updates instantly on pillar switch — the class change is a single
  re-render of the layout root, no flash.

## Edge cases

| Case                                                  | Behaviour                                                                          |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Pillar declares no `color`                            | No `app-*` class applied; `--app-accent` / `--primary` keep their neutral defaults |
| Component rendered in shell chrome (outside a pillar) | Uses the neutral default (no `app-*` ancestor)                                     |
| Pillar switch                                         | Class swaps in one render; light/dark both resolve via the `.dark` variants        |
| Storybook                                             | The theme decorator's colour picker previews any pillar colour                     |

## Acceptance criteria

Shell propagation (folded from us-01):

- [x] `RootLayout` reads the active pillar's `color` from the boot-resolved rail
      and applies `app-${color}` to the layout root (or no class when unset).
- [x] The `.app-<color>` classes set `--app-accent` / `--app-accent-foreground`
      (and `--primary` / `--primary-foreground`) for light and dark mode.

Rail accent (folded from us-02):

- [x] The app rail's active indicator renders in the active pillar's accent
      colour.

Component verification (folded from us-03):

- [x] Components using `app-accent` tokens render correctly across every pillar
      colour in light and dark mode.
- [x] `@pops/ui` components contain no hardcoded app colour classes.
- [x] Opacity modifiers (`bg-app-accent/10`) resolve correctly.
- [x] A pillar with no declared colour falls back to the neutral primary.
