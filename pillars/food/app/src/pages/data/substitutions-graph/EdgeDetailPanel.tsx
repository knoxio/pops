import { useTranslation } from 'react-i18next';
/**
 * Side panel that opens when the user clicks an edge in the graph. The
 * from/to labels refocus the radial view; "Edit in table view" links to
 * the substitutions CRUD table.
 */
import { Link } from 'react-router';

import { nodeLabel } from './helpers';

import type { SubGraphEdge, SubGraphNode } from './types';

export interface EdgeDetailPanelProps {
  edge: SubGraphEdge;
  nodes: readonly SubGraphNode[];
  onSelectNode: (node: SubGraphNode) => void;
  onClose: () => void;
  tableEditHref: string;
}

export function EdgeDetailPanel(props: EdgeDetailPanelProps): React.ReactElement {
  const { t } = useTranslation('food');
  const nodesById = new Map(props.nodes.map((n) => [n.id, n]));
  const fromNode = nodesById.get(props.edge.fromNodeId);
  const toNode = nodesById.get(props.edge.toNodeId);
  const fromLabel = fromNode ? nodeLabel(fromNode) : props.edge.fromNodeId;
  const toLabel = toNode ? nodeLabel(toNode) : props.edge.toNodeId;
  return (
    <aside
      aria-label={t('data.substitutions.graph.edge.title')}
      className="bg-card flex w-80 flex-col gap-4 overflow-y-auto rounded-md border p-4"
    >
      <PanelHeader title={t('data.substitutions.graph.edge.title')} onClose={props.onClose} />
      <p className="flex items-center gap-2 text-sm">
        <SideLink node={fromNode} label={fromLabel} onSelect={props.onSelectNode} />
        <span aria-hidden>→</span>
        <SideLink node={toNode} label={toLabel} onSelect={props.onSelectNode} />
      </p>
      <RatioRow edge={props.edge} fromLabel={fromLabel} toLabel={toLabel} />
      <ContextTagsRow tags={props.edge.contextTags} />
      <ScopeRow scope={props.edge.scope} recipeSlug={props.edge.recipeSlug} />
      <NotesRow notes={props.edge.notes} />
      <Link
        to={props.tableEditHref}
        className="text-foreground hover:bg-muted inline-flex items-center self-start rounded-md border px-3 py-1.5 text-sm"
      >
        {t('data.substitutions.graph.edge.editInTable')}
      </Link>
    </aside>
  );
}

function PanelHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}): React.ReactElement {
  return (
    <header className="flex items-start justify-between gap-2">
      <h3 className="text-lg font-semibold">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        className="text-muted-foreground hover:text-foreground text-sm"
        aria-label="Close"
      >
        ✕
      </button>
    </header>
  );
}

function RatioRow({
  edge,
  fromLabel,
  toLabel,
}: {
  edge: SubGraphEdge;
  fromLabel: string;
  toLabel: string;
}): React.ReactElement {
  const { t } = useTranslation('food');
  const invalid = !Number.isFinite(edge.ratio) || edge.ratio <= 0;
  return (
    <DetailRow label={t('data.substitutions.graph.edge.ratioLabel')}>
      {invalid ? (
        t('data.substitutions.graph.edge.ratioInvalid', { ratio: edge.ratio })
      ) : (
        <>
          <strong>{edge.ratio.toFixed(2)}</strong>
          <span className="text-muted-foreground block text-xs">
            {t('data.substitutions.graph.edge.ratioVerbal', {
              ratio: edge.ratio.toFixed(2),
              from: fromLabel,
              to: toLabel,
            })}
          </span>
        </>
      )}
    </DetailRow>
  );
}

function ContextTagsRow({ tags }: { tags: readonly string[] }): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <DetailRow label={t('data.substitutions.graph.edge.contextTagsLabel')}>
      {tags.length === 0 ? (
        <span className="text-muted-foreground text-sm">
          {t('data.substitutions.graph.edge.contextTagsEmpty')}
        </span>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <li key={tag} className="bg-muted rounded-md px-2 py-0.5 text-xs">
              {tag}
            </li>
          ))}
        </ul>
      )}
    </DetailRow>
  );
}

function ScopeRow({
  scope,
  recipeSlug,
}: {
  scope: 'global' | 'recipe';
  recipeSlug: string | null;
}): React.ReactElement {
  const { t } = useTranslation('food');
  return (
    <DetailRow label={t('data.substitutions.graph.edge.scopeLabel')}>
      <span className="text-sm">{scope}</span>
      {recipeSlug !== null && (
        <span className="text-muted-foreground ml-2 text-xs">
          {t('data.substitutions.graph.edge.recipeLabel')}: {recipeSlug}
        </span>
      )}
    </DetailRow>
  );
}

function NotesRow({ notes }: { notes: string | null }): React.ReactElement | null {
  const { t } = useTranslation('food');
  if (notes === null || notes.length === 0) return null;
  return (
    <DetailRow label={t('data.substitutions.graph.edge.notesLabel')}>
      <p className="text-sm">{notes}</p>
    </DetailRow>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-semibold uppercase">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function SideLink({
  node,
  label,
  onSelect,
}: {
  node: SubGraphNode | undefined;
  label: string;
  onSelect: (node: SubGraphNode) => void;
}): React.ReactElement {
  if (node === undefined) return <span>{label}</span>;
  return (
    <button
      type="button"
      onClick={() => onSelect(node)}
      className="hover:bg-muted rounded-md border px-2 py-0.5 text-sm font-medium"
    >
      {label}
    </button>
  );
}
