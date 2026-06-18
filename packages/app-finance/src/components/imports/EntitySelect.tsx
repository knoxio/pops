import { EntitySelect as UiEntitySelect } from '@pops/ui';

export interface FinanceEntityOption {
  id: string;
  name: string;
  type?: string;
}

interface FinanceEntitySelectProps {
  entities: FinanceEntityOption[];
  value?: string;
  onChange?: (entityId: string, entityName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Finance-domain wrapper for @pops/ui EntitySelect.
 * Maps entities with `temp:entity:` IDs to `pending: true` so the "Pending" badge
 * renders for locally-created entities that haven't been committed yet.
 */
export function EntitySelect({ entities, ...props }: FinanceEntitySelectProps) {
  const mapped = entities.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    pending: e.id.startsWith('temp:entity:'),
  }));
  return <UiEntitySelect entities={mapped} {...props} />;
}
