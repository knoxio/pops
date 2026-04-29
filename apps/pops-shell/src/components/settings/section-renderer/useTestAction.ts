import { useState } from 'react';
import { toast } from 'sonner';

import type { TestState } from './types';

export function useTestAction(onTestAction: (procedure: string) => Promise<void>) {
  const [testState, setTestState] = useState<TestState>('idle');
  const [testError, setTestError] = useState<string>('');

  const runTest = async (procedure: string) => {
    setTestState('loading');
    setTestError('');
    try {
      await onTestAction(procedure);
      setTestState('success');
      toast.success('Connected');
      setTimeout(() => setTestState('idle'), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setTestState('error');
      setTestError(message);
      toast.error(message);
    }
  };

  return { testState, testError, runTest };
}
