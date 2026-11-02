import type { OwnerInfo, Workflow } from '../../api/types';
import { appTypes, categoryName, categoryOf, labelTags, triggerKind, type TriggerKind } from '../../lib/organize';

export type View = 'all' | 'attention' | 'archived';
export type GroupBy = 'category' | 'none';
export type SortBy = 'updated' | 'name' | 'lastRun';

export interface Filters {
  view: View;
  /** null = any, '' = uncategorized, otherwise a category name */
  category: string | null;
  tags: Set<string>;
  apps: Set<string>;
  trigger: TriggerKind | null;
  status: 'active' | 'inactive' | null;
  /** Whose workflows: everyone, ones I created, ones I changed last. */
  owner: 'all' | 'created' | 'changed';
  /** Last changed by this HappyN8 user id. */
  person: string | null;
  q: string;
}

export const EMPTY: Filters = { view: 'all', category: null, tags: new Set(), apps: new Set(), trigger: null, status: null, owner: 'all', person: null, q: '' };

export function readFilters(p: URLSearchParams): Filters {
  const list = (k: string) => new Set((p.get(k) || '').split(',').filter(Boolean));
  return {
    view: (p.get('view') as View) || 'all',
    category: p.has('category') ? p.get('category') ?? '' : null,
    tags: list('tags'),
    apps: list('apps'),
    trigger: (p.get('trigger') as TriggerKind) || null,
    status: (p.get('status') as Filters['status']) || null,
    owner: (p.get('owner') as Filters['owner']) || 'all',
    person: p.get('person') || null,
    q: p.get('q') || '',
  };
}

export function writeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.view !== 'all') p.set('view', f.view);
  if (f.category !== null) p.set('category', f.category);
  if (f.tags.size) p.set('tags', [...f.tags].join(','));
  if (f.apps.size) p.set('apps', [...f.apps].join(','));
  if (f.trigger) p.set('trigger', f.trigger);
  if (f.status) p.set('status', f.status);
  if (f.owner !== 'all') p.set('owner', f.owner);
  if (f.person) p.set('person', f.person);
  if (f.q) p.set('q', f.q);
  return p;
}

export function applyFilters(all: Workflow[], f: Filters, failing: Set<string>, own: Record<string, OwnerInfo> = {}, meId?: number): Workflow[] {
  const q = f.q.trim().toLowerCase();
  return all.filter((w) => {
    const o = own[w.id];
    if (f.owner === 'created' && o?.createdBy?.id !== meId) return false;
    if (f.owner === 'changed' && o?.changedBy?.id !== meId) return false;
    if (f.person && String(o?.changedBy?.id ?? '') !== f.person) return false;
    if (f.view === 'archived' ? !w.isArchived : w.isArchived) return false;
    if (f.view === 'attention' && !failing.has(w.id)) return false;
    if (f.category !== null) {
      const c = categoryOf(w);
      if ((c ? categoryName(c) : '') !== f.category) return false;
    }
    if (f.status === 'active' && !w.active) return false;
    if (f.status === 'inactive' && w.active) return false;
    if (f.trigger && triggerKind(w.nodes) !== f.trigger) return false;
    if (f.tags.size && ![...f.tags].every((id) => labelTags(w).some((t) => t.id === id))) return false;
    if (f.apps.size) {
      const apps = appTypes(w.nodes);
      if (![...f.apps].every((a) => apps.includes(a))) return false;
    }
    if (q) {
      const hay = [w.name, w.description ?? '', ...(w.tags ?? []).map((t) => t.name), ...w.nodes.map((n) => `${n.name} ${n.type}`)].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: Filters): number {
  return (f.category !== null ? 1 : 0) + f.tags.size + f.apps.size + (f.trigger ? 1 : 0) + (f.status ? 1 : 0) + (f.person ? 1 : 0) + (f.owner !== 'all' ? 1 : 0);
}
