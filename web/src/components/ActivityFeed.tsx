import { Link } from 'react-router-dom';
import { useAudit, type AuditFilter } from '../api/hooks';
import type { AuditEntry } from '../api/types';
import { changeSummary, subject } from '../lib/activity';
import { dateTime, timeAgo } from '../lib/format';
import { Avatar } from '../lib/session';
import { Spinner, errMsg } from './ui';

function dayKey(iso: string) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function EntryLine({ e, compact }: { e: AuditEntry; compact?: boolean }) {
  const subj = compact && e.entityType === 'workflow' ? '' : subject(e);
  const summary = changeSummary(e);
  const wfId = e.entityType === 'workflow' ? e.entityId : e.entityType === 'execution' ? e.details?.workflowId : null;
  const href = wfId && e.action !== 'deleted' ? `/workflows/${wfId}${e.entityType === 'execution' || e.action === 'ran' || e.action === 'tested a step' ? `?tab=executions${e.details?.executionId ? `&exec=${e.details.executionId}` : ''}` : ''}` : null;
  return (
    <li className="feed-item">
      <Avatar name={e.user} size={compact ? 26 : 32} />
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="feed-text">
          <strong>{e.user}</strong> {e.action}{' '}
          {subj && (href && !compact ? <Link to={href}>{subj}</Link> : <span>{subj}</span>)}
        </div>
        {summary && <div className="small muted feed-summary">{summary}</div>}
      </div>
      <time className="small muted" dateTime={e.ts} title={dateTime(e.ts)}>{timeAgo(e.ts)}</time>
    </li>
  );
}

/** Live activity log, grouped by day, with paging. */
export function ActivityFeed({ filter, compact, empty }: { filter: AuditFilter; compact?: boolean; empty?: string }) {
  const q = useAudit(filter, compact ? 30 : 50);
  const items = q.data?.pages.flatMap((p) => p.data) ?? [];
  if (q.isLoading) return <div className="center" style={{ minHeight: 120 }}><Spinner /></div>;
  if (q.error) return <div className="empty">Couldn't load activity: {errMsg(q.error)}</div>;
  if (!items.length) return <div className="empty">{empty ?? 'Nothing here yet. Changes made in HappyN8 show up here.'}</div>;

  const groups: Array<[string, AuditEntry[]]> = [];
  for (const e of items) {
    const k = dayKey(e.ts);
    const last = groups[groups.length - 1];
    if (last && last[0] === k) last[1].push(e); else groups.push([k, [e]]);
  }
  return (
    <div className={`feed${compact ? ' compact' : ''}`}>
      {groups.map(([day, list]) => (
        <section key={day}>
          <h3 className="feed-day">{day}</h3>
          <ul>{list.map((e) => <EntryLine key={e.id} e={e} compact={compact} />)}</ul>
        </section>
      ))}
      {q.hasNextPage && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <button type="button" className="btn sm" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>{q.isFetchingNextPage ? 'Loading…' : 'Show older activity'}</button>
        </div>
      )}
    </div>
  );
}
