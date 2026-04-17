import { Badge } from '@pops/ui';
import { CheckCircle2, XCircle } from 'lucide-react';

export function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
      <CheckCircle2 className="h-3 w-3 mr-1" />
      Connected
    </Badge>
  ) : (
    <Badge className="bg-destructive/10 text-destructive border-destructive/20">
      <XCircle className="h-3 w-3 mr-1" />
      Disconnected
    </Badge>
  );
}
