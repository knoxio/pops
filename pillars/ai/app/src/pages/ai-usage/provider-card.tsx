import { AlertCircle, CheckCircle2, RefreshCw, Server } from 'lucide-react';

import { Badge, Button, Card } from '@pops/ui';

type Provider = {
  id: string;
  name: string;
  type: string;
  status: string;
  models: unknown[];
  lastLatencyMs: number | null;
};

type ProviderCardProps = {
  provider: Provider;
  onCheck: (providerId: string) => void;
  isChecking: boolean;
};

export function ProviderCard({ provider, onCheck, isChecking }: ProviderCardProps) {
  const isActive = provider.status === 'active';
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="font-medium text-sm">{provider.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{provider.type}</p>
          </div>
        </div>
        <Badge variant={isActive ? 'default' : 'destructive'} className="shrink-0">
          {isActive ? (
            <CheckCircle2 className="mr-1 h-3 w-3" />
          ) : (
            <AlertCircle className="mr-1 h-3 w-3" />
          )}
          {provider.status}
        </Badge>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {provider.models.length} model{provider.models.length === 1 ? '' : 's'}
          {provider.lastLatencyMs != null && ` · ${provider.lastLatencyMs}ms`}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() => onCheck(provider.id)}
          disabled={isChecking}
        >
          <RefreshCw className="mr-1 h-3 w-3" />
          Check
        </Button>
      </div>
    </Card>
  );
}
