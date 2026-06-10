import type { ListItemRow, ListRow } from './types.js';
import type { DetailMutations } from './useDetailMutations.js';
import type { ItemMutations } from './useItemMutations.js';

/**
 * Shared dialog state + DetailContent prop shape consumed by both the
 * generic and shopping detail bodies.
 */
export interface DialogState {
  editOpen: boolean;
  deleteOpen: boolean;
  openEdit: () => void;
  closeEdit: () => void;
  openDelete: () => void;
  closeDelete: () => void;
}

export interface DetailContentProps {
  list: ListRow;
  items: readonly ListItemRow[];
  detailMx: DetailMutations;
  itemMx: ItemMutations;
  dialogs: DialogState;
}

/**
 * Detail-page-level action handlers wrapping the list mutations. Each
 * async handler swallows its rejection — failures already surface via
 * the `detailMx.errorMessage` banner, so re-throwing here would only
 * land in an unhandled promise rejection (PRD-140-C Copilot R1).
 */
export function useDetailHandlers({ list, detailMx, dialogs, itemMx }: DetailContentProps) {
  return {
    toggleChecked: (id: number, currentlyChecked: boolean) => {
      if (currentlyChecked) itemMx.uncheck(id);
      else itemMx.check(id);
    },
    archiveToggle: async () => {
      try {
        if (list.archivedAt === null) await detailMx.archive(list.id);
        else await detailMx.unarchive(list.id);
      } catch {
        /* surfaced via errorMessage */
      }
    },
    saveEdit: async (patch: { name: string; kind: typeof list.kind }) => {
      try {
        const result = await detailMx.update(list.id, patch);
        if (result.ok) dialogs.closeEdit();
      } catch {
        /* surfaced via errorMessage */
      }
    },
    confirmDelete: async () => {
      try {
        await detailMx.remove(list.id);
      } catch {
        /* surfaced via errorMessage */
      }
      dialogs.closeDelete();
    },
  };
}
