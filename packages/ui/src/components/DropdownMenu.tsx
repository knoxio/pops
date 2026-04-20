/**
 * DropdownMenu component - Wrapper around shadcn dropdown-menu
 * Provides a simpler API for common use cases
 */
import { type ReactNode } from 'react';

import {
  DropdownMenu as DropdownMenuPrimitive,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';

export interface DropdownMenuItem {
  label: string;
  value: string;
  disabled?: boolean;
  variant?: 'default' | 'destructive';
  icon?: ReactNode;
  onSelect?: () => void;
}

export interface DropdownMenuGroup {
  label?: string;
  items: DropdownMenuItem[];
}

export interface DropdownMenuProps {
  /**
   * Trigger element (usually a button)
   */
  trigger: ReactNode;
  /**
   * Menu items (simple array or grouped)
   */
  items?: DropdownMenuItem[];
  /**
   * Grouped items (alternative to items)
   */
  groups?: DropdownMenuGroup[];
  /**
   * Content alignment relative to trigger
   */
  align?: 'start' | 'center' | 'end';
  /**
   * Side of trigger to open on
   */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Custom content instead of items
   */
  children?: ReactNode;
  /**
   * Additional className for content
   */
  className?: string;
}

/**
 * DropdownMenu component
 *
 * @example
 * ```tsx
 * <DropdownMenu
 *   trigger={<Button>Open Menu</Button>}
 *   items={[
 *     { label: "Edit", value: "edit", icon: <EditIcon />, onSelect: () => {} },
 *     { label: "Delete", value: "delete", variant: "destructive" }
 *   ]}
 * />
 *
 * // Or with groups:
 * <DropdownMenu
 *   trigger={<Button>Menu</Button>}
 *   groups={[
 *     { label: "Account", items: [...] },
 *     { items: [...] }
 *   ]}
 * />
 * ```
 */
export function DropdownMenu({
  trigger,
  items,
  groups,
  align = 'start',
  side = 'bottom',
  children,
  className,
}: DropdownMenuProps) {
  const renderItems = () => {
    if (groups) {
      return groups.map((group, groupIndex) => (
        <div key={groupIndex}>
          {group.label && <DropdownMenuLabel>{group.label}</DropdownMenuLabel>}
          {group.items.map((item) => (
            <DropdownMenuItem
              key={item.value}
              disabled={item.disabled}
              variant={item.variant}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ))}
          {groupIndex < groups.length - 1 && <DropdownMenuSeparator />}
        </div>
      ));
    }
    if (items) {
      return items.map((item) => (
        <DropdownMenuItem
          key={item.value}
          disabled={item.disabled}
          variant={item.variant}
          onSelect={item.onSelect}
        >
          {item.icon}
          {item.label}
        </DropdownMenuItem>
      ));
    }
    return null;
  };

  return (
    <DropdownMenuPrimitive>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className={className}>
        {children ?? renderItems()}
      </DropdownMenuContent>
    </DropdownMenuPrimitive>
  );
}

// Re-export shadcn components for advanced usage
export {
  DropdownMenuContent,
  DropdownMenuItem as DropdownMenuItemPrimitive,
  DropdownMenuLabel,
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
