# US-01: Create shell scaffold

> PRD: [005 — Shell](README.md)
> Status: Done

## Description

As a developer, I want `pops-shell` to exist with an entry point, Vite config, and provider stack so that I have a running shell to wire apps into.

## Acceptance Criteria

- [x] `apps/pops-shell/package.json` exists
- [x] `apps/pops-shell/vite.config.ts` configured (react plugin, tailwindcss, proxy `/trpc` → localhost:3000, port 5566)
- [x] `apps/pops-shell/index.html` exists
- [x] `apps/pops-shell/src/main.tsx` mounts the App component
- [x] `apps/pops-shell/src/app/App.tsx` has provider stack: tRPC, React Query, theme, Toaster (Sonner)
- [x] `pnpm dev` starts the shell and renders a blank page (no layout yet)
- [x] Workspace packages (`@pops/ui`) resolve correctly from the shell

## Notes

This is the scaffold only. Layout (US-02), routing (US-03), and tRPC client (US-05) build on top of this.
