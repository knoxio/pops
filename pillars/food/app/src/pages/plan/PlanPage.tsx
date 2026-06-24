/**
 * Top-level planning page mounted at `/food/plan`. Reads `?week=…` from the
 * URL (defaulting to the current ISO week), drives navigation buttons, and
 * renders the grid plus the add modal, edit sheet, and slot drawer. At
 * narrow viewports (via `useIsMobile`) the week grid swaps for a
 * day-at-a-time swiper.
 *
 * Spec: pillars/food/docs/prds/planning-page
 */
import { useCallback, useState, type ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { Button } from '@pops/ui';

import { AddPlanEntryModal } from './AddPlanEntryModal.js';
import { addDays, formatLocalDate, formatWeekLabel, toIsoMonday } from './iso-week.js';
import { PlanDaySwiper } from './PlanDaySwiper.js';
import { PlanEntryEditSheet } from './PlanEntryEditSheet.js';
import { PlanWeekGrid } from './PlanWeekGrid.js';
import { SlotManagementDrawer } from './SlotManagementDrawer.js';
import { useIsMobile } from './useIsMobile.js';
import { usePlanPage } from './usePlanPage.js';

interface AddTarget {
  date: string;
  slot: string;
}

export function PlanPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const weekParam = searchParams.get('week');
  const { weekStart, weekQuery, slotsQuery } = usePlanPage({ weekParam });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget | null>(null);
  const [showSlotDrawer, setShowSlotDrawer] = useState(false);
  const setWeek = useCallback(
    (next: string) => {
      const monday = toIsoMonday(next);
      const url = new URLSearchParams(searchParams);
      url.set('week', monday);
      setSearchParams(url, { replace: false });
    },
    [searchParams, setSearchParams]
  );
  const today = formatLocalDate(new Date());
  return (
    <main className="p-4 space-y-4" data-testid="plan-page">
      <Header
        label={formatWeekLabel(weekStart).long}
        weekStart={weekStart}
        onPrev={() => setWeek(addDays(weekStart, -7))}
        onNext={() => setWeek(addDays(weekStart, 7))}
        onToday={() => setWeek(today)}
        onDatePick={(date) => setWeek(date)}
        onManageSlots={() => setShowSlotDrawer(true)}
        onMakeShoppingList={() => {
          const end = addDays(weekStart, 6);
          void navigate(`/food/shopping/from-plan?start=${weekStart}&end=${end}`);
        }}
      />
      <Body
        weekQuery={weekQuery}
        slotsQuery={slotsQuery}
        onEdit={setEditingId}
        onAdd={(date, slot) => setAddTarget({ date, slot })}
      />
      {addTarget !== null && (
        <AddPlanEntryModal
          date={addTarget.date}
          slot={addTarget.slot}
          isOpen
          onClose={() => setAddTarget(null)}
        />
      )}
      <PlanEntryEditSheet
        entryId={editingId}
        weekStart={weekStart}
        isOpen={editingId !== null}
        onClose={() => setEditingId(null)}
      />
      <SlotManagementDrawer isOpen={showSlotDrawer} onClose={() => setShowSlotDrawer(false)} />
    </main>
  );
}

interface BodyProps {
  weekQuery: ReturnType<typeof usePlanPage>['weekQuery'];
  slotsQuery: ReturnType<typeof usePlanPage>['slotsQuery'];
  onEdit: (id: number) => void;
  onAdd: (date: string, slot: string) => void;
}

function Body({ weekQuery, slotsQuery, onEdit, onAdd }: BodyProps): ReactElement {
  const isMobile = useIsMobile();
  if (weekQuery.isLoading || slotsQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading week…</p>;
  }
  if (weekQuery.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load week: {weekQuery.error.message}
      </p>
    );
  }
  if (slotsQuery.isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Could not load slots: {slotsQuery.error.message}
      </p>
    );
  }
  if (!weekQuery.data || !slotsQuery.data) return <></>;
  const View = isMobile ? PlanDaySwiper : PlanWeekGrid;
  return (
    <View
      weekStart={weekQuery.data.weekStart}
      slots={slotsQuery.data.slots}
      entries={weekQuery.data.entries}
      onEdit={onEdit}
      onAdd={onAdd}
    />
  );
}

interface HeaderProps {
  label: string;
  weekStart: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDatePick: (date: string) => void;
  onManageSlots: () => void;
  /**
   * Navigates to `/food/shopping/from-plan` with the current week pre-filled.
   * Spec: pillars/food/docs/prds/plan-shopping-generator
   */
  onMakeShoppingList: () => void;
}

function Header(props: HeaderProps): ReactElement {
  return (
    <header className="flex items-center gap-2 flex-wrap" data-testid="plan-header">
      <h1 className="text-lg font-semibold flex-1" data-testid="week-label">
        {props.label}
      </h1>
      <Button variant="ghost" size="sm" onClick={props.onPrev} aria-label="Previous week">
        ‹
      </Button>
      <Button variant="ghost" size="sm" onClick={props.onToday}>
        Today
      </Button>
      <Button variant="ghost" size="sm" onClick={props.onNext} aria-label="Next week">
        ›
      </Button>
      <input
        type="date"
        className="border rounded px-2 py-1 text-sm"
        data-testid="week-date-picker"
        value={props.weekStart}
        onChange={(e) => {
          if (e.target.value !== '') props.onDatePick(e.target.value);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={props.onManageSlots}
        data-testid="manage-slots-btn"
      >
        Manage slots
      </Button>
      <Button
        variant="default"
        size="sm"
        onClick={props.onMakeShoppingList}
        data-testid="make-shopping-list-btn"
      >
        Make shopping list
      </Button>
    </header>
  );
}
