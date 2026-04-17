import { CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@pops/ui';

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge className="bg-success/10 text-success border-success/20">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Connected
    </Badge>
  ) : (
    <Badge className="bg-destructive/10 text-destructive/80 border-destructive/20">
      <XCircle className="h-3 w-3 mr-1" />
      Disconnected
    </Badge>
  );
}
