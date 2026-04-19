import { RefreshCw, Settings, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

import { QuickPickDialog } from '../../components/QuickPickDialog';

export function LibraryHeader() {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold tracking-tight">Library</h1>
      <div className="flex items-center gap-3">
        <QuickPickDialog />
        <Link to="/media/quick-pick">
          <Button variant="outline" size="sm">
            <Sparkles className="h-4 w-4 mr-1.5" />
            Quick Pick
          </Button>
        </Link>
        <Link to="/media/plex">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1.5" />
            Plex
          </Button>
        </Link>
        <Link to="/media/arr">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-1.5" />
            Arr
          </Button>
        </Link>
        <Link to="/media/rotation">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Rotation
          </Button>
        </Link>
        <Link
          to="/media/search"
          className="text-sm font-medium text-app-accent hover:text-app-accent/80 transition-colors"
        >
          Search
        </Link>
      </div>
    </div>
  );
}
