/**
 * Shared icon map — maps Lucide icon name strings to components.
 *
 * Used by AppRail, PageNav, and Sidebar to resolve icon names
 * from navConfig to actual Lucide React components.
 *
 * Add new icons here when a new app or page uses them.
 */
import {
  DollarSign,
  LayoutDashboard,
  CreditCard,
  Building2,
  PiggyBank,
  Package,
  Star,
  Download,
  Bot,
  type LucideIcon,
} from "lucide-react";

export const iconMap: Record<string, LucideIcon> = {
  DollarSign,
  LayoutDashboard,
  CreditCard,
  Building2,
  PiggyBank,
  Package,
  Star,
  Download,
  Bot,
};
