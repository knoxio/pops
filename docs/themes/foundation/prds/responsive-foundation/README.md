# Responsive Foundation

> Theme: [Foundation](../../README.md) · Epic: [Responsive Foundation](../../epics/responsive-foundation.md)
> Status: Partial

The shell and every shared `@pops/ui` component work on every viewport, from a 375px phone to a 1536px+ desktop, with no horizontal overflow. Breakpoints, touch-target minimums, component adaptation patterns, and empty/error-state standards are defined once and inherited by every pillar app for free — a new app gets responsive behaviour simply by using the shared shell and component library.

Responsive behaviour is CSS-driven via Tailwind v4 responsive prefixes. JavaScript viewport detection is not used; there is no `useMediaQuery` in `@pops/ui`. Mobile-first means base utilities target mobile and `md:`/`lg:` prefixes add desktop enhancements.

## Breakpoint System

Tailwind v4 defaults, declared as `--breakpoint-*` tokens in the `@theme` block of the shared design-token stylesheet (`libs/ui/src/theme/globals.css`).

| Name  | Width  | Use case                               |
| ----- | ------ | -------------------------------------- |
| `sm`  | 640px  | Large phones landscape                 |
| `md`  | 768px  | Tablets portrait — **primary divider** |
| `lg`  | 1024px | Tablets landscape, small laptops       |
| `xl`  | 1280px | Desktops                               |
| `2xl` | 1536px | Large desktops                         |

`md` (768px) is the primary mobile/desktop divider. Most layout shifts key off `md:`.

## Shell Layout

The shell renders a fixed top bar, a viewport-adaptive two-level navigation region, and a content area. Layout responds to viewport without any JS detection:

| Viewport            | Navigation                                                                    |
| ------------------- | ----------------------------------------------------------------------------- |
| Mobile (<768px)     | Hamburger button in top bar opens an overlay `Sidebar` listing every app page |
| Tablet (768–1023px) | App rail always visible; per-app page nav opens as an overlay on app-icon tap |
| Desktop (≥1024px)   | App rail + permanent per-app page nav both push content                       |

**Top bar** — fixed, full-width, `h-14` on mobile / `h-16` at `md+`. On mobile it shows the hamburger trigger, the POPS wordmark, and a search icon that expands into a full-width overlay; the per-user email and inline search input are hidden until `md+`. All top-bar controls meet the 44px touch minimum.

**Content padding ownership** — the shell's `<main>` owns page padding: `p-4 md:p-6 lg:p-8`, capped at `max-w-screen-2xl` and centred with `mx-auto`. It also sets `min-w-0 overflow-x-clip` so wide children (tables, grids) cannot force horizontal page overflow. Pages do **not** add their own outer page padding — they render directly into the padded `<main>`. A page that needs a section to bleed edge-to-edge (hero backdrop, full-bleed poster row) opts out locally rather than the shell defaulting to zero padding.

> Drift note: an earlier draft specified `<main>` at `p-0` with each page owning `px-4 md:px-6 lg:px-8`. The implemented model is the inverse — the shell owns the padding. Documented here against the shipped code.

## Page Width Conventions

| Category        | Max width           | Centring | Use when                                                                                 |
| --------------- | ------------------- | -------- | ---------------------------------------------------------------------------------------- |
| **Full-width**  | None                | N/A      | Content fills available space: grids, scroll rows, data tables, hero backdrops           |
| **Constrained** | `max-w-4xl mx-auto` | Centred  | Text/forms that become hard to read at full width: detail-page bodies, settings, wizards |

Rules:

- A constrained section must use `mx-auto`. `max-w-*` without `mx-auto` parks content against the left edge and leaves dead space on the right — never acceptable.
- Pages mix full-width and constrained sections freely (e.g. full-width hero, then constrained body text below).
- No page is designed for a single fixed viewport width.

## Empty and Error States

Empty states and error states carry equal visual weight: an icon, a heading, a description, and (where applicable) an action. A bare red text line is not an acceptable error state.

Shared building blocks live in `@pops/ui`:

| Component       | Use                                                                                    |
| --------------- | -------------------------------------------------------------------------------------- |
| `EmptyState`    | Centred icon + title + description + action slot; `sm`/`md`/`lg` density variants      |
| `EmptyStateTab` | Lightweight centred placeholder for tab/list panels (icon + message)                   |
| `ErrorAlert`    | Standardised destructive `Alert` with title, message, and collapsible technical detail |

`EmptyState` renders with `flex flex-col items-center justify-center text-center`, a muted icon, a `role="status"` wrapper, and a constrained (`max-w-md`) description so it reads well on any width.

## Page Header

`PageHeader` (`@pops/ui`) is the shared title block and encodes the page-title-icon convention:

