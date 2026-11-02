import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { n8n } from '../api/client';
import { useExecution } from '../api/hooks';
import type { Execution } from '../api/types';
import { nodeIO, runOrder, executionDuration } from '../lib/execution';
import { dateTime, duration } from '../lib/format';
import { Icon } from './Icon';
import { ItemsView, JsonView } from './DataView';
import { NodeIcon, Spinner, StatusChip, errMsg, useToast } from './ui';
import { useCanEdit } from '../lib/session';

function nodeType(exec: Execution, name: string): string {
  return exec.workflowData?.nodes?.find((n) => n.name === name)?.type ?? 'unknown';
}

export function NodeRunData({ exec, name }: { exec: Execution; name: string }) {
  const [run, setRun] = useState(0);
  const io = nodeIO(exec, name, run);
  if (!io) return <div className="muted small">This module did not run in this execution.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {io.runCount > 1 && (
        <label className="row small">Run
          <select className="select" style={{ width: 'auto' }} value={run} onChange={(e) => setRun(Number(e.target.value))}>
            {Array.from({ length: io.runCount }, (_, i) => <option key={i} value={i}>{i + 1} of {io.runCount}</option>)}
          </select>
        </label>
      )}
      {io.error && (
        <div className="notice bad">
          <strong>{io.error.message || 'Error'}</strong>
          {io.error.description && <div style={{ marginTop: 4 }}>{io.error.description}</div>}
        </div>
      )}
      <ItemsView title="Input" items={io.input} extra={io.inputFrom ? <span className="muted small">from {io.inputFrom}</span> : null} />
      {io.outputs.length === 0 && <ItemsView title="Output" items={[]} />}
      {io.outputs.map((items, i) => (
        <ItemsView key={i} title={io.outputs.length > 1 ? `Output ${i + 1}` : 'Output'} items={items}
          extra={io.outputType !== 'main' ? <span className="chip">{io.outputType}</span> : null} />
      ))}
    </div>
  );
}

