import { useEffect, useMemo, useState } from 'react';
import { useAudit, useExecution, useExecutions } from '../api/hooks';
import type { Workflow } from '../api/types';
import { ExecutionDetail } from '../components/ExecutionDetail';
import { Icon } from '../components/Icon';
import { Spinner, errMsg } from '../components/ui';
import { executionDuration, nodeRunStates } from '../lib/execution';
import { STATUS_LABEL, dateTime, duration, statusTone, timeAgo } from '../lib/format';
import { toDraft, type Draft } from '../lib/workflow';
import { Canvas } from './Canvas';

const FILTERS: Array<[string, string]> = [['', 'All'], ['error', 'Failed'], ['success', 'Succeeded'], ['running', 'Running']];

/** Runs of one workflow: list, the run drawn on the canvas, and per-step details. */
export function ExecutionsView({ wf, draft, selected, onSelect }: { wf: Workflow; draft: Draft; selected: string | null; onSelect: (id: string | null) => void }) {
  const [status, setStatus] = useState('');
  const [focusNode, setFocusNode] = useState<string | null>(null);
  const [details, setDetails] = useState(true);
  const list = useExecutions({ workflowId: wf.id, status: status || undefined });
  const items = list.data?.pages.flatMap((p) => p.data) ?? [];
  const exec = useExecution(selected);
  const runAudit = useAudit({ entityType: 'workflow', entityId: wf.id }, 200);
  const startedBy = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of runAudit.data?.pages.flatMap((p) => p.data) ?? []) if ((e.action === 'ran' || e.action === 'tested a step') && e.details?.executionId) m.set(String(e.details.executionId), e.user);
    return m;
  }, [runAudit.data]);
  const overlay = useMemo(() => (exec.data ? nodeRunStates(exec.data) : null), [exec.data]);

  // Open the newest run by default.
  useEffect(() => { if (!selected && items[0]) onSelect(items[0].id); }, [selected, items[0]?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const runDraft = exec.data?.workflowData?.nodes
    ? toDraft({ name: wf.name, nodes: exec.data.workflowData.nodes, connections: exec.data.workflowData.connections ?? {}, settings: {} })
    : draft;

  return (
    <div className="editor-body">
      <div className="side-list runs-list">
        <div className="runs-filter" role="group" aria-label="Filter runs">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" className={`tag-chip${status === k ? ' on' : ''}`} aria-pressed={status === k} onClick={() => { setStatus(k); onSelect(null); }}>{l}</button>
          ))}
        </div>
        {list.isLoading && <div className="center"><Spinner /></div>}
        {list.error && <div className="empty">Couldn't load runs: {errMsg(list.error)}</div>}
        {!list.isLoading && items.length === 0 && <div className="empty">{status ? 'No runs with this status.' : 'This workflow has not run yet. Use Run once on the canvas to test it.'}</div>}
        {items.map((e) => {
          const tone = statusTone(e.status);
          return (
            <button key={e.id} type="button" className={`run-row${selected === e.id ? ' on' : ''}`} aria-pressed={selected === e.id} onClick={() => { setFocusNode(null); onSelect(e.id); }}>
              <span className={`run-icon ${tone}`} aria-hidden="true">
                <Icon name={tone === 'ok' ? 'check' : tone === 'bad' ? 'alert' : tone === 'live' ? 'play' : 'stop'} size={14} stroke={2.4} />
              </span>
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="run-title">{STATUS_LABEL[e.status]}<span className="muted"> #{e.id}</span></span>
                <span className="small muted" title={dateTime(e.startedAt ?? e.createdAt)}>{timeAgo(e.startedAt ?? e.createdAt)}, {startedBy.get(e.id) ? `by ${startedBy.get(e.id)}` : e.mode}{e.retryOf ? `, retry of #${e.retryOf}` : ''}</span>
              </span>
              <span className="small" style={{ color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>{duration(executionDuration(e))}</span>
            </button>
          );
        })}
        {list.hasNextPage && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button type="button" className="btn sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'Load older runs'}</button>
          </div>
        )}
      </div>

      <div className="editor-stage">
        {selected && exec.data ? (
          <>
            <Canvas draft={runDraft} readOnly overlay={overlay} onOpenNode={(n) => { setFocusNode(n); if (n) setDetails(true); }} activeNode={focusNode} fitKey={selected} />
            <div className="stage-note">Click a step to see what it received and returned.</div>
            {!details && <button type="button" className="btn stage-toggle" onClick={() => setDetails(true)}>Show details</button>}
          </>
        ) : <div className="empty" style={{ marginTop: 120 }}>{selected ? <Spinner /> : 'Pick a run to see how it went.'}</div>}
      </div>

      {selected && details && (
        <aside className="side" aria-label="Run details">
          <div className="side-head">
            <h3 className="grow">Run details</h3>
            <button type="button" className="btn ghost icon" aria-label="Hide details" onClick={() => setDetails(false)}><Icon name="close" /></button>
          </div>
          <div className="side-body">
            <ExecutionDetail key={selected} id={selected} showOpenLink={false} focusNode={focusNode} onDeleted={() => onSelect(null)} />
          </div>
        </aside>
      )}
    </div>
  );
}
