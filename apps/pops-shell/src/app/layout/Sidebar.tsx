/**
 * Sidebar navigation
 *
 * Navigation items use /finance prefix paths. Once app-finance exports
 * a navConfig (US-3), this hardcoded list will be replaced with
 * config-driven navigation.
 */
import { Link, useLocation } from "react-router";

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

interface SidebarProps {
  open: boolean;
}

const navItems: NavItem[] = [
  { path: "/finance", label: "Dashboard", icon: "📊" },
  { path: "/finance/transactions", label: "Transactions", icon: "💳" },
  { path: "/finance/entities", label: "Entities", icon: "🏢" },
  { path: "/finance/budgets", label: "Budgets", icon: "💰" },
  { path: "/finance/inventory", label: "Inventory", icon: "📦" },
  { path: "/finance/wishlist", label: "Wish List", icon: "⭐" },
  { path: "/finance/import", label: "Import", icon: "📥" },
  { path: "/finance/ai-usage", label: "AI Usage", icon: "🤖" },
];

export function Sidebar({ open }: SidebarProps) {
  const location = useLocation();

  if (!open) return null;

  return (
    <aside className="w-64 bg-card border-r border-border h-[calc(100vh-4rem)] fixed top-16 left-0">
      <nav className="p-4 space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-colors font-medium ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
