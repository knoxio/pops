/**
 * Public surface for the shell-side pillar boot module (ADR-026 P3).
 *
 * `App.tsx` mounts `<PillarStatusProvider>`; `router.tsx` wraps each
 * per-module route subtree in `<PillarGuard>`. Everything else is a
 * consumer hook or a placeholder.
 */
export { PillarGuard } from './PillarGuard';
export { PillarStatusProvider } from './PillarStatusProvider';
export { PillarUnavailableRoute } from './PillarUnavailableRoute';
export { usePillarStatus, usePillarStatusContext } from './usePillarStatus';
export { pillarIdForModule, REGISTRY_PILLAR_ID } from './manifest-pillar';
export type { PillarBootSnapshot, PillarHealthStatus, PillarStatusContextValue } from './types';
