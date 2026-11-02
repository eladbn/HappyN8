import { useExecutions, useHistory, useMeta, useOwnership } from '../api/hooks';
import { timeAgo } from '../lib/format';
import { useCanEdit } from '../lib/session';
import type { Workflow } from '../api/types';
import { Icon } from '../components/Icon';
import { Switch } from '../components/ui';
import { categoryColor, categoryName, categoryOf } from '../lib/organize';

export type Tab = 'editor' | 'executions' | 'history' | 'settings';

interface Props {
  wf: Workflow;
  name: string;
  onName: (v: string) => void;
  tab: Tab;
  onTab: (t: Tab) => void;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onActive: (on: boolean) => void;
  onBack: () => void;
}

function Status({ wf, dirty }: { wf: Workflow; dirty: boolean }) {
  const draftChanges = wf.active && !!wf.activeVersionId && wf.activeVersionId !== wf.versionId;
  if (dirty) return <span className="state-pill warn">Unsaved changes</span>;
  if (draftChanges) return <span className="state-pill live" title="Your latest save isn't live yet. Publish it to use it for real runs.">Saved, not published</span>;
  if (wf.active) return <span className="state-pill ok">Active</span>;
  return <span className="state-pill">Inactive</span>;
}

export function EditorBar(p: Props) {
  const { wf } = p;
  const meta = useMeta();
  const runs = useExecutions({ workflowId: wf.id }, { pageSize: 20 });
  const hist = useHistory(wf.id);
  const recentRuns = runs.data?.pages[0]?.data ?? [];
  const lastFailed = recentRuns[0] && (recentRuns[0].status === 'error' || recentRuns[0].status === 'crashed');
  const running = recentRuns.some((r) => r.status === 'running' || r.status === 'new');
  const versions = hist.data?.pages[0]?.data.length ?? 0;
  const cat = categoryOf(wf);
  const canEdit = useCanEdit();
  const own = useOwnership().data?.[wf.id];
  const editedInN8n = own?.changedAt ? Date.parse(wf.updatedAt) - Date.parse(own.changedAt) > 15_000 : !!own;
  const lastBy = own?.changedBy && !editedInN8n ? `Edited by ${own.changedBy.name} ${timeAgo(own.changedAt)}` : `Edited ${own ? 'in n8n ' : ''}${timeAgo(wf.updatedAt)}`;
  const draftChanges = wf.active && !!wf.activeVersionId && wf.activeVersionId !== wf.versionId;

  const tabs: Array<{ key: Tab; label: string; badge?: React.ReactNode }> = [
    { key: 'editor', label: 'Canvas' },
    { key: 'executions', label: 'Runs', badge: running ? <span className="dot live" title="Running now" /> : lastFailed ? <span className="dot bad" title="The last run failed" /> : recentRuns.length ? <span className="tab-count">{recentRuns.length}{runs.data?.pages[0]?.nextCursor ? '+' : ''}</span> : null },
    { key: 'history', label: 'Versions', badge: versions ? <span className="tab-count">{versions}{hist.hasNextPage ? '+' : ''}</span> : null },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <header className="editor-bar">
      <div className="row bar-left">
        <button type="button" className="btn ghost icon" aria-label="Back to workflows" onClick={p.onBack}><Icon name="back" /></button>
        <div className="bar-title">
          <span className="cat-mini">
            {cat && <><span className="rail-dot" style={{ background: categoryColor(categoryName(cat)) }} />{categoryName(cat)}<span aria-hidden="true">·</span></>}
            <span title={own?.createdBy ? `Created by ${own.createdBy.name}` : undefined}>{lastBy}</span>
          </span>
          <input className="name" aria-label="Workflow name" value={p.name} readOnly={!canEdit} onChange={(e) => p.onName(e.target.value)} />
        </div>
        <Status wf={wf} dirty={p.dirty} />
      </div>

      <nav className="bar-tabs" role="tablist" aria-label="Workflow views">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={p.tab === t.key} onClick={() => p.onTab(t.key)}>
            {t.label}{t.badge}
          </button>
        ))}
      </nav>

      <div className="row bar-right">
        {canEdit && <button type="button" className="btn ghost icon" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!p.canUndo} onClick={p.onUndo}><Icon name="undo" /></button>}
        {canEdit && <button type="button" className="btn ghost icon" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!p.canRedo} onClick={p.onRedo}><Icon name="redo" /></button>}
        {meta.data && <a className="btn ghost icon" href={`${meta.data.n8nUrl}/workflow/${wf.id}`} target="_blank" rel="noreferrer" aria-label="Open in n8n" title="Open in n8n"><Icon name="external" /></a>}
        <span className="bar-sep" />
        {!canEdit && <span className="state-pill">View only</span>}
        {canEdit && <>
        <label className="row small active-toggle" title={wf.active ? 'Turn off: triggers stop running' : 'Turn on: triggers start running the latest saved version'}>
          <Switch checked={wf.active} label={wf.active ? 'Deactivate workflow' : 'Activate workflow'} onChange={p.onActive} />
          <span>{wf.active ? 'On' : 'Off'}</span>
        </label>
        {draftChanges && !p.dirty && <button type="button" className="btn" onClick={() => p.onActive(true)}>Publish</button>}
        <button type="button" className="btn primary" disabled={!p.dirty || p.saving} onClick={p.onSave} title="Save (Ctrl+S)">
          {p.saving ? 'Saving…' : p.dirty ? 'Save' : <><Icon name="check" size={16} />Saved</>}
        </button>
        </>}
      </div>
    </header>
  );
}
