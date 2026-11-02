import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWorkflows } from '../api/hooks';
import { ExecutionDetail } from '../components/ExecutionDetail';
import { ExecutionList, STATUSES } from '../components/ExecutionList';
import { STATUS_LABEL } from '../lib/format';

export function ExecutionsPage() {
  const [params, setParams] = useSearchParams();
  const wfs = useWorkflows();
  const workflowId = params.get('workflowId') || '';
  const status = params.get('status') || '';
  const selected = params.get('id');
  const byId = useMemo(() => new Map((wfs.data ?? []).map((w) => [w.id, w])), [wfs.data]);

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'id') next.delete('id');
    setParams(next, { replace: true });
  };

  return (
    <div className="page" style={{ maxWidth: 1440 }}>
      <header className="page-head">
        <div>
          <div className="eyebrow">Live · refreshes every 5 seconds</div>
          <h1>Executions</h1>
        </div>
        <div className="row wrap">
          <label className="sr-only" htmlFor="ex-wf">Workflow</label>
          <select id="ex-wf" className="select" style={{ width: 240 }} value={workflowId} onChange={(e) => set('workflowId', e.target.value)}>
            <option value="">All workflows</option>
            {(wfs.data ?? []).filter((w) => !w.isArchived).sort((a, b) => a.name.localeCompare(b.name)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="ex-st">Status</label>
          <select id="ex-st" className="select" style={{ width: 160 }} value={status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s ? STATUS_LABEL[s] : 'Any status'}</option>)}
          </select>
        </div>
      </header>
      <div className="row wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
        <div style={{ flex: '1 1 380px', minWidth: 0, maxWidth: 520 }}>
          <ExecutionList filter={{ workflowId: workflowId || undefined, status: status || undefined }} selected={selected} onSelect={(id) => set('id', id)} workflows={byId} />
        </div>
        <div className="card pad" style={{ flex: '2 1 520px', minWidth: 0 }}>
          {selected ? <ExecutionDetail key={selected} id={selected} onDeleted={() => set('id', '')} /> : <div className="empty">Select an execution to see what each module did.</div>}
        </div>
      </div>
    </div>
  );
}
