import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { n8n } from '../../api/client';
import { addTag, ensureTag, refreshCatalog, removeTag, setCategory } from '../../api/organizeOps';
import type { N8nNode, Tag, Workflow } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Modal, errMsg, useToast } from '../../components/ui';
import { CATEGORY_PREFIX, categoryColor, categoryName, categoryOf, isCategoryTag } from '../../lib/organize';
import { newId, toDraft, toSaveBody } from '../../lib/workflow';

/** Fresh webhook ids so a copy doesn't collide with the original's webhook URLs. */
export function freshWebhooks(nodes: N8nNode[]): N8nNode[] {
  return nodes.map((n) => {
    if (!n.webhookId) return n;
    const id = newId();
    const params = { ...n.parameters };
    if (params.path === n.webhookId) params.path = id;
    return { ...n, webhookId: id, parameters: params };
  });
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Pick (or create) one category for one or more workflows. */
export function CategoryDialog({ targets, tags, onClose }: { targets: Workflow[]; tags: Tag[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const categories = useMemo(() => tags.filter(isCategoryTag).map(categoryName).sort((a, b) => a.localeCompare(b)), [tags]);
  const current = targets.length === 1 ? categoryOf(targets[0]) : undefined;
  const [choice, setChoice] = useState<string | null>(current ? categoryName(current) : null);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);

  async function apply() {
    const name = fresh.trim() || choice;
    setBusy(true);
    try {
      if (!targets.length) {
        if (!name) { onClose(); return; }
        await ensureTag(`${CATEGORY_PREFIX}${name.trim()}`, tags);
        await refreshCatalog(qc);
        toast(`Created the ${name} category`, 'ok');
        onClose();
        return;
      }
      const tag = name ? await ensureTag(`${CATEGORY_PREFIX}${name.trim()}`, tags) : null;
      for (const w of targets) await setCategory(w, tag, tags);
      await refreshCatalog(qc);
      toast(name ? `Moved ${plural(targets.length, 'workflow')} to ${name}` : `Removed the category from ${plural(targets.length, 'workflow')}`, 'ok');
      onClose();
    } catch (e) {
      toast(`Could not change the category: ${errMsg(e)}`, 'bad');
      setBusy(false);
    }
  }

  return (
    <Modal title={targets.length === 0 ? 'New category' : targets.length === 1 ? `Category for “${targets[0].name}”` : `Category for ${plural(targets.length, 'workflow')}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={apply}>{busy ? 'Saving…' : 'Save category'}</button></>}>
      {targets.length > 0 && <div className="choice-list" role="radiogroup" aria-label="Category">
        {categories.map((c) => (
          <label key={c} className={`choice${choice === c && !fresh ? ' on' : ''}`}>
            <input type="radio" name="cat" checked={choice === c && !fresh} onChange={() => { setChoice(c); setFresh(''); }} />
            <span className="rail-dot" style={{ background: categoryColor(c) }} />{c}
          </label>
        ))}
        <label className={`choice${choice === null && !fresh ? ' on' : ''}`}>
          <input type="radio" name="cat" checked={choice === null && !fresh} onChange={() => { setChoice(null); setFresh(''); }} />
          <span className="rail-dot" style={{ background: 'var(--border-strong)' }} />No category
        </label>
      </div>}
      <label className="field">
        <span className="label">{targets.length ? 'Or create a new category' : 'Category name'}</span>
        <input className="input" autoFocus={!targets.length} placeholder="e.g. Sales, Finance, Internal tools" value={fresh} onChange={(e) => setFresh(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') apply(); }} />
        <span className="hint">Stored in n8n as the tag “{CATEGORY_PREFIX}{fresh.trim() || 'Name'}”.</span>
      </label>
    </Modal>
  );
}

/** Add or remove labels on one or more workflows. Mixed state shows as “some”. */
export function TagsDialog({ targets, tags, onClose }: { targets: Workflow[]; tags: Tag[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const labels = useMemo(() => tags.filter((t) => !isCategoryTag(t)).sort((a, b) => a.name.localeCompare(b.name)), [tags]);
  const initial = (id: string) => {
    const n = targets.filter((w) => (w.tags ?? []).some((t) => t.id === id)).length;
    return n === 0 ? 'none' : n === targets.length ? 'all' : 'some';
  };
  const [state, setState] = useState<Record<string, 'all' | 'some' | 'none'>>(() => Object.fromEntries(labels.map((t) => [t.id, initial(t.id)])));
  const [extra, setExtra] = useState<Tag[]>([]);
  const [fresh, setFresh] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    const name = fresh.trim();
    if (!name) return;
    if (name.startsWith(CATEGORY_PREFIX)) { toast('Use “Set category” for categories', 'bad'); return; }
    try {
      const t = await ensureTag(name, tags);
      if (!labels.some((l) => l.id === t.id)) setExtra((x) => [...x, t]);
      setState((s) => ({ ...s, [t.id]: 'all' }));
      setFresh('');
    } catch (e) {
      toast(`Could not create the tag: ${errMsg(e)}`, 'bad');
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const all = [...labels, ...extra];
      for (const w of targets) {
        let cur = { ...w, tags: [...(w.tags ?? [])] };
        for (const t of all) {
          const s = state[t.id];
          const has = cur.tags.some((x) => x.id === t.id);
          if (s === 'all' && !has) { await addTag(cur, t); cur = { ...cur, tags: [...cur.tags, t] }; }
          if (s === 'none' && has) { await removeTag(cur, t.id); cur = { ...cur, tags: cur.tags.filter((x) => x.id !== t.id) }; }
        }
      }
      await refreshCatalog(qc);
      toast('Tags updated', 'ok');
      onClose();
    } catch (e) {
      toast(`Could not update tags: ${errMsg(e)}`, 'bad');
      setBusy(false);
    }
  }

  return (
    <Modal title={targets.length === 1 ? `Tags for “${targets[0].name}”` : `Tags for ${plural(targets.length, 'workflow')}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy} onClick={apply}>{busy ? 'Saving…' : 'Save tags'}</button></>}>
      {[...labels, ...extra].length === 0 && <div className="muted">No tags yet. Create the first one below.</div>}
      <div className="row wrap" style={{ gap: 8 }}>
        {[...labels, ...extra].map((t) => {
          const s = state[t.id] ?? 'none';
          return (
            <button key={t.id} type="button" className={`tag-chip big${s === 'all' ? ' on' : s === 'some' ? ' some' : ''}`} aria-pressed={s === 'all' ? true : s === 'some' ? 'mixed' : false}
              onClick={() => setState((x) => ({ ...x, [t.id]: s === 'all' ? 'none' : 'all' }))}>
              {s === 'all' && <Icon name="check" size={13} />}{t.name}{s === 'some' && <span className="muted"> (some)</span>}
            </button>
          );
        })}
      </div>
      <div className="row">
        <input className="input" placeholder="New tag" aria-label="New tag" value={fresh} onChange={(e) => setFresh(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
        <button type="button" className="btn" onClick={create} disabled={!fresh.trim()}>Create</button>
      </div>
    </Modal>
  );
}

/** Rename or delete categories and tags across all workflows. */
export function ManageTagsDialog({ tags, onClose }: { tags: Tag[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const sorted = [...tags].sort((a, b) => Number(isCategoryTag(b)) - Number(isCategoryTag(a)) || a.name.localeCompare(b.name));

  async function rename(t: Tag) {
    const raw = (edits[t.id] ?? '').trim();
    if (!raw) return;
    const name = isCategoryTag(t) ? `${CATEGORY_PREFIX}${raw}` : raw;
    try {
      await n8n.put(`/tags/${t.id}`, { name });
      await refreshCatalog(qc);
      setEdits((e) => { const n = { ...e }; delete n[t.id]; return n; });
      toast('Renamed', 'ok');
    } catch (e) { toast(`Rename failed: ${errMsg(e)}`, 'bad'); }
  }

  async function remove(t: Tag) {
    if (!window.confirm(`Delete “${isCategoryTag(t) ? categoryName(t) : t.name}”? It is removed from every workflow.`)) return;
    try {
      await n8n.del(`/tags/${t.id}`);
      await refreshCatalog(qc);
      toast('Deleted', 'ok');
    } catch (e) { toast(`Delete failed: ${errMsg(e)}`, 'bad'); }
  }

  return (
    <Modal title="Categories and tags" onClose={onClose} footer={<button type="button" className="btn primary" onClick={onClose}>Done</button>}>
      {sorted.length === 0 && <div className="muted">Nothing to manage yet.</div>}
      {sorted.map((t) => {
        const cat = isCategoryTag(t);
        const shown = cat ? categoryName(t) : t.name;
        return (
          <div key={t.id} className="row">
            <span className="rail-dot" style={{ background: cat ? categoryColor(shown) : 'transparent', border: cat ? 0 : '1.5px solid var(--border-strong)' }} title={cat ? 'Category' : 'Tag'} />
            <input className="input" aria-label={`Name of ${shown}`} value={edits[t.id] ?? shown} onChange={(e) => setEdits({ ...edits, [t.id]: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') rename(t); }} />
            <span className="small muted" style={{ width: 64 }}>{cat ? 'Category' : 'Tag'}</span>
            <button type="button" className="btn sm" disabled={edits[t.id] === undefined || edits[t.id] === shown} onClick={() => rename(t)}>Rename</button>
            <button type="button" className="btn ghost sm icon" aria-label={`Delete ${shown}`} onClick={() => remove(t)}><Icon name="trash" size={14} /></button>
          </div>
        );
      })}
    </Modal>
  );
}

export function CreateDialog({ mode, onClose, onCreated, category, tags }: { mode: 'new' | 'import'; onClose: () => void; onCreated: (id: string) => void; category: string | null; tags: Tag[] }) {
  const [name, setName] = useState('');
  const [json, setJson] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      let body: Record<string, unknown>;
      if (mode === 'import') {
        const parsed = JSON.parse(json) as Partial<Workflow>;
        if (!Array.isArray(parsed.nodes)) throw new Error('The JSON must contain a "nodes" array (an n8n workflow export).');
        body = toSaveBody(toDraft({ name: name || parsed.name || 'Imported workflow', nodes: freshWebhooks(parsed.nodes), connections: parsed.connections || {}, settings: parsed.settings || { executionOrder: 'v1' }, pinData: parsed.pinData }));
      } else {
        body = { name: name.trim() || 'My workflow', nodes: [], connections: {}, settings: { executionOrder: 'v1' } };
      }
      const created = await n8n.post<Workflow>('/workflows', body);
      if (category) await setCategory({ id: created.id, tags: [] }, category, tags);
      onCreated(created.id);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={mode === 'new' ? 'Create workflow' : 'Import workflow JSON'} onClose={onClose} wide={mode === 'import'}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="button" className="btn primary" disabled={busy || (mode === 'import' && !json.trim())} onClick={submit}>{busy ? 'Creating…' : mode === 'new' ? 'Create workflow' : 'Import workflow'}</button></>}>
      <label className="field">
        <span className="label">Name</span>
        <input className="input" autoFocus value={name} placeholder={mode === 'import' ? 'Keep the name from the JSON' : 'My workflow'} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'new') submit(); }} />
        {category && <span className="hint">It goes into the {category} category.</span>}
      </label>
      {mode === 'import' && (
        <label className="field">
          <span className="label">Workflow JSON</span>
          <textarea className="textarea code" rows={14} value={json} onChange={(e) => setJson(e.target.value)} placeholder='Paste an exported n8n workflow ({"nodes": [...], "connections": {...}})' />
        </label>
      )}
      {error && <div className="notice bad">{error}</div>}
    </Modal>
  );
}
