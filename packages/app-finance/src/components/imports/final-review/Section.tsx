import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

export function Section(props: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? props.count <= 10);
  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left font-medium hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        <span>
          {props.title} <span className="text-muted-foreground font-normal">({props.count})</span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {open && <div className="border-t px-4 py-3">{props.children}</div>}
    </div>
  );
}
