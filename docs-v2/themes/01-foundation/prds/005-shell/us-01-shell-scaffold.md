# US-01: Create shell scaffold

> PRD: [005 — Shell](README.md)
> Status: To Review

## Description

As a developer, I want `pops-shell` to exist with an entry point, Vite config, and provider stack so that I have a running shell to wire apps into.

## Acceptance Criteria

- [ ] `apps/pops-shell/package.json` exists
- [ ] `apps/pops-shell/vite.config.ts` configured (react plugin, tailwindcss, proxy `/trpc` → localhost:3000, port 5566)
- [ ] `apps/pops-shell/index.html` exists
- [ ] `apps/pops-shell/src/main.tsx` mounts the App component
- [ ] `apps/pops-shell/src/app/App.tsx` has provider stack: tRPC, React Query, theme, Toaster (Sonner)
- [ ] `pnpm dev` starts the shell and renders a blank page (no layout yet)
- [ ] Workspace packages (`@pops/ui`) resolve correctly from the shell

## Notes

This is the scaffold only. Layout (US-02), routing (US-03), and tRPC client (US-05) build on top of this.
