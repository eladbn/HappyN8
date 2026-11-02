import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { n8n } from '../api/client';
import { qk, useMeta, useOwnership, usePeople, useRecentExecutions, useTags, useWorkflows } from '../api/hooks';
import { useSession } from '../lib/session';
import type { Execution, Workflow } from '../api/types';
import { Icon } from '../components/Icon';
import { Spinner, errMsg, useToast } from '../components/ui';
import { useCatalog, nodeLook } from '../lib/catalog';
import { TRIGGER_LABEL, categoryColor, categoryName, categoryOf } from '../lib/organize';
import { toDraft, toSaveBody } from '../lib/workflow';
import { CatalogRail } from './workflows/CatalogRail';
import { CategoryDialog, CreateDialog, ManageTagsDialog, TagsDialog, freshWebhooks } from './workflows/dialogs';
import { EMPTY, activeFilterCount, applyFilters, readFilters, writeFilters, type Filters, type GroupBy, type SortBy } from './workflows/filters';
import { ROW_COLS, WorkflowRow, type RowActions } from './workflows/WorkflowRow';

function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { return (localStorage.getItem(key) as T) || initial; } catch { return initial; } });
  return [v, (x) => { setV(x); try { localStorage.setItem(key, x); } catch { /* storage unavailable */ } }];
}

type Dialog = { kind: 'category' | 'tags'; targets: Workflow[] } | { kind: 'manage' } | { kind: 'create'; mode: 'new' | 'import' } | null;

