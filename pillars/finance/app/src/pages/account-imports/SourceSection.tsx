import { CircleCheck, CircleDashed, KeyRound, Pencil } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import type { ImportConfigWire } from './types';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-3 text-sm">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

const KIND_LABEL: Record<ImportConfigWire['sourceKind'], string> = {
  'csv-dialect': 'CSV export',
  'pdf-statement': 'PDF statement',
  api: 'Provider API',
};

/** What the config names as the thing being read: the dialect, the parser, or the provider. */
export function formatOf(config: ImportConfigWire): string {
  switch (config.sourceKind) {
    case 'csv-dialect':
      return config.dialectId ?? 'Not set';
    case 'pdf-statement':
      return config.parserId ?? 'Not set';
    case 'api':
      return config.provider === 'up' ? 'Up live feed' : (config.provider ?? 'Not set');
  }
}

export function cadenceLabel(days: number | null): string {
  if (days === null) return 'Not set';
  if (days === 1) return 'Daily';
  if (days === 7) return 'Weekly';
  if (days >= 28 && days <= 31) return 'Monthly';
  return `Every ${days} days`;
}

function Connection({ config }: { config: ImportConfigWire }) {
  const connected = config.secretRef !== null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={connected ? 'secondary' : 'destructive'} className="gap-1 font-normal">
        {connected ? <CircleCheck className="h-3 w-3" /> : <KeyRound className="h-3 w-3" />}
        {connected ? 'Connected' : 'Token missing'}
      </Badge>
      {config.externalAccountRef !== null && (
        <span className="text-muted-foreground">as {config.externalAccountRef}</span>
      )}
      {config.secretRef !== null && (
        <span className="text-xs text-muted-foreground">
          token read from secret <code className="rounded bg-muted px-1">{config.secretRef}</code>
        </span>
      )}
    </div>
  );
}

/**
 * How the account expects to be fed (finance ADR-003). An account with no
 * config is fed by hand, which is an answer rather than a gap: the section
 * says so instead of showing an empty form.
 */
export function SourceSection({
  accountName,
  config,
  onEdit,
}: {
  accountName: string;
  config: ImportConfigWire | null;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Source</CardTitle>
        <Button variant="ghost" size="sm" onClick={onEdit} prefix={<Pencil className="h-4 w-4" />}>
          {config ? 'Change' : 'Set up'}
        </Button>
      </CardHeader>
      <CardContent>
        {config ? (
          <dl className="space-y-3">
            <Row label="Fed by">
              <Badge variant="outline" className="gap-1 font-normal">
                <CircleDashed className="h-3 w-3" />
                {KIND_LABEL[config.sourceKind]}
              </Badge>
            </Row>
            <Row label="Format">{formatOf(config)}</Row>
            <Row label="Cadence">{cadenceLabel(config.expectedCadenceDays)}</Row>
            {config.sourceKind === 'api' && (
              <Row label="Connection">
                <Connection config={config} />
              </Row>
            )}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nothing feeds {accountName} on its own. Rows arrive when you import a file or add them
            by hand.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
