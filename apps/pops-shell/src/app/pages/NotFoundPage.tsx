import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <FileQuestion className="h-16 w-16 text-muted-foreground/40 mb-6" />
      <h1 className="text-2xl font-bold mb-2">Page not found</h1>
      <p className="text-muted-foreground mb-6">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Go home
      </Link>
    </div>
  );
}
