import { useCallback, useState } from 'react';

export function usePendingSet() {
  const [set, setSet] = useState<Set<number>>(new Set());
  const add = useCallback((id: number) => {
    setSet((prev) => new Set(prev).add(id));
  }, []);
  const remove = useCallback((id: number) => {
    setSet((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);
  return { set, add, remove };
}
