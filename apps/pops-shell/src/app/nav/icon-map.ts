import {
  ArrowLeftRight,
  BarChart3,
  Bookmark,
  BookOpen,
  Bot,
  Building2,
  Clock,
  Compass,
  CreditCard,
  Database,
  DollarSign,
  Download,
  FileText,
  Film,
  History,
  Layers,
  LayoutDashboard,
  Library,
  type LucideIcon,
  MapPin,
  Package,
  PiggyBank,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Star,
  Trophy,
} from 'lucide-react';

/**
 * Shared icon map — maps Lucide icon name strings to components.
 *
 * Used by AppRail, PageNav, and Sidebar to resolve icon names
 * from navConfig to actual Lucide React components.
 *
 * Add new icons here AND add the name to IconName in
 * @pops/navigation/src/types.ts.
 */
import type { IconName } from '@pops/navigation';

/**
 * Maps every IconName to its Lucide component. The `satisfies` clause
 * ensures that every member of the IconName union has a corresponding entry
 * and that all values are LucideIcon components — without widening the key
 * type to `string`.
 */
export const iconMap = {
  ArrowLeftRight,
  BarChart3,
  Bookmark,
  BookOpen,
  Bot,
  Building2,
  Clock,
  Compass,
  CreditCard,
  Database,
  DollarSign,
  Download,
  FileText,
  Film,
  History,
  Layers,
  LayoutDashboard,
  Library,
  MapPin,
  Package,
  PiggyBank,
  Search,
  Settings,
  ShieldCheck,
  Shuffle,
  Star,
  Trophy,
} satisfies Record<IconName, LucideIcon>;
