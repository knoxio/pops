import { Save } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@pops/ui';

interface FormFooterProps {
  isEditMode: boolean;
  isMutating: boolean;
}

export function FormFooter({ isEditMode, isMutating }: FormFooterProps) {
  return (
    <div className="flex gap-4 pt-6 border-t">
      <Button
        type="submit"
        size="lg"
        className="flex-1 bg-app-accent hover:bg-app-accent/80 text-white font-bold transition-all shadow-md shadow-app-accent/20"
        loading={isMutating}
        loadingText={isEditMode ? 'Saving...' : 'Creating...'}
      >
        <Save className="h-5 w-5 mr-2" />
        {isEditMode ? 'Save Changes' : 'Create Item'}
      </Button>
      <Link to="/inventory">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="px-8 font-bold border-app-accent/20 hover:bg-app-accent/5"
        >
          Cancel
        </Button>
      </Link>
    </div>
  );
}
