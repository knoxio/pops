/**
 * Shared icon map — maps Lucide icon name strings to components.
 *
 * Used by AppRail, PageNav, and Sidebar to resolve icon names
 * from navConfig to actual Lucide React components.
 *
 * Add new icons here when a new app or page uses them.
 */
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
  BarChart3,
  Film,
  Library,
  Bookmark,
  Clock,
  Search,
  ArrowLeftRight,
  Compass,
  Trophy,
  FileText,
  ShieldCheck,
  MapPin,
  Settings,
  BookOpen,
  Layers,
  Database,
  History,
  Shuffle,
};