/** Full view of one execution: module chain, per-module status, data and actions. */
export function ExecutionDetail({ id, showOpenLink = true, onSelectNode, onDeleted, focusNode }: {
  id: string;
  focusNode?: string | null;
  showOpenLink?: boolean;
  onSelectNode?: (name: string) => void;
  onDeleted?: () => void;
}) {
  const q = useExecution(id);
  const qc = useQueryClient();
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(false);
  const canEdit = useCanEdit();
  useEffect(() => { if (focusNode) setSelected(focusNode); }, [focusNode]);

  if (q.isLoading) return <div className="center"><Spinner /></div>;
  if (q.error || !q.data) return <div className="empty">Could not load execution: {errMsg(q.error)}</div>;
  const e = q.data;
  const order = runOrder(e);
  const topError = e.data?.resultData?.error;
  const live = e.status === 'running' || e.status === 'waiting' || e.status === 'new';

  async function act(label: string, fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast(done, 'ok');
      await qc.invalidateQueries({ queryKey: ['executions'] });
      await qc.invalidateQueries({ queryKey: ['execution', id] });
    } catch (err) {
      toast(`${label} failed: ${errMsg(err)}`, 'bad');
    } finally {
      setBusy(false);
    }
  }

  const pick = (name: string) => { setSelected(name); onSelectNode?.(name); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
      <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>{e.workflowData?.name ?? `Workflow ${e.workflowId}`}</h2>
          <div className="small muted" style={{ marginTop: 4 }}>
            #{e.id} · {e.mode} · {dateTime(e.startedAt ?? e.createdAt)} · {duration(executionDuration(e))}
            {e.retryOf && <> · retry of #{e.retryOf}</>}
            {e.retrySuccessId && <> · retried successfully as #{e.retrySuccessId}</>}
          </div>
        </div>
        <StatusChip status={e.status} />
      </div>

      {order.length > 0 && (
        <div className="row wrap" style={{ padding: 16, borderRadius: 14, background: 'var(--sunken)', gap: 4 }}>
          {order.map(({ name, info }, i) => (
            <div key={name} className="row" style={{ gap: 4 }}>
              <button type="button" onClick={() => pick(name)} title={name}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 84, background: 'none', border: 0, cursor: 'pointer', padding: 4, borderRadius: 10, outline: selected === name ? '2px solid var(--accent)' : undefined }}>
                <span style={{ position: 'relative', borderRadius: '50%', boxShadow: info.state === 'error' ? '0 0 0 3px var(--sunken), 0 0 0 5px var(--bad)' : info.state === 'running' ? '0 0 0 3px var(--sunken), 0 0 0 5px var(--accent)' : undefined }}>
                  <NodeIcon type={nodeType(e, name)} size={44} />
                  <span className="chip" style={{ position: 'absolute', top: -6, right: -10, height: 20, padding: '0 6px', background: info.state === 'error' ? 'var(--bad)' : 'var(--ok)', color: '#fff' }}>{info.items}</span>
                </span>
                <span className="small" style={{ textAlign: 'center', lineHeight: 1.25, maxWidth: 84, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </button>
              {i < order.length - 1 && <span style={{ width: 16, borderTop: '3px dotted var(--edge)', marginBottom: 22 }} />}
            </div>
          ))}
        </div>
      )}

      {topError && (
        <div className="notice bad">
          <strong>{topError.node?.name ? `${topError.node.name}: ` : ''}{topError.message}</strong>
          {topError.description && <div style={{ marginTop: 4 }}>{topError.description}</div>}
        </div>
      )}
      {e.dataTooLargeToDisplay && <div className="notice">This execution's data is too large to display.</div>}
      {!e.data && !live && <div className="notice">No data was saved for this execution (check the workflow's “save execution data” settings).</div>}

      <div className="row wrap">
        {canEdit && (e.status === 'error' || e.status === 'crashed' || e.status === 'canceled') && (
          <>
            <button type="button" className="btn primary" disabled={busy} onClick={() => act('Retry', () => n8n.post(`/executions/${e.id}/retry`, { loadWorkflow: true }), 'Retry started with the current workflow')}>
              <Icon name="retry" size={16} />Retry with current workflow
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => act('Retry', () => n8n.post(`/executions/${e.id}/retry`, { loadWorkflow: false }), 'Retry started with the original workflow')}>
              Retry with original
            </button>
          </>
        )}
        {canEdit && live && (
          <button type="button" className="btn danger" disabled={busy} onClick={() => act('Stop', () => n8n.post(`/executions/${e.id}/stop`), 'Execution stopped')}>
            <Icon name="stop" size={14} />Stop
          </button>
        )}
        {showOpenLink && <Link className="btn" to={`/workflows/${e.workflowId}?tab=executions&exec=${e.id}`}>Open in editor</Link>}
        <button type="button" className="btn ghost" onClick={() => setRaw(!raw)}><Icon name="code" size={16} />{raw ? 'Hide' : 'Raw'} JSON</button>
        {canEdit && !live && (
          <button type="button" className="btn ghost danger" disabled={busy} onClick={() => {
            if (window.confirm(`Delete execution #${e.id}?`)) act('Delete', () => n8n.del(`/executions/${e.id}`), 'Execution deleted').then(onDeleted);
          }}><Icon name="trash" size={16} />Delete</button>
        )}
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="list-row list-head" style={{ gridTemplateColumns: 'minmax(0,1fr) 100px 80px 80px' }}>
          <span>Module</span><span>Status</span><span>Items</span><span>Time</span>
        </div>
        {order.length === 0 && <div className="empty">No module ran.</div>}
        {order.map(({ name, info }) => (
          <div key={name} className={`list-row clickable${selected === name ? ' selected' : ''}`} style={{ gridTemplateColumns: 'minmax(0,1fr) 100px 80px 80px', padding: '10px 16px' }} onClick={() => pick(name)}>
            <span className="row" style={{ minWidth: 0 }}><NodeIcon type={nodeType(e, name)} size={26} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{name}</span>{info.runs > 1 && <span className="chip">{info.runs} runs</span>}</span>
            <span className="small" style={{ color: info.state === 'error' ? 'var(--bad-text)' : info.state === 'success' ? 'var(--ok-text)' : 'var(--accent-text)', fontWeight: 600 }}>
              {info.state === 'success' ? 'Success' : info.state === 'error' ? 'Error' : info.state === 'running' ? 'Running' : 'Waiting'}
            </span>
            <span className="small">{info.items}</span>
            <span className="small">{duration(info.timeMs)}</span>
          </div>
        ))}
      </div>

      {selected && !onSelectNode && (
        <div className="card pad">
          <div className="row" style={{ marginBottom: 14 }}><NodeIcon type={nodeType(e, selected)} size={30} /><h3>{selected}</h3>
            <button type="button" className="btn ghost sm icon" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={() => setSelected(null)}><Icon name="close" size={16} /></button>
          </div>
          <NodeRunData exec={e} name={selected} />
        </div>
      )}
      {raw && <div className="card pad" style={{ maxHeight: 500, overflow: 'auto' }}><JsonView value={e} /></div>}
    </div>
  );
}
