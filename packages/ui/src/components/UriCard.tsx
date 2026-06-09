/**
 * UriCard — presentation-only renderer for a `UriResolverResult` returned by
 * `core.uri.resolve` (PRD-101 US-08, ADR-012).
 *
 * Switches on `resolution.kind` and renders one of five cards:
 *
 *   - `object`             — the consumer-supplied `renderObject` callback (or
 *                            a default that prints `moduleId`/`type`/`id`)
 *   - `not-found`          — "Not found" placeholder with the typed reference
 *   - `module-absent`      — "Module not installed" placeholder, mirroring the
 *                            tone of PRD-100's `NotInstalledPage`
 *   - `pillar-unavailable` — "Pillar offline" placeholder for a configured-but-
 *                            unreachable pillar (ADR-026 P2; transient, not
 *                            permanent like `module-absent`)
 *   - `malformed`          — "Broken link" placeholder with the malformed URI
 *                            and the parser's reason for debugging
 *
 * The component is presentation-only: it does not call tRPC, does not own
 * state, and accepts an already-resolved `UriResolverResult` as a prop. The
 * caller (e.g. cerebrum's chat bubble, a search result item) is responsible
 * for invoking `core.uri.resolve` and threading the result through.
 */
import { AlertTriangle, FileQuestion, PackageOpen, PlugZap } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '../lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../primitives/card';

import type { UriResolverResult } from '@pops/types';

export interface UriCardProps {
  /** Resolution returned by `core.uri.resolve`. */
  resolution: UriResolverResult;
  /**
   * Renderer for the `object` kind. Receives the dispatcher metadata plus
   * the typed payload (`unknown` from this package's perspective; consumers
   * narrow on `(moduleId, type)`). Falls back to a generic id+type card
   * when omitted — useful for placeholder UI before per-domain cards exist.
   */
  renderObject?: (object: {
    moduleId: string;
    type: string;
    id: string;
    data: unknown;
  }) => ReactNode;
  /** Optional class on the outermost wrapper. */
  className?: string;
}

function formatTypeLabel(type: string): string {
  return type.replace(/-/g, ' ');
}

function DefaultObjectCard({ moduleId, type, id }: { moduleId: string; type: string; id: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{formatTypeLabel(type)}</CardTitle>
        <CardDescription>
          {moduleId} · {id}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function NotFoundCard({ moduleId, type, id }: { moduleId: string; type: string; id: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <FileQuestion className="h-4 w-4" aria-hidden />
          <span>Not found</span>
        </CardTitle>
        <CardDescription>
          No {formatTypeLabel(type)} with id <code>{id}</code> in {moduleId}.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ModuleAbsentCard({ moduleId }: { moduleId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <PackageOpen className="h-4 w-4" aria-hidden />
          <span>Module not installed</span>
        </CardTitle>
        <CardDescription>
          The <strong>{moduleId}</strong> module is not installed in this deployment, so this link
          cannot be resolved.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function PillarUnavailableCard({ moduleId, reason }: { moduleId: string; reason: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-muted-foreground">
          <PlugZap className="h-4 w-4" aria-hidden />
          <span>Pillar offline</span>
        </CardTitle>
        <CardDescription>
          The <strong>{moduleId}</strong> pillar is configured but not currently reachable. The link
          will resolve once the pillar is back online.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </CardContent>
    </Card>
  );
}

function MalformedCard({ uri, reason }: { uri: string; reason: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <span>Broken link</span>
        </CardTitle>
        <CardDescription>
          <code className="break-all">{uri}</code> is not a valid pops: URI.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </CardContent>
    </Card>
  );
}

export function UriCard({ resolution, renderObject, className }: UriCardProps) {
  const wrapper = (node: ReactNode): ReactNode =>
    className ? <div className={cn(className)}>{node}</div> : node;

  switch (resolution.kind) {
    case 'object': {
      if (renderObject) {
        return wrapper(
          renderObject({
            moduleId: resolution.moduleId,
            type: resolution.type,
            id: resolution.id,
            data: resolution.data,
          })
        );
      }
      return wrapper(
        <DefaultObjectCard
          moduleId={resolution.moduleId}
          type={resolution.type}
          id={resolution.id}
        />
      );
    }
    case 'not-found':
      return wrapper(
        <NotFoundCard moduleId={resolution.moduleId} type={resolution.type} id={resolution.id} />
      );
    case 'module-absent':
      return wrapper(<ModuleAbsentCard moduleId={resolution.moduleId} />);
    case 'pillar-unavailable':
      return wrapper(
        <PillarUnavailableCard moduleId={resolution.moduleId} reason={resolution.reason} />
      );
    case 'malformed':
      return wrapper(<MalformedCard uri={resolution.uri} reason={resolution.reason} />);
    default: {
      const _exhaustive: never = resolution;
      return _exhaustive;
    }
  }
}
