import { useState } from 'react';

import type { ReactNode } from 'react';

/**
 * ConditionalModalButton — renders a trigger only when a condition is met,
 * and manages open/close state for an associated modal.
 *
 * Props:
 *  - `show`: when false, renders nothing.
 *  - `trigger`: a render function receiving `{ onClick }` — should return a button.
 *  - `modal`: a render function receiving `{ open, onClose }` — should return a Dialog.
 *
 * Usage:
 * ```tsx
 * <ConditionalModalButton
 *   show={!movieExistsInRadarr}
 *   trigger={({ onClick }) => <Button onClick={onClick}>Request</Button>}
 *   modal={({ open, onClose }) => (
 *     <RequestMovieModal open={open} onClose={onClose} {...props} />
 *   )}
 * />
 * ```
 */
export interface ConditionalModalButtonProps {
  show: boolean;
  trigger: (props: { onClick: () => void }) => ReactNode;
  modal: (props: { open: boolean; onClose: () => void }) => ReactNode;
}

export function ConditionalModalButton({ show, trigger, modal }: ConditionalModalButtonProps) {
  const [open, setOpen] = useState(false);

  if (!show) return null;

  return (
    <>
      {trigger({ onClick: () => setOpen(true) })}
      {modal({ open, onClose: () => setOpen(false) })}
    </>
  );
}
