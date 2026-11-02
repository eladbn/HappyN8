import { Link, useNavigate } from 'react-router-dom';
import type { Execution, OwnerInfo, Workflow } from '../../api/types';
import { Icon } from '../../components/Icon';
import { Menu, ModuleStack, Switch } from '../../components/ui';
import { STATUS_LABEL, statusTone, timeAgo } from '../../lib/format';
import { TRIGGER_LABEL, categoryColor, categoryName, categoryOf, labelTags, triggerKind } from '../../lib/organize';
import { moduleTypes } from '../../lib/workflow';

export const ROW_COLS = '28px 168px minmax(0,1fr) 168px 64px 56px 44px';

export interface RowActions {
  open: (w: Workflow) => void;
  toggle: (w: Workflow, on: boolean) => void;
  duplicate: (w: Workflow) => void;
  category: (w: Workflow) => void;
  tags: (w: Workflow) => void;
  archive: (w: Workflow) => void;
  restore: (w: Workflow) => void;
  remove: (w: Workflow) => void;
}

export function WorkflowRow({ w, last, runs, selected, onSelect, busy, showCategory, n8nUrl, actions, owner, canEdit }: {
  w: Workflow;
  owner?: OwnerInfo;
  canEdit: boolean;
  last?: Execution;
  runs: number;
  selected: boolean;
  onSelect: (on: boolean, shift: boolean) => void;
  busy: boolean;
  showCategory: boolean;
  n8nUrl?: string;
  actions: RowActions;
}) {
  const navigate = useNavigate();
  const cat = categoryOf(w);
  const labels = labelTags(w);
  const unpublished = w.active && !!w.activeVersionId && w.activeVersionId !== w.versionId;
  const changedAt = owner?.changedAt ? Date.parse(owner.changedAt) : 0;
  const editedInN8n = !!owner && Date.parse(w.updatedAt) - changedAt > 15_000;
  const edited = owner?.changedBy && !editedInN8n
    ? <span className="edited-by" title={`Last change in HappyN8: ${new Date(changedAt).toLocaleString()}`}>{owner.changedBy.name}, {timeAgo(owner.changedAt)}</span>
    : <span className="edited-by muted" title="This change wasn't made through HappyN8">{owner ? 'Edited in n8n' : 'Edited'}, {timeAgo(w.updatedAt)}</span>;

  return (
    <div className={`list-row wf-row clickable${selected ? ' selected' : ''}`} style={{ gridTemplateColumns: ROW_COLS }} onClick={() => navigate(`/workflows/${w.id}`)}>
      <span onClick={(e) => e.stopPropagation()} className="sel-cell">
        {canEdit && <input type="checkbox" className="check" checked={selected} aria-label={`Select ${w.name}`}
          onChange={(e) => onSelect(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey)} />}
      </span>
      <ModuleStack types={moduleTypes(w.nodes)} />
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <Link to={`/workflows/${w.id}`} className="title-link ellipsis" onClick={(e) => e.stopPropagation()}>{w.name}</Link>
          {unpublished && <span className="chip live sm-chip" title="Saved changes are not live yet">Draft changes</span>}
        </div>
        <div className="row wrap" style={{ marginTop: 5, gap: 6 }}>
          {showCategory && cat && (
            <span className="cat-pill"><span className="rail-dot" style={{ background: categoryColor(categoryName(cat)) }} />{categoryName(cat)}</span>
          )}
          {edited}
          <span className="small muted">{TRIGGER_LABEL[triggerKind(w.nodes)]}</span>
          {labels.map((t) => <span key={t.id} className="tag-chip static">{t.name}</span>)}
          {w.description && <span className="small muted ellipsis" style={{ maxWidth: 360 }}>{w.description}</span>}
        </div>
      </div>
      <div className="row small" style={{ color: 'var(--ink-2)', gap: 8 }}>
        {last
          ? <><span className={`dot ${statusTone(last.status)}`} /><span>{STATUS_LABEL[last.status]}<span className="muted">, {timeAgo(last.startedAt ?? last.createdAt)}</span></span></>
          : <span className="muted">No recent runs</span>}
      </div>
      <div className="small" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>{runs || ''}</div>
      <div onClick={(e) => e.stopPropagation()}>
        {!w.isArchived && <Switch checked={w.active} label={`${w.active ? 'Deactivate' : 'Activate'} ${w.name}`} disabled={busy || !canEdit} onChange={(v) => actions.toggle(w, v)} />}
      </div>
      <Menu label={`Actions for ${w.name}`}>
        {(close) => (
          <>
            <button type="button" onClick={() => { close(); actions.open(w); }}><Icon name="workflows" size={16} />Open editor</button>
            <Link to={`/executions?workflowId=${w.id}`}><Icon name="executions" size={16} />See runs</Link>
            <Link to={`/activity?workflowId=${w.id}`}><Icon name="history" size={16} />See activity</Link>
            {n8nUrl && <a href={`${n8nUrl}/workflow/${w.id}`} target="_blank" rel="noreferrer"><Icon name="external" size={16} />Open in n8n</a>}
            {canEdit && <>
            <div className="sep" />
            <button type="button" onClick={() => { close(); actions.category(w); }}><Icon name="folder" size={16} />Set category…</button>
            <button type="button" onClick={() => { close(); actions.tags(w); }}><Icon name="pin" size={16} />Edit tags…</button>
            <button type="button" onClick={() => { close(); actions.duplicate(w); }}><Icon name="copy" size={16} />Duplicate</button>
            <div className="sep" />
            {w.isArchived ? (
              <>
                <button type="button" onClick={() => { close(); actions.restore(w); }}><Icon name="retry" size={16} />Restore</button>
                <button type="button" style={{ color: 'var(--bad-text)' }} onClick={() => { close(); actions.remove(w); }}><Icon name="trash" size={16} />Delete permanently</button>
              </>
            ) : (
              <button type="button" style={{ color: 'var(--bad-text)' }} onClick={() => { close(); actions.archive(w); }}><Icon name="trash" size={16} />Archive</button>
            )}
            </>}
          </>
        )}
      </Menu>
    </div>
  );
}
