import { Link } from 'react-router';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@pops/ui';

export function MovieHeroBreadcrumb({ title }: { title: string }) {
  return (
    <div className="absolute top-0 left-0 right-0 p-4 md:p-6 z-10">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/media" className="text-white/70 hover:text-white">
                Media
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="text-white/50" />
          <BreadcrumbItem>
            <BreadcrumbPage className="text-white/90">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
