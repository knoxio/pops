# App Switcher

> Pillar: [@pops/shell](../README.md)
> Status: Done

## Purpose

A two-level navigation system for switching between app pillars and navigating
within the active one. The **app rail** (top-level) selects the pillar; the
**page nav** (second level) navigates within it. It must feel natural with one
installed app and scale to many without redesign — Discord's server rail is the
reference shape.

## Navigation structure

1. **App rail** — narrow vertical strip of pillar icons, always visible on
   desktop/tablet. Highlights the active pillar with a left-edge accent in that
   pillar's colour. A single click navigates to the pillar's `basePath`. The
   rail is collapsible; the collapsed/expanded state persists in `uiStore`.
2. **Page nav** — shows the active pillar's pages alongside the rail.

The rail and page nav are **derived from the boot-resolved install set**
(`BootRegistryProvider` → `useRegisteredApps()`), which is the registry snapshot
or — when the registry is unreachable — the static bundle-map floor. There is no
hand-curated nav literal in the shell.

## Nav config

Each pillar's frontend manifest carries an `AppNavConfig` (in-repo pillars
statically; external pillars projected from the wire `NavConfigDescriptor`):

```ts
interface AppNavConfig {
  id: string; // 'finance', 'media'
  label: string; // 'Finance'
  labelKey?: string; // i18n key
  icon: IconName; // Lucide icon name (resolved via the shell iconMap)
  color?: string; // app accent colour token
  basePath: string; // '/finance'
  items: AppNavItem[];
}

interface AppNavItem {
  path: string; // relative to basePath; '' for index
  label: string;
  labelKey?: string;
  icon: IconName;
}
```

### Ordering

Rail order comes from the manifest-level `navOrder` (mirrors the pillar's
`nav.order` wire field) ascending, with a lexicographic tiebreak on the nav
`id` so authoring order is deterministic without tight numbering. The reconciled
sparse scheme is `finance=10, media=20, inventory=30, food=40, lists=50,
cerebrum=60, ai=70`. External pillars order through the same projection using
their wire `nav.order`.

## Responsive behaviour

| Breakpoint          | App rail                                                        | Page nav                                                  |
| ------------------- | --------------------------------------------------------------- | --------------------------------------------------------- |
| Desktop (≥1024px)   | ~64px icon strip, active accent, hover tooltip, collapse toggle | ~200px panel, pushes content                              |
| Tablet (768–1023px) | visible                                                         | collapses by default; opens as overlay on rail-icon click |
| Mobile (<768px)     | hidden                                                          | hamburger opens an overlay sidebar with all pages         |

## Business rules

- All icons are Lucide (resolved through the shell `iconMap`); an unknown wire
  icon id from an external pillar degrades to a neutral `Compass` fallback. No
  emoji.
- Colours and spacing come from `@pops/ui` design tokens.
- The active pillar and active page are visually distinct.
- Rail collapse state persists via `uiStore` across reloads.
- Navigating away from a pillar and back returns to the last-visited page
  (React Router handles this).
- `/` redirects to the first live app's `basePath` (lowest `nav.order`).

## Edge cases

| Case                                 | Behaviour                                       |
| ------------------------------------ | ----------------------------------------------- |
| Only one app installed               | Rail shows one icon, page nav always visible    |
| Unknown app path (`/foo`)            | `NotFoundPage` within shell layout              |
| App with 10+ page items              | Page nav scrolls independently                  |
| Navigate away and back               | Returns to last-visited page within that pillar |
| External pillar with unknown icon id | Falls back to `Compass`                         |

## Acceptance criteria

Types + registry (folded from us-01):

- [x] `AppNavConfig` / `AppNavItem` types are defined and the app-rail registry
      is built by walking the boot-resolved install set — no hardcoded nav literal.

App rail (folded from us-02):

- [x] The rail renders every installed pillar's icon, sorted by `navOrder`
      ascending with a lexicographic `id` tiebreak.
- [x] The active pillar shows a left-edge accent in its colour; inactive icons
      show a tooltip on hover.
- [x] A collapse toggle works and persists in `uiStore`.
- [x] Works correctly with a single installed pillar.

Page nav (folded from us-03):

- [x] The page-nav panel renders the active pillar's `items`, highlighting the
      active page.
- [x] Page nav scrolls independently when the item list is long.

Layout integration (folded from us-04):

- [x] Rail + page nav are integrated into `RootLayout` with the responsive
      desktop/tablet/mobile behaviour above; mobile uses an overlay sidebar.
- [x] Clicking a rail icon navigates to the pillar's `basePath` and shows its
      pages.
- [x] Adding an in-repo pillar requires only a `bundle-map.tsx` entry; external
      pillars join the rail off the wire with no shell rebuild.
