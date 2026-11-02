import { useSearchParams } from 'react-router-dom';
import { usePeople, useWorkflows } from '../api/hooks';
import { ActivityFeed } from '../components/ActivityFeed';
import { Icon } from '../components/Icon';
import { ACTION_FILTERS } from '../lib/activity';

/** Who changed what in HappyN8, across workflows, credentials, categories and users. */
export function ActivityPage() {
  const [params, setParams] = useSearchParams();
  const people = usePeople();
  const wfs = useWorkflows();
  const userId = params.get('userId') || '';
  const entityType = params.get('type') || '';
  const workflowId = params.get('workflowId') || '';
  const q = params.get('q') || '';

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <header className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>Every change made through HappyN8, with who made it. Changes made directly in n8n aren't listed.</p>
        </div>
      </header>
      <div className="row wrap" style={{ gap: 8 }}>
        <label className="search" style={{ minWidth: 220 }}>
          <Icon name="search" size={16} /><span className="sr-only">Search activity</span>
          <input type="search" placeholder="Search names" value={q} onChange={(e) => set('q', e.target.value)} />
        </label>
        <label className="sr-only" htmlFor="act-user">Person</label>
        <select id="act-user" className="select" style={{ width: 180 }} value={userId} onChange={(e) => set('userId', e.target.value)}>
          <option value="">Everyone</option>
          {(people.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
        </select>
        <label className="sr-only" htmlFor="act-type">Kind</label>
        <select id="act-type" className="select" style={{ width: 200 }} value={workflowId ? 'workflow' : entityType} disabled={!!workflowId} onChange={(e) => set('type', e.target.value)}>
          {ACTION_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <label className="sr-only" htmlFor="act-wf">Workflow</label>
        <select id="act-wf" className="select" style={{ width: 220 }} value={workflowId} onChange={(e) => set('workflowId', e.target.value)}>
          <option value="">Any workflow</option>
          {(wfs.data ?? []).sort((a, b) => a.name.localeCompare(b.name)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div className="card pad">
        <ActivityFeed filter={{ userId: userId || undefined, entityType: workflowId ? 'workflow' : entityType || undefined, entityId: workflowId || undefined, q: q || undefined }} />
      </div>
    </div>
  );
}
