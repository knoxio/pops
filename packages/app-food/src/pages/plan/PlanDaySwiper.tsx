/**
 * PRD-143 — mobile day-at-a-time swiper.
 *
 * Vertical stack of slot sections for a single visible day, with prev /
 * next arrows + a touch swipe gesture to navigate between the seven
 * days of the current ISO week. Shares the dnd context, cell
 * rendering, and add / edit hooks with `PlanWeekGrid` so behaviour
 * stays identical at narrow viewports — the only thing that changes is
 * the framing (one column of stacked cells instead of a 7-column
 * table). The Mon→Sun index is internal state; the caller still owns
 * the visible week via `weekStart`.
 */
import { DndContext } from '@dnd-kit/core';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';

import { Button } from '@pops/ui';

import { formatDayLabel, isPastDate, weekDates } from './iso-week.js';
import { groupEntriesByCell } from './plan-grid-dnd.js';
import { PlanCell } from './PlanCell.js';
import { usePlanDndHandlers, usePlanDndSensors } from './usePlanDnd.js';

import type { WirePlanEntryRow, WirePlanSlotRow } from './plan-wire-types.js';

const SWIPE_THRESHOLD_PX = 40;

export interface PlanDaySwiperProps {
  weekStart: string;
  slots: readonly WirePlanSlotRow[];
  entries: readonly WirePlanEntryRow[];
  onEdit: (entryId: number) => void;
  onAdd: (date: string, slot: string) => void;
}

export function PlanDaySwiper(props: PlanDaySwiperProps): ReactElement {
  const { weekStart, slots, entries, onEdit, onAdd } = props;
  const days = weekDates(weekStart);
  const byCell = groupEntriesByCell(entries);
  const sensors = usePlanDndSensors();
  const { onDragEnd } = usePlanDndHandlers(entries);
  const [dayIndex, setDayIndex] = useState(0);
  useEffect(() => {
    setDayIndex(0);
  }, [weekStart]);
  const clamped = Math.max(0, Math.min(days.length - 1, dayIndex));
  const date = days[clamped] ?? days[0] ?? weekStart;
  const goPrev = useCallback(() => setDayIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setDayIndex((i) => Math.min(days.length - 1, i + 1)),
    [days.length]
  );
  const swipe = useSwipeNavigation({ onLeft: goNext, onRight: goPrev });
  return (
    <div data-testid="plan-day-swiper" className="space-y-3">
      <DaySwiperHeader
        label={formatDayLabel(date, clamped)}
        past={isPastDate(date)}
        canPrev={clamped > 0}
        canNext={clamped < days.length - 1}
        onPrev={goPrev}
        onNext={goNext}
      />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div
          {...swipe}
          data-testid="plan-day-swiper-body"
          className="space-y-2"
          role="group"
          aria-label={`Plan entries for ${date}`}
        >
          {slots.map((slot) => {
            const key = `${date}::${slot.slug}`;
            const cellEntries = byCell.get(key) ?? [];
            return (
              <div key={slot.slug} data-testid={`day-slot-${slot.slug}`} className="space-y-1">
                <h3 className="text-sm font-medium">{slot.name}</h3>
                <PlanCell
                  date={date}
                  slot={slot.slug}
                  entries={cellEntries}
                  layout="stacked"
                  onEdit={onEdit}
                  onAdd={onAdd}
                />
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

interface DaySwiperHeaderProps {
  label: string;
  past: boolean;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

function DaySwiperHeader(props: DaySwiperHeaderProps): ReactElement {
  return (
    <div className="flex items-center justify-between gap-2" data-testid="plan-day-header">
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onPrev}
        disabled={!props.canPrev}
        aria-label="Previous day"
      >
        ‹
      </Button>
      <h2
        className={`text-base font-semibold ${props.past ? 'text-muted-foreground' : ''}`}
        data-testid="plan-day-label"
      >
        {props.label}
      </h2>
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onNext}
        disabled={!props.canNext}
        aria-label="Next day"
      >
        ›
      </Button>
    </div>
  );
}

interface SwipeOptions {
  onLeft: () => void;
  onRight: () => void;
}

function useSwipeNavigation({ onLeft, onRight }: SwipeOptions) {
  const startX = useRef<number | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent<HTMLDivElement>) => {
      const touch = e.touches[0];
      if (!touch || touchStartedOnDragHandle(e.target)) {
        startX.current = null;
        return;
      }
      startX.current = touch.clientX;
    },
    onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => {
      if (startX.current === null) return;
      const touch = e.changedTouches[0];
      if (!touch) {
        startX.current = null;
        return;
      }
      const delta = touch.clientX - startX.current;
      startX.current = null;
      if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
      if (delta < 0) onLeft();
      else onRight();
    },
  };
}

function touchStartedOnDragHandle(target: EventTarget): boolean {
  let node: Element | null = target instanceof Element ? target : null;
  while (node !== null) {
    if (node instanceof HTMLElement && node.dataset.draghandle === 'true') return true;
    node = node.parentElement;
  }
  return false;
}
