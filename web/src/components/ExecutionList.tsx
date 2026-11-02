import { useExecutions, type ExecFilter } from '../api/hooks';
import type { Workflow } from '../api/types';
import { executionDuration } from '../lib/execution';
import { duration, timeAgo, statusTone, STATUS_LABEL } from '../lib/format';
import { Spinner, errMsg } from './ui';

export const STATUSES = ['', 'success', 'error', 'running', 'waiting', 'canceled', 'crashed'];

/** Paged list of executions with live refresh. */
export function ExecutionList({ filter, selected, onSelect, workflows }: {
  filter: ExecFilter;
  selected: string | null;
  onSelect: (id: string) => void;
  workflows?: Map<string, Workflow>;
}) {
  const q = useExecutions(filter);
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {q.isLoading && <div className="center"><Spinner /></div>}
      {q.error && <div className="empty">Could not load executions: {errMsg(q.error)}</div>}
      {!q.isLoading && !q.error && items.length === 0 && <div className="empty">No executions yet.</div>}
      {items.map((e) => {
        const tone = statusTone(e.status);
        const name = workflows?.get(e.workflowId)?.name;
        return (
          <button key={e.id} type="button" onClick={() => onSelect(e.id)} aria-pressed={selected === e.id}
            className={`list-row clickable${selected === e.id ? ' selected' : ''}`}
            style={{ gridTemplateColumns: '10px minmax(0,1fr) auto', width: '100%', border: 0, borderBottom: '1px solid var(--border)', background: selected === e.id ? 'var(--accent-soft)' : 'transparent', textAlign: 'left', padding: '12px 16px' }}>
            <span className={`dot ${tone}`} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name ?? `#${e.id}`}{name && <span className="muted" style={{ fontWeight: 400 }}> · #{e.id}</span>}
              </span>
              <span className="small muted">{STATUS_LABEL[e.status]} · {timeAgo(e.startedAt ?? e.createdAt)} · {e.mode}{e.retryOf ? ` · retry of #${e.retryOf}` : ''}</span>
            </span>
            <span className="small" style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)' }}>{duration(executionDuration(e))}</span>
          </button>
        );
      })}
      {q.hasNextPage && (
        <div style={{ padding: 12, textAlign: 'center' }}>
          <button type="button" className="btn sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
            {q.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
