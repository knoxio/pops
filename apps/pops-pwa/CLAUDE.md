# POPS PWA — Frontend Standards

## Core Principles

### State Management

1. **Server State** → React Query (via tRPC)
   - All API data lives in React Query cache
   - Never duplicate server data in Zustand

2. **Client State** → Zustand
   - UI preferences: sidebar open/close, theme (dark/light)
   - Transient UI state: modal open, selected items
   - Persist with `zustand/middleware` where appropriate

3. **Form State** → React Hook Form + Zod
   - All forms use react-hook-form
   - Validation via Zod schemas (shared with backend via tRPC)

4. **URL State** → React Router params
   - Filters, pagination, search → URL query params
   - Use `useSearchParams()` hook

### Component Architecture

**Pages** (`src/pages/*.tsx`):
- Single file per page
- Contains queries, state, and UI
- Split into smaller components only when necessary

**Components** (`src/components/*.tsx`):
- Reusable across pages
- Complex interactive components get Storybook stories (data tables, filter panels, forms)
- Simple display components skip Storybook (cards, wrappers)

**Layouts** (`src/app/layout/*.tsx`):
- RootLayout (top bar + sidebar + outlet)
- Can manage UI state (Zustand for sidebar)

### Type Safety

- **Never use `any`** — banned
- **tRPC inference** — Types are automatically inferred from backend
- **Import AppRouter type** from backend: `import type { AppRouter } from '@pops/api'`
- **Zod 3.x** — pinned across monorepo for tRPC compatibility

### Styling

- **Tailwind CSS v4** only — no CSS modules, no styled-components
- **shadcn/ui** components as base
- **`cn()` utility** for conditional classes
- **Dark mode** via `class="dark"` on root element (managed in Zustand)

### File Organization

```
src/
├── app/
│   ├── App.tsx               # Root component with providers
│   ├── router.tsx            # React Router configuration
│   └── layout/               # App-level layouts
│       ├── RootLayout.tsx    # Top bar + sidebar wrapper
│       ├── Sidebar.tsx       # Navigation sidebar
│       └── TopBar.tsx        # User info, page title, theme toggle
├── pages/
│   ├── DashboardPage.tsx     # Page = queries + UI in one file
│   ├── TransactionsPage.tsx
│   └── ...
├── components/
│   ├── ErrorBoundary.tsx     # React error boundary
│   ├── TransactionTable.tsx  # Complex → Storybook story
│   └── BudgetCard.tsx        # Simple display → no story
├── lib/
│   ├── trpc.ts               # tRPC client
│   └── utils.ts              # cn() utility
├── hooks/
│   └── useAuth.ts            # Extract user email from CF JWT
├── store/
│   ├── uiStore.ts            # Sidebar state
│   └── themeStore.ts         # Theme state
└── styles/
    └── globals.css           # Tailwind @theme config
```

### Error Handling

- **React Error Boundary** wraps Outlet in RootLayout
- **tRPC query errors** handled via `isError` + `error` from React Query hooks
- **401 errors** (CF Access token expiry) → redirect to login
- **Network errors** → show retry button

### Storybook (Selective)

**Write stories for**:
- Data tables with filtering/sorting
- Filter panels with complex interactions
- Forms with validation
- Charts with mock data

**Skip stories for**:
- Simple display cards
- Wrapper components
- Layouts
- Pages with API dependencies

### Code Quality

- **TypeScript strict mode** — `noImplicitAny`, `strictNullChecks`
- **ESLint** — zero warnings
- **No type assertions** (`as`) unless absolutely necessary
- **No suppression** — fix the issue, don't silence it

### Security

- **Cloudflare Access JWT validation** in backend middleware
- **User email** extracted from JWT claims
- **No password auth** — CF Access handles everything
- **Never commit** `.env`, API tokens, or secrets

### Performance

- React Query default: `staleTime: 5min`, `refetchOnWindowFocus: true` (financial data should be fresh)
- Lazy load routes with React Router's `lazy()` when needed
- Don't optimize prematurely — measure first

### Git Workflow

- Work on feature branches: `feature/transactions-page`
- Commit with conventional commits: `feat: add transactions table`
- Create PR when done — CI must pass (typecheck + lint + build)
- No direct commits to main
