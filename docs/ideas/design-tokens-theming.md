# Idea: Finish design-token cleanup in pillar frontends

The token system itself (`@pops/ui/theme`) is shipped and clean. What remains is mechanical cleanup in consumer code that was never completed. See the PRD: [design-tokens-theming](../themes/foundation/prds/design-tokens-theming.md).

## Outstanding work

### 1. Replace hardcoded app-accent classes in pillar frontends

~44 instances of hardcoded accent hues remain across `pillars/*/app/src` (excl. stories/tests). Replace each with `app-accent` token variants so the per-app accent cascades automatically. Known offenders:

- `pillars/ai/app` — `daily-cost-chart.tsx`, `budget-status-section.tsx`, `slow-queries-card.tsx` (`text-amber-600`, `bg-amber-500`, `bg-emerald-500`)
- `pillars/cerebrum/app` — `PriorityBadge.tsx`, `ProposalQueuePage.tsx`, `EngramDetailPage.tsx` (`bg-rose-500/10`, `bg-amber-500/10`, `bg-sky-500/10`, `text-*-400`)
- `pillars/finance/app` — `imports/*`, `search/EntitiesResultComponent.tsx` (`bg-amber-500`, `text-amber-600`, `bg-violet-500/10`)

Note: not every hit is an "app accent" — some are multi-state semantic encodings (priority high/medium/low, proposal type). Those should move to design-token utilities (`bg-warning/10`, `bg-info/10`, `bg-stat-rose/10`) rather than `app-accent`, mirroring the `statusBadgeTones` helper already used in `@pops/ui`. Decide per-call-site: per-app accent → `app-accent`; semantic status → status/stat token.

Do one pillar at a time and verify light/dark visually between each.

Acceptance: `grep -rE '(bg|text|border|ring)-(indigo|emerald|amber|rose|sky|violet)-[456]00' pillars/*/app/src` returns zero non-story/non-test hits.

### 2. Remove the last stray status colour

`pillars/food/app/src/pages/plan/PlanCell.tsx` uses `bg-green-100/30`. Replace with a `bg-success/*` token.

Acceptance: `grep -rE '(bg|text|border|ring)-(red|green|yellow|blue)-[0-9]' pillars/*/app/src` returns zero non-story/non-test hits.

### 3. Fix the last inline-style violation in `@pops/ui`

`libs/ui/src/components/TreeView.tsx` hardcodes `style={{ paddingLeft: \`${level * 14}px\` }}`. The `--tree-indent-step` / `--tree-indent-base` tokens already exist and are consumed correctly in `pillars/inventory/app`. Migrate `TreeView` to `calc(${level} \* var(--tree-indent-step) + var(--tree-indent-base))` for consistency.

Acceptance: `grep 'style={{' libs/ui/src` (excl. stories/tests) returns only permitted dynamic patterns (progress widths, canvas dimensions, runtime CSS-var styles).

### 4. Repair stale `@source` globs (housekeeping)

`libs/ui/src/theme/globals.css` `@source` lines still reference the removed `apps/*` and `packages/*` trees. Repoint at `pillars/*/app/src` (and any other live consumer trees) or drop them in favour of Tailwind v4 workspace auto-detection.