export function WorkflowsPage() {
  const wfs = useWorkflows();
  const tagsQ = useTags();
  const recent = useRecentExecutions();
  const meta = useMeta();
  const catalog = useCatalog();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const [groupBy, setGroupBy] = usePref<GroupBy>('fb.groupBy', 'category');
  const [sortBy, setSortBy] = usePref<SortBy>('fb.sortBy', 'updated');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const tags = tagsQ.data ?? [];
  const all = wfs.data ?? [];
  const { user: me } = useSession();
  const canEdit = me.role !== 'viewer';
  const ownQ = useOwnership();
  const own = ownQ.data ?? {};
  const people = usePeople();

  const set = (patch: Partial<Filters>) => setParams(writeFilters({ ...filters, ...patch }), { replace: true });

  const runs = useMemo(() => {
    const map = new Map<string, { last: Execution; count: number }>();
    for (const e of recent.data?.data ?? []) {
      const cur = map.get(e.workflowId);
      if (!cur) map.set(e.workflowId, { last: e, count: 1 }); else cur.count += 1;
    }
    return map;
  }, [recent.data]);
  const failing = useMemo(() => new Set([...runs].filter(([, r]) => r.last.status === 'error' || r.last.status === 'crashed').map(([id]) => id)), [runs]);

  const rows = useMemo(() => {
    const list = applyFilters(all, filters, failing, own, me.id);
    const lastTime = (w: Workflow) => Date.parse(runs.get(w.id)?.last.startedAt ?? '') || 0;
    return list.sort((a, b) => (sortBy === 'name' ? a.name.localeCompare(b.name)
      : sortBy === 'lastRun' ? lastTime(b) - lastTime(a) : Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
  }, [all, filters, failing, runs, sortBy, own, me.id]);

  const groups = useMemo(() => {
    if (groupBy !== 'category' || filters.category !== null) return [{ key: '*', label: '', rows }];
    const m = new Map<string, Workflow[]>();
    for (const w of rows) { const c = categoryOf(w); const k = c ? categoryName(c) : ''; if (!m.has(k)) m.set(k, []); m.get(k)!.push(w); }
    return [...m.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b))).map(([k, r]) => ({ key: k, label: k || 'Uncategorized', rows: r }));
  }, [rows, groupBy, filters.category]);

  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.workflows }), qc.invalidateQueries({ queryKey: ['ownership'] }), qc.invalidateQueries({ queryKey: ['audit'] })]);
  async function act(w: Workflow, label: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(w.id);
    try { await fn(); if (done) toast(done, 'ok'); await refresh(); } catch (e) { toast(`${label} failed: ${errMsg(e)}`, 'bad'); } finally { setBusy(null); }
  }

  const actions: RowActions = {
    open: (w) => navigate(`/workflows/${w.id}`),
    toggle: (w, on) => act(w, on ? 'Activating' : 'Deactivating', () => n8n.post(`/workflows/${w.id}/${on ? 'activate' : 'deactivate'}`), on ? `“${w.name}” is active` : `“${w.name}” is deactivated`),
    duplicate: (w) => act(w, 'Duplicating', async () => {
      const full = await n8n.get<Workflow>(`/workflows/${w.id}`);
      const d = toDraft(full);
      d.name = `${full.name} (copy)`;
      d.nodes = freshWebhooks(d.nodes);
      const created = await n8n.post<Workflow>('/workflows', toSaveBody(d));
      if (full.tags?.length) await n8n.put(`/workflows/${created.id}/tags`, full.tags.map((t) => ({ id: t.id })));
      navigate(`/workflows/${created.id}`);
    }),
    category: (w) => setDialog({ kind: 'category', targets: [w] }),
    tags: (w) => setDialog({ kind: 'tags', targets: [w] }),
    archive: (w) => { if (window.confirm(`Archive “${w.name}”? It is deactivated and moved to Archived.`)) act(w, 'Archiving', () => n8n.post(`/workflows/${w.id}/archive`), 'Archived'); },
    restore: (w) => act(w, 'Restoring', () => n8n.post(`/workflows/${w.id}/unarchive`), 'Restored'),
    remove: (w) => { if (window.confirm(`Delete “${w.name}” permanently? This can't be undone.`)) act(w, 'Deleting', () => n8n.del(`/workflows/${w.id}`), 'Deleted'); },
  };

  function select(w: Workflow, on: boolean, shift: boolean) {
    const next = new Set(selected);
    if (shift && lastClicked) {
      const ids = rows.map((r) => r.id);
      const [a, b] = [ids.indexOf(lastClicked), ids.indexOf(w.id)].sort((x, y) => x - y);
      ids.slice(a, b + 1).forEach((id) => (on ? next.add(id) : next.delete(id)));
    } else if (on) next.add(w.id); else next.delete(w.id);
    setSelected(next);
    setLastClicked(w.id);
  }
  const selectedWfs = all.filter((w) => selected.has(w.id));

  async function bulk(label: string, fn: (w: Workflow) => Promise<unknown>) {
    setBusy('bulk');
    let failed = 0;
    for (const w of selectedWfs) { try { await fn(w); } catch { failed += 1; } }
    await refresh();
    setBusy(null);
    toast(failed ? `${label}: ${failed} of ${selectedWfs.length} failed` : `${label}: done for ${selectedWfs.length}`, failed ? 'bad' : 'ok');
  }

  const chips: Array<{ key: string; label: string; clear: () => void; color?: string }> = [];
  if (filters.category !== null) chips.push({ key: 'cat', label: filters.category || 'Uncategorized', color: filters.category ? categoryColor(filters.category) : undefined, clear: () => set({ category: null }) });
  for (const id of filters.tags) chips.push({ key: `t${id}`, label: tags.find((t) => t.id === id)?.name ?? id, clear: () => { const s = new Set(filters.tags); s.delete(id); set({ tags: s }); } });
  for (const a of filters.apps) chips.push({ key: `a${a}`, label: nodeLook(a, catalog.get(a)).label, clear: () => { const s = new Set(filters.apps); s.delete(a); set({ apps: s }); } });
  if (filters.trigger) chips.push({ key: 'trig', label: TRIGGER_LABEL[filters.trigger], clear: () => set({ trigger: null }) });
  if (filters.status) chips.push({ key: 'st', label: filters.status === 'active' ? 'Active' : 'Inactive', clear: () => set({ status: null }) });
  if (filters.person) chips.push({ key: 'person', label: `Changed by ${people.data?.find((p) => String(p.id) === filters.person)?.displayName ?? 'someone'}`, clear: () => set({ person: null }) });

  const title = filters.view === 'archived' ? 'Archived' : filters.view === 'attention' ? 'Needs attention' : filters.category !== null ? (filters.category || 'Uncategorized') : 'Workflows';

  return (
    <div className="catalog">
      <CatalogRail all={all} tags={tags} filters={filters} set={set} failingIds={failing} own={own} people={people.data ?? []}
        onManage={() => setDialog({ kind: 'manage' })} onNewCategory={() => setDialog({ kind: 'category', targets: selectedWfs })} />
      <div className="page catalog-main">
        <header className="page-head">
          <h1 className="row" style={{ gap: 12 }}>
            {filters.category && <span className="rail-dot big" style={{ background: categoryColor(filters.category) }} />}{title}
          </h1>
          <div className="row wrap">
            <label className="search">
              <Icon name="search" size={16} /><span className="sr-only">Search workflows</span>
              <input type="search" placeholder="Search names, apps, tags" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
            </label>
            {canEdit && <button type="button" className="btn" onClick={() => setDialog({ kind: 'create', mode: 'import' })}>Import</button>}
            {canEdit && <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'create', mode: 'new' })}><Icon name="plus" size={16} />Create workflow</button>}
          </div>
        </header>

        <div className="row wrap" style={{ justifyContent: 'space-between', gap: 10 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <div className="seg" role="group" aria-label="Whose workflows">
              {([['all', 'Everyone'], ['created', 'Created by me'], ['changed', 'Changed by me']] as const).map(([k, l]) => (
                <button key={k} type="button" aria-selected={filters.owner === k} onClick={() => set({ owner: k })}>{l}</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="Status">
              {([[null, 'Any status'], ['active', 'Active'], ['inactive', 'Inactive']] as const).map(([k, l]) => (
                <button key={String(k)} type="button" aria-selected={filters.status === k} onClick={() => set({ status: k })}>{l}</button>
              ))}
            </div>
            {chips.map((c) => (
              <span key={c.key} className="filter-chip">
                {c.color && <span className="rail-dot" style={{ background: c.color }} />}{c.label}
                <button type="button" aria-label={`Remove filter ${c.label}`} onClick={c.clear}><Icon name="close" size={12} /></button>
              </span>
            ))}
            {activeFilterCount(filters) > 1 && <button type="button" className="link-btn" onClick={() => setParams(writeFilters({ ...EMPTY, view: filters.view, q: filters.q }), { replace: true })}>Clear filters</button>}
          </div>
          <div className="row small" style={{ gap: 8 }}>
            <label className="row" style={{ gap: 6 }}><span className="muted">Group</span>
              <select className="select compact" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="category">By category</option><option value="none">No grouping</option>
              </select>
            </label>
            <label className="row" style={{ gap: 6 }}><span className="muted">Sort</span>
              <select className="select compact" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
                <option value="updated">Last edited</option><option value="lastRun">Last run</option><option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>

        <div className="card scroll-x">
          <div className="wf-table">
            <div className="list-row list-head" style={{ gridTemplateColumns: ROW_COLS }}>
              <span>{canEdit && <input type="checkbox" className="check" aria-label="Select all shown"
                checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />}</span>
              <span>Apps</span><span>Workflow</span><span>Last run</span><span>Runs</span><span>Active</span><span />
            </div>
            {wfs.isLoading && <div className="center"><Spinner /></div>}
            {wfs.error && <div className="empty">Couldn't load workflows: {errMsg(wfs.error)}</div>}
            {!wfs.isLoading && !wfs.error && rows.length === 0 && (
              <div className="empty">
                {all.length === 0 ? 'No workflows yet. Create one to get started.' : filters.owner !== 'all' && activeFilterCount(filters) === 1 ? (filters.owner === 'created' ? "You haven't created a workflow in HappyN8 yet." : "You haven't changed a workflow in HappyN8 yet.") : 'No workflow matches these filters.'}
                {activeFilterCount(filters) > 0 && <div style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => setParams(writeFilters({ ...EMPTY, view: filters.view }), { replace: true })}>Clear filters</button></div>}
              </div>
            )}
            {groups.map((g) => (
              <div key={g.key} role="group" aria-label={g.label || undefined}>
                {g.label && (
                  <div className="group-row">
                    <span className="rail-dot" style={{ background: g.key ? categoryColor(g.key) : 'var(--border-strong)' }} />
                    <button type="button" className="group-title" onClick={() => set({ category: g.key })}>{g.label}</button>
                    <span className="muted small">{g.rows.length}</span>
                  </div>
                )}
                {g.rows.map((w) => (
                  <WorkflowRow key={w.id} w={w} last={runs.get(w.id)?.last} runs={runs.get(w.id)?.count ?? 0} selected={selected.has(w.id)}
                    onSelect={(on, shift) => select(w, on, shift)} busy={busy === w.id || busy === 'bulk'} showCategory={groupBy !== 'category' || filters.category !== null}
                    n8nUrl={meta.data?.n8nUrl} actions={actions} owner={own[w.id]} canEdit={canEdit} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong>
          <button type="button" className="btn sm" onClick={() => setDialog({ kind: 'category', targets: selectedWfs })}><Icon name="folder" size={14} />Set category</button>
          <button type="button" className="btn sm" onClick={() => setDialog({ kind: 'tags', targets: selectedWfs })}><Icon name="pin" size={14} />Tags</button>
          <button type="button" className="btn sm" disabled={busy === 'bulk'} onClick={() => bulk('Activate', (w) => (w.active ? Promise.resolve() : n8n.post(`/workflows/${w.id}/activate`)))}>Activate</button>
          <button type="button" className="btn sm" disabled={busy === 'bulk'} onClick={() => bulk('Deactivate', (w) => (w.active ? n8n.post(`/workflows/${w.id}/deactivate`) : Promise.resolve()))}>Deactivate</button>
          {filters.view !== 'archived' && (
            <button type="button" className="btn sm danger" disabled={busy === 'bulk'} onClick={() => { if (window.confirm(`Archive ${selected.size} workflows?`)) bulk('Archive', (w) => n8n.post(`/workflows/${w.id}/archive`)).then(() => setSelected(new Set())); }}>Archive</button>
          )}
          <button type="button" className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      {dialog?.kind === 'category' && <CategoryDialog targets={dialog.targets} tags={tags} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'tags' && <TagsDialog targets={dialog.targets} tags={tags} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'manage' && <ManageTagsDialog tags={tags} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'create' && (
        <CreateDialog mode={dialog.mode} category={filters.category || null} tags={tags} onClose={() => setDialog(null)}
          onCreated={(id) => { refresh(); navigate(`/workflows/${id}`); }} />
      )}
    </div>
  );
}