- **Top-level pages** render the title (optionally with a leading `icon`) and optional actions.
- **Drill-down pages** render a 44px back button plus a breadcrumb trail above the title; the back button + breadcrumb supply the context, so a title icon is not required.
- Breadcrumbs collapse middle segments behind an ellipsis below `sm` and expand at `sm+`.
- The `icon` slot is optional and router-agnostic (`renderLink` lets a page inject its router's `Link`).

The icon-consistency rule is a convention, not a lint: within one app, either all top-level pages carry a title icon matching their nav icon, or none do.

## Component Responsive Behaviour

All adaptation is CSS-driven via Tailwind responsive prefixes; the mobile/desktop split keys off `md` (768px).

| Component           | Mobile (<768px)                                                        | Desktop (≥768px)             | Mechanism                                                                  |
| ------------------- | ---------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `DataTable`         | Horizontal scroll inside a bordered scroll container                   | Full table                   | `overflow-x-auto` wrapper                                                  |
| `DataTable` filters | Collapse behind a "Filters" button → opens a `Dialog` with Apply/Clear | Inline filter grid           | `FilterBar`: mobile button + dialog (`md:hidden`); grid (`hidden md:grid`) |
| Filter fields       | Full-width controls                                                    | Fixed-width where sensible   | `w-full` base; `sm:w-25` / `sm:flex-row` scope fixed widths to ≥640px      |
| Forms / inputs      | Labels stacked above inputs, full-width inputs, ≥44px control height   | Side-by-side where sensible  | `Input` is `h-11 w-full`; labels stack by default                          |
| `Dialog`            | Full-screen (`inset-0`, square corners)                                | Centred overlay (`max-w-lg`) | `inset-0 rounded-none md:inset-auto md:top-1/2 md:left-1/2 md:rounded-lg`  |
| `ChipInput`         | Chips wrap to multiple lines                                           | Inline chips                 | `flex flex-wrap`, container `min-h-11`                                     |
| `PageHeader`        | Stacked title/actions, collapsed breadcrumbs                           | Title and actions in one row | `flex-col sm:flex-row`; breadcrumb `sm:` toggles                           |

Prefer CSS. A `useMediaQuery`-style JS swap is only warranted when behaviour (not just layout) must differ — e.g. swapping a table for a card list. No such swap exists today.

## Touch Target Standards

Per Apple HIG and WCAG:

- Minimum touch target: **44×44px**.
- Minimum spacing between adjacent targets: **8px** (achieved with standard `gap-*` utilities, since the invisible expansions below are inset relative to each control's visual box).
- Applies to buttons, links, checkboxes, radios, switches, chips, tab triggers, table-row actions, and any interactive element.

The visual element may be smaller than 44px; the **tappable area** must not be. Two patterns are used in `@pops/ui` primitives:

1. **Direct sizing** — controls that are already ≥44px set `h-11` / `size-11` (Button `default`/`lg`/`icon`/`icon-lg`, `Input`).
2. **Invisible expansion** — controls whose visual box is smaller add a `relative` position plus a `before:absolute before:-inset-* before:content-['']` pseudo-element that enlarges the hit area to ≥44px without changing the visual.

Canonical pattern (`primitives/button.tsx`):

```tsx
"relative h-8 before:absolute before:-inset-1.5 before:content-['']";
// 32px visual + 6px each side via `before` = 44px tappable, ≥ 44px
```

Where the patterns are applied:

| Control                                      | How it meets 44px                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Button `default` / `lg` / `icon` / `icon-lg` | `h-11` / `size-11` directly                                                   |
| Button `xs` / `sm` / `icon-xs` / `icon-sm`   | `before:-inset-*` pseudo-element expansion                                    |
| Legacy `components/Button` `sm`              | `before:-inset-y-1 before:inset-x-0` expansion                                |
| Legacy `components/Button` `link`            | `min-h-11`                                                                    |
| `Checkbox`, `RadioGroupItem`                 | `before:-inset-3.5` around the 16px visual                                    |
| `Switch`                                     | `before:-inset-3.5` (`data-[size=sm]:before:-inset-4`)                        |
| `TabsTrigger`                                | `min-w-11` so a short-label tab in a scrolled strip still meets minimum width |
| `Dialog` close button                        | `min-w-11 min-h-11`                                                           |
| `PageHeader` back button                     | `min-w-11 min-h-11`                                                           |

## Business Rules

- No horizontal overflow at 375px on any shell page. The shell's `<main>` enforces `min-w-0 overflow-x-clip` to contain wide children.
- Mobile-first CSS: base utilities target mobile, `md:`/`lg:` prefixes add desktop enhancements.
- Every component works in light and dark mode on every viewport (design tokens are CSS variables, so both modes inherit the same responsive structure).
- Responsive behaviour is inherited: a new app using the shell and `@pops/ui` gets it for free.
- No JavaScript viewport detection — adaptation is Tailwind responsive classes.

## Edge Cases

| Case                 | Behaviour                                                                        |
| -------------------- | -------------------------------------------------------------------------------- |
| iPad (768–1024px)    | Works naturally via the `md` breakpoint (app rail + overlay page nav)            |
| Import wizards       | Constrained (`max-w-4xl mx-auto`) and usable on mobile, though a power-user flow |
| Mobile detection     | Not done in JS — Tailwind responsive classes only                                |
| HomePad / wall mount | Future concern — a dedicated dashboard mode, out of scope here                   |

## Acceptance Criteria

### Breakpoints and shell

- [x] Breakpoints `sm`/`md`/`lg`/`xl`/`2xl` at 640/768/1024/1280/1536 declared as `--breakpoint-*` tokens in the shared `@theme` block
- [x] Top bar is compact on mobile: hamburger trigger + wordmark + search-icon overlay; user email and inline search hidden below `md`
- [x] App switcher has a mobile pattern — hamburger opens an overlay `Sidebar` listing every app page; tablet/desktop use app rail + page nav
- [x] Content area is full-width with viewport-stepped padding (`p-4 md:p-6 lg:p-8`), capped and centred (`max-w-screen-2xl mx-auto`)
- [x] No horizontal overflow at 375px — `<main>` sets `min-w-0 overflow-x-clip`
- [x] Fixed shell chrome (top bar, nav region) stays fixed on scroll

### Component audit

- [x] `DataTable` scrolls horizontally on mobile via an `overflow-x-auto` wrapper; no content clipped
- [x] Table filters collapse behind a "Filters" button on mobile that opens a `Dialog` with Apply/Clear; inline grid at `md+`
- [x] Forms: labels stacked above inputs, inputs full-width, control height ≥44px (`Input` is `h-11 w-full`)
- [x] `Dialog` is full-screen on mobile (`inset-0`, square corners) and a centred `max-w-lg` overlay at `md+`
- [x] Filter selects use `w-full` on mobile; `sm:` scopes fixed widths to ≥640px (no viewport clipping)
- [x] `ChipInput` wraps chips across multiple lines (`flex flex-wrap`, container `min-h-11`)

### Touch targets (primitives)

- [x] Button variants meet 44px: `h-11`/`size-11` directly, or `before:` pseudo-element expansion on `xs`/`sm`/`icon-xs`/`icon-sm`
- [x] Legacy `components/Button` `sm` gains `before:-inset-y-1` expansion; `link` gains `min-h-11`
- [x] `Checkbox`, `RadioGroupItem`, `Switch` expand the tappable area with `before:-inset-3.5` (switch `sm` uses `-inset-4`)
- [x] `TabsTrigger` carries `min-w-11` so short-label tabs in a scrolled strip meet minimum width
- [x] `Dialog` close and `PageHeader` back button are `min-w-11 min-h-11`
- [x] Button touch-target classes are asserted by `primitives/touch-targets.test.ts` (9 test cases covering every size variant)

### Page conventions

- [x] Full-width vs constrained (`max-w-4xl mx-auto`) page-width convention documented and used by real pages
- [x] Padding ownership documented (shell `<main>` owns padding; pages opt out for full-bleed sections)
- [x] Empty-state pattern shipped as reusable components (`EmptyState`, `EmptyStateTab`)
- [x] Error-state pattern shipped (`ErrorAlert`) with equal visual weight to empty state
- [x] `PageHeader` encodes the title-icon convention (optional `icon`, back button + breadcrumbs for drill-downs)
- [x] `mx-auto` centring rule documented for constrained sections

## Verification

- No horizontal scroll at 375px on shell pages; `<main>` clips overflow.
- `@pops/ui` primitives render at 375/390/428px without overflow.
- Button touch-target variants verified by `primitives/touch-targets.test.ts` (9 test cases, green).
- Forms stack on mobile; dialogs go full-screen; `DataTable` scrolls horizontally.
- Constrained sections centre with `mx-auto`.
- Empty and error states use the shared `EmptyState` / `ErrorAlert` components.
- Light and dark mode both work on mobile (shared CSS-variable tokens).

## Not Yet Done

Tracked in [ideas/responsive-foundation.md](../../../../ideas/responsive-foundation.md):

- **Consumer-side touch-target audit** — raw `<button>`/`<a>` and icon glyphs used as click targets outside the `@pops/ui` primitive system are not guaranteed 44px. Primitive enforcement shipped without blocking on hundreds of call-site changes.
- **`Chip` remove button at 44px** — the in-`Chip` remove control is a raw `<button>` with `p-0.5`, below the 44px minimum; it does not yet route through the Button primitive or carry a `before:` expansion.
- **Broader primitive touch-target test coverage** — only Button variants are asserted by automated tests; checkbox/radio/switch/tabs carry the classes but lack assertions.
- **Title-icon consistency enforcement** — the all-or-none rule is a convention only, with no lint or test enforcing it per app.

## Out of Scope

- Native mobile app
- PWA service worker / offline support
- App-specific page redesigns
- Mobile-specific gestures (swipe, pull-to-refresh)
- Mobile-network performance optimisation
