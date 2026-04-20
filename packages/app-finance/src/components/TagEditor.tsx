import { Badge, Button, hashToColor, Popover, PopoverContent, PopoverTrigger } from '@pops/ui';

import { cn } from '../lib/utils';
import { TagEditorPanel } from './tag-editor/TagEditorPanel';
import { type PanelHandlers, useTagEditorState } from './tag-editor/useTagEditorState';
import { type TagEditorProps, type TagMetaEntry, type TagSource } from './tag-editor/utils';

export type { PanelHandlers, TagEditorProps, TagMetaEntry, TagSource };

const SOURCE_ICONS: Record<TagSource, string> = {
  ai: '🤖',
  rule: '📋',
  entity: '🏪',
};

interface TriggerProps {
  tags: string[];
  disabled: boolean;
  tagMeta?: Map<string, TagMetaEntry>;
}

function tooltipFor(meta: TagMetaEntry | undefined): string | undefined {
  if (meta?.source === 'rule' && meta?.pattern) return `Rule: "${meta.pattern}"`;
  if (meta?.source) return `${meta.source} suggestion`;
  return undefined;
}

function TriggerContent({ tags, disabled, tagMeta }: TriggerProps) {
  return (
    <Button
      variant="ghost"
      className={cn(
        'flex flex-wrap gap-1 min-h-10 text-left w-full rounded px-2 py-1.5 transition-colors items-center h-auto',
        disabled ? 'cursor-default' : 'hover:bg-accent/50 cursor-pointer'
      )}
      aria-label="Edit tags"
      disabled={disabled}
    >
      {tags.length === 0 ? (
        <span className="text-muted-foreground text-xs">—</span>
      ) : (
        tags.slice(0, 3).map((tag) => {
          const meta = tagMeta?.get(tag);
          return (
            <Badge
              key={tag}
              variant="outline"
              className="text-2xs uppercase tracking-wider font-bold py-0 px-1.5"
              style={hashToColor(tag)}
              title={tooltipFor(meta)}
            >
              {meta ? `${SOURCE_ICONS[meta.source]} ` : ''}
              {tag}
            </Badge>
          );
        })
      )}
      {tags.length > 3 && (
        <Badge variant="secondary" className="text-2xs py-0 px-1.5 font-normal opacity-70">
          +{tags.length - 3}
        </Badge>
      )}
    </Button>
  );
}

/**
 * TagEditor — inline popover for editing transaction tags.
 */
export function TagEditor(props: TagEditorProps) {
  const { disabled = false, tagMeta } = props;
  const { open, setOpen, tags, handlers } = useTagEditorState(props);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerContent tags={tags} disabled={disabled} tagMeta={tagMeta} />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <TagEditorPanel {...handlers} />
      </PopoverContent>
    </Popover>
  );
}
