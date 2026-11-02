import { useState } from 'react';
import type { OwnerInfo, Person, Tag, Workflow } from '../../api/types';
import { Avatar, useCanEdit } from '../../lib/session';
import { NodeIcon } from '../../components/ui';
import { useCatalog, nodeLook } from '../../lib/catalog';
import { TRIGGER_LABEL, appTypes, categoryColor, categoryName, countBy, isCategoryTag, labelTags, categoryOf, triggerKind, type TriggerKind } from '../../lib/organize';
import type { Filters } from './filters';

function RailItem({ active, onClick, children, count, color }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number; color?: string }) {
  return (
    <button type="button" className={`rail-item${active ? ' on' : ''}`} aria-pressed={active} onClick={onClick}>
      {color && <span className="rail-dot" style={{ background: color }} />}
      <span className="grow rail-text">{children}</span>
      {count !== undefined && <span className="rail-count">{count}</span>}
    </button>
  );
}

export function CatalogRail({ all, tags, filters, set, onManage, onNewCategory, failingIds, own, people }: {
  own: Record<string, OwnerInfo>;
  people: Person[];
  all: Workflow[];
  tags: Tag[];
  filters: Filters;
  set: (patch: Partial<Filters>) => void;
  onManage: () => void;
  onNewCategory: () => void;
  failingIds: Set<string>;
}) {
  const catalog = useCatalog();
  const canEdit = useCanEdit();
  const [allApps, setAllApps] = useState(false);
  const [open, setOpen] = useState(false);
  const live = all.filter((w) => !w.isArchived);
  const catCounts = countBy(live, (w) => { const c = categoryOf(w); return c ? [categoryName(c)] : ['']; });
  const categories = [...new Set([...tags.filter(isCategoryTag).map(categoryName), ...[...catCounts.keys()].filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  const tagCounts = countBy(live, (w) => labelTags(w).map((t) => t.id));
  const labelList = tags.filter((t) => !isCategoryTag(t)).sort((a, b) => (tagCounts.get(b.id) ?? 0) - (tagCounts.get(a.id) ?? 0) || a.name.localeCompare(b.name));
  const appCounts = countBy(live, (w) => appTypes(w.nodes));
  const apps = [...appCounts.entries()].sort((a, b) => b[1] - a[1]);
  const trigCounts = countBy(live, (w) => [triggerKind(w.nodes)]);
  const toggleIn = (key: 'tags' | 'apps', v: string) => {
    const next = new Set(filters[key]);
    if (next.has(v)) next.delete(v); else next.add(v);
    set({ [key]: next } as Partial<Filters>);
  };

  return (
    <aside className={`rail${open ? ' open' : ''}`} aria-label="Organize workflows">
      <button type="button" className="btn rail-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide filters' : 'Categories and filters'}
      </button>
      <section>
        <RailItem active={filters.view === 'all' && !filters.category} onClick={() => set({ view: 'all', category: null })} count={live.length}>All workflows</RailItem>
        <RailItem active={filters.view === 'attention'} onClick={() => set({ view: 'attention', category: null })} count={failingIds.size} color={failingIds.size ? 'var(--bad)' : undefined}>Needs attention</RailItem>
        <RailItem active={filters.view === 'archived'} onClick={() => set({ view: 'archived', category: null })} count={all.length - live.length}>Archived</RailItem>
      </section>

      <section>
        <div className="rail-head"><h3>Categories</h3>{canEdit && <button type="button" className="link-btn" onClick={onNewCategory}>New</button>}</div>
        {categories.map((c) => (
          <RailItem key={c} active={filters.category === c} onClick={() => set({ category: filters.category === c ? null : c, view: 'all' })} count={catCounts.get(c) ?? 0} color={categoryColor(c)}>{c}</RailItem>
        ))}
        <RailItem active={filters.category === ''} onClick={() => set({ category: filters.category === '' ? null : '', view: 'all' })} count={catCounts.get('') ?? 0} color="var(--border-strong)">Uncategorized</RailItem>
      </section>

      {labelList.length > 0 && (
        <section>
          <div className="rail-head"><h3>Tags</h3>{canEdit && <button type="button" className="link-btn" onClick={onManage}>Manage</button>}</div>
          <div className="row wrap" style={{ gap: 6, padding: '2px 6px' }}>
            {labelList.map((t) => {
              const on = filters.tags.has(t.id);
              return (
                <button key={t.id} type="button" className={`tag-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => toggleIn('tags', t.id)}>
                  {t.name}<span className="rail-count">{tagCounts.get(t.id) ?? 0}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {apps.length > 0 && (
        <section>
          <div className="rail-head"><h3>Apps</h3></div>
          <div className="app-grid">
            {(allApps ? apps : apps.slice(0, 12)).map(([type, n]) => {
              const on = filters.apps.has(type);
              const label = nodeLook(type, catalog.get(type)).label;
              return (
                <button key={type} type="button" className={`app-tile${on ? ' on' : ''}`} aria-pressed={on} title={`${label} (${n})`} onClick={() => toggleIn('apps', type)}>
                  <NodeIcon type={type} size={30} title="" />
                  <span className="sr-only">{label}</span>
                  <span className="app-n">{n}</span>
                </button>
              );
            })}
          </div>
          {apps.length > 12 && <button type="button" className="link-btn" style={{ marginLeft: 8 }} onClick={() => setAllApps(!allApps)}>{allApps ? 'Show fewer' : `Show all ${apps.length}`}</button>}
        </section>
      )}

      {people.length > 1 && (
        <section>
          <div className="rail-head"><h3>Last changed by</h3></div>
          {people.map((p) => {
            const n = live.filter((w) => own[w.id]?.changedBy?.id === p.id).length;
            if (!n && filters.person !== String(p.id)) return null;
            const on = filters.person === String(p.id);
            return (
              <button key={p.id} type="button" className={`rail-item${on ? ' on' : ''}`} aria-pressed={on} onClick={() => set({ person: on ? null : String(p.id) })}>
                <Avatar name={p.displayName} size={20} /><span className="grow rail-text">{p.displayName}</span><span className="rail-count">{n}</span>
              </button>
            );
          })}
        </section>
      )}

      <section>
        <div className="rail-head"><h3>Starts with</h3></div>
        {([...trigCounts.entries()] as Array<[TriggerKind, number]>).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
          <RailItem key={k} active={filters.trigger === k} onClick={() => set({ trigger: filters.trigger === k ? null : k })} count={n}>{TRIGGER_LABEL[k]}</RailItem>
        ))}
      </section>
    </aside>
  );
}
