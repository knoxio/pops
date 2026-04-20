import { CheckCircle2, Loader2, XCircle } from 'lucide-react';

import type { TestState } from './types';

interface TestActionIconProps {
  state: TestState;
  fallback: React.ReactNode;
}

export function TestActionIcon({ state, fallback }: TestActionIconProps) {
  if (state === 'loading') return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (state === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  if (state === 'error') return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  return <>{fallback}</>;
}
