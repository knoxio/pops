import type { ReactNode } from 'react';

export interface ConditionalModalButtonProps {
  children: ReactNode;
  modal: ReactNode;
  /**
   * When false, the modal subtree is not mounted (children still render).
   * Use for flows where the modal should only exist when a feature flag or
   * integration is active.
   * @default true
   */
  when?: boolean;
}

/**
 * Renders a trigger subtree alongside a sibling modal subtree (e.g. controlled
 * Radarr/Sonarr dialogs). The name reflects optional gating via {@link when}.
 */
export function ConditionalModalButton({
  children,
  modal,
  when = true,
}: ConditionalModalButtonProps) {
  return (
    <>
      {children}
      {when ? modal : null}
    </>
  );
}

ConditionalModalButton.displayName = 'ConditionalModalButton';
