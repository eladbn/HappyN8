import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ensureTag, refreshCatalog, setCategory, setWorkflowTags } from '../api/organizeOps';
import { useTags, useWorkflows } from '../api/hooks';
import type { Tag, Workflow } from '../api/types';
import { Icon } from '../components/Icon';
import { errMsg, useToast } from '../components/ui';
import { CATEGORY_PREFIX, categoryColor, categoryName, categoryOf, isCategoryTag, labelTags } from '../lib/organize';
import type { Draft } from '../lib/workflow';
import { useCanEdit } from '../lib/session';

const ZONES: string[] = (() => {
  try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'); } catch { return []; }
})();

const SECTIONS = [
  { id: 'organize', title: 'Organize' },
  { id: 'running', title: 'Running' },
  { id: 'errors', title: 'When it fails' },
  { id: 'history', title: 'Run history' },
  { id: 'access', title: 'Access' },
];

function Row({ title, desc, children, htmlFor }: { title: string; desc?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="set-row">
      <div className="set-text">
        {htmlFor ? <label htmlFor={htmlFor} className="set-title">{title}</label> : <div className="set-title">{title}</div>}
        {desc && <div className="small muted">{desc}</div>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  );
}

/** Workflow settings as sections. Organize changes save immediately; the rest save with the workflow. */
export function SettingsView({ wf, draft, update, dirty, onSave, saving }: {
  wf: Workflow; draft: Draft; update: (fn: (d: Draft) => Draft) => void; dirty: boolean; onSave: () => void; saving: boolean;
}) {
  const s = draft.settings as Record<string, unknown>;
  const set = (k: string, v: unknown) => update((d) => {
    const settings = { ...d.settings };
    if (v === '' || v === undefined) delete settings[k]; else settings[k] = v;
    return { ...d, settings };
  });
  const wfs = useWorkflows();
  const errorWorkflows = (wfs.data ?? []).filter((w) => w.id !== wf.id && !w.isArchived && w.nodes.some((n) => n.type === 'n8n-nodes-base.errorTrigger'));
  const [active, setActive] = useState('organize');
  const canEdit = useCanEdit();

  return (
    <div className="settings">
      <nav className="settings-nav" aria-label="Settings sections">
        {SECTIONS.map((x) => (
          <a key={x.id} href={`#set-${x.id}`} className={active === x.id ? 'on' : ''} onClick={() => setActive(x.id)}>{x.title}</a>
        ))}
      </nav>
      <fieldset className="settings-body" disabled={!canEdit} style={{ border: 0, margin: 0 }}>
        {!canEdit && <div className="notice small">You have view-only access. Ask an admin for editor access to change settings.</div>}
        <section id="set-organize" className="set-section">
          <h2>Organize</h2>
          <p className="small muted section-note">Category and tags save right away and also show in n8n.</p>
          <OrganizeRows wf={wf} />
          <Row title="Description" desc="What this workflow does, for whoever opens it next. Saved with the workflow." htmlFor="wf-desc">
            <textarea id="wf-desc" className="textarea" rows={3} value={draft.description ?? ''} placeholder="e.g. Scores new leads from the website form and posts hot ones to #sales"
              onChange={(e) => update((d) => ({ ...d, description: e.target.value }))} />
          </Row>
        </section>

        <section id="set-running" className="set-section">
          <h2>Running</h2>
          <Row title="Timezone" desc="Used by schedules and date expressions." htmlFor="wf-tz">
            <select id="wf-tz" className="select" value={String(s.timezone ?? '')} onChange={(e) => set('timezone', e.target.value)}>
              <option value="">Same as the n8n server</option>
              {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </Row>
          <Row title="Time limit" desc="Stop a run that takes longer than this. Leave empty for no limit." htmlFor="wf-timeout">
            <div className="row">
              <input id="wf-timeout" className="input" type="number" min={1} style={{ width: 120 }} value={s.executionTimeout === undefined || Number(s.executionTimeout) < 0 ? '' : String(s.executionTimeout)} placeholder="No limit"
                onChange={(e) => set('executionTimeout', e.target.value === '' ? undefined : Number(e.target.value))} />
              <span className="small muted">seconds</span>
            </div>
          </Row>
          <Row title="Step order" desc="How branches run. Keep v1 unless an old workflow depends on v0." htmlFor="wf-order">
            <select id="wf-order" className="select" value={String(s.executionOrder ?? 'v1')} onChange={(e) => set('executionOrder', e.target.value)}>
              <option value="v1">v1: one branch at a time (recommended)</option>
              <option value="v0">v0: legacy</option>
            </select>
          </Row>
        </section>

        <section id="set-errors" className="set-section">
          <h2>When it fails</h2>
          <Row title="Error workflow" desc="Runs when this workflow fails, for example to alert you on Slack. Only workflows that start with an Error Trigger are listed." htmlFor="wf-errwf">
            <select id="wf-errwf" className="select" value={String(s.errorWorkflow ?? '')} onChange={(e) => set('errorWorkflow', e.target.value)}>
              <option value="">None</option>
              {errorWorkflows.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Row>
        </section>

        <section id="set-history" className="set-section">
          <h2>Run history</h2>
          <p className="small muted section-note">Saved runs appear in the Runs tab with each step's data. Not saving them reduces database size.</p>
          {([['saveDataSuccessExecution', 'Successful runs'], ['saveDataErrorExecution', 'Failed runs']] as const).map(([k, l]) => (
            <Row key={k} title={l} htmlFor={`wf-${k}`}>
              <select id={`wf-${k}`} className="select" value={String(s[k] ?? '')} onChange={(e) => set(k, e.target.value)}>
                <option value="">n8n default</option><option value="all">Keep</option><option value="none">Don't keep</option>
              </select>
            </Row>
          ))}
          <Row title="Test runs" desc="Runs started with Run once or Test this step." htmlFor="wf-manual">
            <select id="wf-manual" className="select" value={s.saveManualExecutions === undefined ? '' : String(s.saveManualExecutions)} onChange={(e) => set('saveManualExecutions', e.target.value === '' ? undefined : e.target.value === 'true')}>
              <option value="">n8n default</option><option value="true">Keep</option><option value="false">Don't keep</option>
            </select>
          </Row>
          <Row title="Progress while running" desc="Saves after every step so a crashed run can be resumed. Slower." htmlFor="wf-progress">
            <select id="wf-progress" className="select" value={s.saveExecutionProgress === undefined ? '' : String(s.saveExecutionProgress)} onChange={(e) => set('saveExecutionProgress', e.target.value === '' ? undefined : e.target.value === 'true')}>
              <option value="">n8n default</option><option value="true">Save progress</option><option value="false">Don't save progress</option>
            </select>
          </Row>
        </section>

        <section id="set-access" className="set-section">
          <h2>Access</h2>
          <Row title="Other workflows can call this one" desc="Controls the “Execute workflow” step in other workflows." htmlFor="wf-caller">
            <select id="wf-caller" className="select" value={String(s.callerPolicy ?? 'workflowsFromSameOwner')} onChange={(e) => set('callerPolicy', e.target.value)}>
              <option value="workflowsFromSameOwner">Workflows from the same project</option>
              <option value="any">Any workflow</option>
              <option value="workflowsFromAList">Only the workflows listed below</option>
              <option value="none">None</option>
            </select>
          </Row>
          {s.callerPolicy === 'workflowsFromAList' && (
            <Row title="Allowed workflow IDs" desc="Separate IDs with commas. The ID is in the workflow's address." htmlFor="wf-callers">
              <input id="wf-callers" className="input" value={String(s.callerIds ?? '')} onChange={(e) => set('callerIds', e.target.value)} />
            </Row>
          )}
          <Row title="Workflow ID"><code className="small">{wf.id}</code></Row>
        </section>
      </fieldset>
      {dirty && (
        <div className="save-bar" role="status">
          <span>You have unsaved changes.</span>
          <button type="button" className="btn primary sm" disabled={saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      )}
    </div>
  );
}

function OrganizeRows({ wf }: { wf: Workflow }) {
  const tagsQ = useTags();
  const tags = tagsQ.data ?? [];
  const qc = useQueryClient();
  const toast = useToast();
  const [newTag, setNewTag] = useState('');
  const [newCat, setNewCat] = useState('');
  const cat = categoryOf(wf);
  const labels = labelTags(wf);
  const categories = useMemo(() => tags.filter(isCategoryTag).map(categoryName).sort((a, b) => a.localeCompare(b)), [tags]);

  async function run(fn: () => Promise<unknown>, fail: string) {
    try { await fn(); await refreshCatalog(qc); } catch (e) { toast(`${fail}: ${errMsg(e)}`, 'bad'); }
  }

  async function addLabel() {
    const name = newTag.trim();
    if (!name) return;
    if (name.startsWith(CATEGORY_PREFIX)) { toast('Use Category for categories', 'bad'); return; }
    await run(async () => {
      const t: Tag = await ensureTag(name, tags);
      if (!labels.some((x) => x.id === t.id)) await setWorkflowTags(wf.id, [...(wf.tags ?? []), t]);
      setNewTag('');
    }, "Couldn't add the tag");
  }

  return (
    <>
      <Row title="Category" desc="Groups this workflow on the Workflows page." htmlFor="wf-cat">
        <div className="row wrap">
          {cat && <span className="rail-dot big" style={{ background: categoryColor(categoryName(cat)) }} />}
          <select id="wf-cat" className="select" style={{ flex: 1, minWidth: 160 }} value={cat ? categoryName(cat) : ''}
            onChange={(e) => run(() => setCategory(wf, e.target.value || null, tags), "Couldn't change the category")}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input" style={{ width: 160 }} placeholder="New category" aria-label="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newCat.trim()) run(() => setCategory(wf, newCat, tags).then(() => setNewCat('')), "Couldn't create the category"); }} />
        </div>
      </Row>
      <Row title="Tags" desc="Free labels for filtering, such as a client or a team.">
        <div className="row wrap" style={{ gap: 6 }}>
          {labels.length === 0 && <span className="small muted">No tags</span>}
          {labels.map((t) => (
            <span key={t.id} className="tag-chip on">{t.name}
              <button type="button" aria-label={`Remove tag ${t.name}`} className="chip-x" onClick={() => run(() => setWorkflowTags(wf.id, (wf.tags ?? []).filter((x) => x.id !== t.id)), "Couldn't remove the tag")}><Icon name="close" size={11} /></button>
            </span>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" list="wf-tag-options" placeholder="Add a tag" aria-label="Add a tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addLabel(); }} />
          <datalist id="wf-tag-options">{tags.filter((t) => !isCategoryTag(t)).map((t) => <option key={t.id} value={t.name} />)}</datalist>
          <button type="button" className="btn" disabled={!newTag.trim()} onClick={addLabel}>Add</button>
        </div>
      </Row>
    </>
  );
}
