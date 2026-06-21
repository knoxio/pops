import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

export function RawDataDisclosure({ rawData }: { rawData: Record<string, string> }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
        <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        <span>View source CSV data</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded-md overflow-x-auto">
          {JSON.stringify(rawData, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}
