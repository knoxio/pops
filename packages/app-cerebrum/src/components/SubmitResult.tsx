/**
 * SubmitResult — success banner displayed after an engram is created.
 * Shows the engram ID, file path, and classified type.
 */
import { CheckCircle2 } from 'lucide-react';

import { Badge, Button, Card } from '@pops/ui';

interface SubmitResultProps {
  id: string;
  filePath: string;
  type: string;
  onReset: () => void;
}

export function SubmitResult({ id, filePath, type, onReset }: SubmitResultProps) {
  return (
    <Card className="p-6 space-y-4 border-success/30 bg-success/5">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
        <h3 className="text-lg font-semibold">Engram Created</h3>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">ID</dt>
        <dd className="font-mono text-xs break-all">{id}</dd>
        <dt className="text-muted-foreground">Type</dt>
        <dd>
          <Badge variant="secondary">{type}</Badge>
        </dd>
        <dt className="text-muted-foreground">Path</dt>
        <dd className="font-mono text-xs break-all">{filePath}</dd>
      </dl>
      <Button variant="outline" onClick={onReset}>
        Create Another
      </Button>
    </Card>
  );
}
