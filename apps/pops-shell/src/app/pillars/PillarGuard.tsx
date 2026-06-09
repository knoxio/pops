/**
 * Conditional renderer that short-circuits a per-module route subtree to
 * `PillarUnavailableRoute` when the owning pillar's health is
 * `'unavailable'` (ADR-026 P3).
 *
 * `'unknown'` (still booting / boot failed) and `'healthy'` both render
 * the children. The shell explicitly does not paint placeholders during
 * the boot fetch so transient probe failures stay invisible to users on
 * working pillars.
 */
import { PillarUnavailableRoute } from './PillarUnavailableRoute';
import { usePillarStatus } from './usePillarStatus';

interface PillarGuardProps {
  /** Pillar id this route belongs to (mapped via `pillarIdForModule`). */
  readonly pillarId: string;
  readonly children: React.ReactNode;
}

export function PillarGuard({ pillarId, children }: PillarGuardProps): React.ReactElement {
  const status = usePillarStatus(pillarId);
  if (status === 'unavailable') return <PillarUnavailableRoute pillarId={pillarId} />;
  return <>{children}</>;
}
