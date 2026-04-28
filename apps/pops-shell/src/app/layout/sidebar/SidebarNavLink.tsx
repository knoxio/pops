import { iconMap } from '@/app/nav/icon-map';
import { isPageActive } from '@/app/nav/path-utils';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import type { AppNavConfig, AppNavItem } from '@/app/nav/registry';

interface SidebarNavLinkProps {
  app: AppNavConfig;
  item: AppNavItem;
  pathname: string;
  onNavigate: () => void;
}

export function SidebarNavLink({ app, item, pathname, onNavigate }: SidebarNavLinkProps) {
  const { t } = useTranslation('navigation');
  const fullPath = `${app.basePath}${item.path}`;
  const isActive = isPageActive(pathname, app.basePath, item.path);
  const Icon = iconMap[item.icon];

  return (
    <Link
      to={fullPath}
      onClick={onNavigate}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium min-h-[44px] ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0" />}
      <span>{t(item.labelKey)}</span>
    </Link>
  );
}
