# PRD-025: AI Operations App

**Epic:** [01 — AI Operations App](../themes/ai/README.md)
**Theme:** AI
**Status:** Draft
**Depends on:** PRD-002 (shell), PRD-001 (UI library)

## Problem Statement

AI usage tracking currently lives in `@pops/app-finance` as the "AI Usage" page, but it queries `core.aiUsage` — a core module that tracks platform-wide AI costs, not finance-specific data. As AI extends beyond finance (media categorisation, inventory tagging, overlay assistant), the usage dashboard needs to be domain-agnostic. Keeping it in the finance app is architecturally wrong and confusing to the user.

## Goal

Extract AI usage tracking into a standalone app package (`@pops/app-ai`) with its own sidebar entry, route namespace, and room to grow into the operational hub for all AI capabilities in POPS.

## Requirements

### R1: App Package (`packages/app-ai/`)

```
packages/app-ai/
  package.json            (@pops/app-ai)
  tsconfig.json
  src/
    index.ts              (exports routes and navConfig)
    routes.tsx            (route definitions)
    lib/
      trpc.ts             (re-export from shell)
    pages/
      AiUsagePage.tsx     (moved from @pops/app-finance)
```

### R2: Route Namespace

```typescript
export const navConfig = {
  id: "ai",
  label: "AI",
  icon: "Bot",
  color: "violet",
  basePath: "/ai",
  items: [
    { path: "", label: "Usage", icon: "BarChart3" },
  ],
};

export const routes = [
  { index: true, element: <AiUsagePage /> },
];
```

URL: `/ai` → AI Usage page.

### R3: Shell Registration

- Add `@pops/app-ai` to the shell router (`apps/pops-shell/src/app/router.tsx`)
- Add `Bot` and `BarChart3` to the icon map
- The AI app appears in the sidebar app rail alongside Finance, Media, and Inventory

### R4: Finance App Cleanup

- Remove `AiUsagePage.tsx` from `@pops/app-finance`
- Remove the "AI Usage" nav entry from `@pops/app-finance/routes.tsx`
- Remove the `/ai-usage` route from finance
- Redirect `/finance/ai-usage` → `/ai` for bookmarks (temporary, remove after 1 release)

### R5: Future Pages (stub — not built yet)

The AI app will grow to include:

- **Categorisation Rules** — View/edit AI-generated entity matches, category rules, and cache entries
- **Model Configuration** — Select AI model, set token budgets, configure fallback behaviour
- **Prompt Templates** — View/edit prompts used for categorisation, entity matching, and future overlay queries
- **AI Activity Log** — Detailed log of all AI API calls with request/response, latency, and cost per call

These are out of scope for this PRD — listed here so the app structure anticipates them.

## Out of Scope

- AI Overlay (Phase 3 — separate epic)
- AI Inference / Moltbot (Phase 3 — separate epic)
- Building the future pages listed in R5
- Changing the `core.aiUsage` backend module (stays where it is — it's correctly in core)

## Acceptance Criteria

1. `packages/app-ai/` exists as a workspace package
2. AI Usage page accessible at `/ai`
3. AI app appears in the sidebar with Bot icon
4. `AiUsagePage.tsx` removed from `@pops/app-finance`
5. `/finance/ai-usage` route no longer exists
6. `pnpm typecheck` and `pnpm test` pass
7. Storybook discovers stories from `@pops/app-ai` (if any added)

## User Stories

#### US-1: Extract app package
**Scope:** Create `packages/app-ai/` with package.json, tsconfig, routes.tsx, navConfig. Move `AiUsagePage.tsx` from `@pops/app-finance`. Update imports (trpc, UI). Register in shell router and icon map. Remove from finance routes/nav. Verify `/ai` loads the usage page.
**Files:** New package, `apps/pops-shell/src/app/router.tsx`, `apps/pops-shell/src/app/nav/icon-map.ts`, `packages/app-finance/src/routes.tsx`
