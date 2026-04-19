import { useState } from 'react';

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
      setTimeout(() => setTestState('idle'), 3000);
    } catch (err) {
      setTestState('error');
      setTestError(err instanceof Error ? err.message : 'Test failed');
    }
  };

  return { testState, testError, runTest };
}
