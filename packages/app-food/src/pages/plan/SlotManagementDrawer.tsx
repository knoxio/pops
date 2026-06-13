/**
 * PRD-143 — slot management drawer.
 *
 * Lists `plan_slots` rows; default slots can be reordered but not
 * renamed or deleted, custom slots support inline rename + delete (when
 * not in use). "+ Add slot" form at the bottom validates the slug
 * grammar client-side before calling the API.
 */
import { useState, type ReactElement } from 'react';

import { usePillarMutation, usePillarQuery, usePillarUtils } from '@pops/pillar-sdk/react';
import { Button } from '@pops/ui';

import { SlotRow } from './SlotRow.js';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

import type { AppRouter } from '@pops/api-client';

type PlanListSlotsOutput = inferRouterOutputs<AppRouter>['food']['plan']['listSlots'];
type PlanUpdateSlotInput = inferRouterInputs<AppRouter>['food']['plan']['updateSlot'];
type PlanUpdateSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['updateSlot'];
type PlanDeleteSlotInput = inferRouterInputs<AppRouter>['food']['plan']['deleteSlot'];
type PlanDeleteSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['deleteSlot'];
type PlanAddSlotInput = inferRouterInputs<AppRouter>['food']['plan']['addSlot'];
type PlanAddSlotOutput = inferRouterOutputs<AppRouter>['food']['plan']['addSlot'];

const SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;

export interface SlotManagementDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function useSlotMutations() {
  const utils = usePillarUtils('food');
  const invalidate = () => {
    void utils.invalidate(['plan', 'listSlots']);
    void utils.invalidate(['plan', 'weekView']);
  };
  return {
    updateSlot: usePillarMutation<PlanUpdateSlotInput, PlanUpdateSlotOutput>(
      'food',
      ['plan', 'updateSlot'],
      { onSuccess: invalidate }
    ),
    deleteSlot: usePillarMutation<PlanDeleteSlotInput, PlanDeleteSlotOutput>(
      'food',
      ['plan', 'deleteSlot'],
      { onSuccess: invalidate }
    ),
    addSlot: usePillarMutation<PlanAddSlotInput, PlanAddSlotOutput>('food', ['plan', 'addSlot'], {
      onSuccess: invalidate,
    }),
  };
}

export function SlotManagementDrawer(props: SlotManagementDrawerProps): ReactElement | null {
  const { isOpen, onClose } = props;
  const slotsQuery = usePillarQuery<PlanListSlotsOutput>('food', ['plan', 'listSlots'], undefined, {
    enabled: isOpen,
  });
  const { updateSlot, deleteSlot, addSlot } = useSlotMutations();
  if (!isOpen) return null;
  const slots = slotsQuery.data?.slots ?? [];
  return (
    <aside
      className="fixed inset-y-0 right-0 w-full sm:w-96 bg-background border-l shadow-xl z-50 p-6 overflow-y-auto"
      role="dialog"
      aria-label="Manage plan slots"
      data-testid="slot-management-drawer"
    >
      <DrawerHeader onClose={onClose} />
      <ul className="space-y-2 mb-6" data-testid="slot-list">
        {slots.map((slot) => (
          <SlotRow
            key={slot.slug}
            slot={slot}
            onRename={(name) => updateSlot.mutate({ slug: slot.slug, name })}
            onReorder={(displayOrder) => updateSlot.mutate({ slug: slot.slug, displayOrder })}
            onDelete={() => deleteSlot.mutate({ slug: slot.slug })}
          />
        ))}
      </ul>
      <AddSlotForm
        onSubmit={async (slug, name) => addSlot.mutateAsync({ slug, name })}
        isPending={addSlot.isPending}
      />
    </aside>
  );
}

function DrawerHeader({ onClose }: { onClose: () => void }): ReactElement {
  return (
    <header className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-semibold">Manage slots</h2>
      <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close slot manager">
        ×
      </Button>
    </header>
  );
}

interface AddSlotFormProps {
  onSubmit: (slug: string, name: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  isPending: boolean;
}

function AddSlotForm({ onSubmit, isPending }: AddSlotFormProps): ReactElement {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!SLUG_RE.test(slug)) {
      setError('Slug must be lowercase kebab-case (e.g. "late-night").');
      return;
    }
    if (name.trim() === '') {
      setError('Name is required.');
      return;
    }
    const res = await onSubmit(slug, name.trim());
    if (!res.ok) {
      setError(`Could not add: ${res.reason}`);
      return;
    }
    setSlug('');
    setName('');
  };
  return (
    <section data-testid="add-slot-form">
      <h3 className="text-sm font-medium mb-2">Add a custom slot</h3>
      <div className="space-y-2">
        <input
          data-testid="add-slot-slug"
          placeholder="slug (e.g. late-night)"
          className="w-full border rounded px-2 py-1 text-sm"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
        />
        <input
          data-testid="add-slot-name"
          placeholder="Display name"
          className="w-full border rounded px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error !== null && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button onClick={submit} disabled={isPending} data-testid="add-slot-submit">
          Add slot
        </Button>
      </div>
    </section>
  );
}
