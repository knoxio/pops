/**
 * Settings manifests previously lived here (PRD-101 US-04 follow-up). With
 * PRD-239 US-01..US-05 all landed, every manifest now lives in its owning
 * pillar's contract package and `@pops/pillar-sdk/settings` re-exports them
 * directly. This barrel intentionally exports nothing and the entire
 * `packages/module-registry/src/settings/` directory is scheduled for deletion
 * in PRD-240 US-05.
 */
export {};
